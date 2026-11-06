/**
 * Inteligência de mercado da Boleia:
 *  - ZONAS: Maputo/Matola dividida em quadrículas de ~2 km.
 *  - PROCURA SUAVIZADA: o aumento por falta de carros sobe/desce de forma gradual
 *    (média exponencial ~2 min), para o preço não saltar de segundo a segundo.
 *  - APRENDIZAGEM: por zona, horário e categoria, conta cotações, pedidos e
 *    respostas dos motoristas (aceite / recusa / sem resposta), com "esquecimento"
 *    gradual (meia-vida de 3 dias). Daí sai um factor entre 0,9 e 1,2:
 *      · motoristas recusam muito  -> sobe o preço (o motorista tem de querer ir)
 *      · aceitam quase tudo mas os passageiros desistem ao ver o preço -> desce
 *
 * Os contadores ficam numa "store" (memória ou PostgreSQL). Nunca bloqueia nem
 * falha uma cotação: em caso de erro, o factor é 1.
 */
import { CATEGORIES, demandMultiplier, periodAt } from './pricing.js';

const ZONE_DEG = 0.02; // ~2,2 km
const DEMAND_TAU_MS = 2 * 60 * 1000;
const HALF_LIFE_MS = 3 * 24 * 3600 * 1000;
const MIN_OFFERS = 10;
const MIN_QUOTES = 20;
export const LEARN_MIN = 0.9;
export const LEARN_MAX = 1.2;

export const zoneOf = (p) =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    ? `${Math.round(p.lat / ZONE_DEG)}:${Math.round(p.lng / ZONE_DEG)}`
    : '*';

const EMPTY = () => ({ quotes: 0, requests: 0, accepted: 0, declined: 0, expired: 0, updatedAt: 0 });
const FIELDS = ['quotes', 'requests', 'accepted', 'declined', 'expired'];

/** Store em memória (também usada como cache da store PostgreSQL). */
export function createMemoryStore() {
  const rows = new Map();
  const dirty = new Set();
  return {
    get: (key) => rows.get(key),
    set(key, row) {
      rows.set(key, row);
      dirty.add(key);
    },
    takeDirty() {
      const out = [...dirty].map((k) => [k, rows.get(k)]);
      dirty.clear();
      return out;
    },
    /** Volta a marcar para gravar (sem mexer nos valores, que podem já ser mais recentes). */
    mark: (key) => dirty.add(key),
    load(entries) {
      for (const [k, r] of entries) rows.set(k, r);
    },
    size: () => rows.size,
  };
}

/** Factor aprendido a partir dos contadores (puro, testável). */
export function learnedFactor(offers, quotes) {
  let f = 1;
  const n = offers ? offers.accepted + offers.declined + offers.expired : 0;
  if (n >= MIN_OFFERS) {
    const acceptRate = offers.accepted / n;
    if (acceptRate < 0.6) f += Math.min(0.2, (0.6 - acceptRate) * 0.5);
    else if (acceptRate > 0.85 && quotes && quotes.quotes >= MIN_QUOTES) {
      const conversion = quotes.requests / quotes.quotes;
      if (conversion < 0.3) f -= Math.min(0.1, (0.3 - conversion) * 0.4);
    }
  }
  return Math.round(Math.min(LEARN_MAX, Math.max(LEARN_MIN, f)) * 100) / 100;
}

export function createMarket({ store = createMemoryStore(), clock = () => new Date() } = {}) {
  const smooth = new Map(); // zona|categoria -> { value, at }
  const now = () => clock().getTime();

  /** Lê uma linha já com o esquecimento aplicado até agora. */
  function read(key) {
    const r = store.get(key);
    if (!r) return null;
    const t = now();
    const k = Math.pow(0.5, Math.max(0, t - r.updatedAt) / HALF_LIFE_MS);
    const out = { updatedAt: t };
    for (const f of FIELDS) out[f] = (r[f] || 0) * k;
    return out;
  }

  function bump(key, field) {
    const r = read(key) ?? { ...EMPTY(), updatedAt: now() };
    r[field] += 1;
    store.set(key, r);
  }

  const keys = (kind, point, periodId, category) => {
    const tail = category ? `|${category}` : '';
    return [`${kind}|${zoneOf(point)}|${periodId}${tail}`, `${kind}|*|${periodId}${tail}`];
  };

  /** Regista um acontecimento: quote, request, accepted, declined, expired. */
  function record(event, { point, category, date } = {}) {
    try {
      const periodId = periodAt(date ?? clock()).id;
      if (event === 'quote' || event === 'request') {
        for (const k of keys('q', point, periodId)) bump(k, event === 'quote' ? 'quotes' : 'requests');
      } else if (['accepted', 'declined', 'expired'].includes(event) && CATEGORIES.includes(category)) {
        for (const k of keys('o', point, periodId, category)) bump(k, event);
      }
    } catch {
      // nunca falha por causa das estatísticas
    }
  }

  /** Factor aprendido (zona; se houver poucos dados, a cidade inteira). */
  function learning(category, point, date) {
    try {
      const periodId = periodAt(date ?? clock()).id;
      const [oz, oc] = keys('o', point, periodId, category).map(read);
      const [qz, qc] = keys('q', point, periodId).map(read);
      const enough = (o) => o && o.accepted + o.declined + o.expired >= MIN_OFFERS;
      return learnedFactor(enough(oz) ? oz : oc, qz && qz.quotes >= MIN_QUOTES ? qz : qc);
    } catch {
      return 1;
    }
  }

  /** Procura suavizada na zona: sobe e desce gradualmente para o valor actual. */
  function demand(category, point, waiting, free) {
    const target = demandMultiplier(waiting, free);
    const key = `${zoneOf(point)}|${category}`;
    const t = now();
    const s = smooth.get(key);
    if (!s) {
      smooth.set(key, { value: target, at: t });
      return target;
    }
    const alpha = 1 - Math.exp(-Math.max(0, t - s.at) / DEMAND_TAU_MS);
    const value = s.value + (target - s.value) * alpha;
    smooth.set(key, { value, at: t });
    return Math.round(Math.min(1.3, Math.max(1, value)) * 100) / 100;
  }

  /** Estado resumido (para o painel/diagnóstico). */
  function snapshot(date) {
    const periodId = periodAt(date ?? clock()).id;
    return Object.fromEntries(CATEGORIES.map((c) => [c, learning(c, null, date)]).concat([['period', periodId]]));
  }

  return { record, learning, demand, snapshot, store };
}

// ---------------------------------------------------------------------------
// Persistência em PostgreSQL (Render). Opcional: sem DATABASE_URL usa memória.
// ---------------------------------------------------------------------------

/**
 * Store PostgreSQL: carrega tudo para memória no arranque e grava as linhas
 * alteradas a cada 30 s. Se a base de dados falhar, continua em memória.
 */
export async function createPgStore(url, { log = console.log, flushMs = 30000, pgModule, pool: shared } = {}) {
  const mem = createMemoryStore();
  let pool = shared;
  const ownPool = !shared; // só fecha a ligação se foi aberta aqui
  try {
    if (!pool) {
      const pg = pgModule ?? (await import('pg')).default;
      const ssl = /render\.com|amazonaws|neon\.tech|supabase/.test(url) ? { rejectUnauthorized: false } : undefined;
      pool = new pg.Pool({ connectionString: url, ssl, max: 3, idleTimeoutMillis: 30000 });
      pool.on('error', (e) => log(`[boleia] base de dados: ${e.message}`));
    }
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'pricing_stats'`,
    );
    if (!exists.rows.length) await pool.query(`CREATE TABLE pricing_stats (
      key TEXT PRIMARY KEY,
      quotes DOUBLE PRECISION NOT NULL DEFAULT 0,
      requests DOUBLE PRECISION NOT NULL DEFAULT 0,
      accepted DOUBLE PRECISION NOT NULL DEFAULT 0,
      declined DOUBLE PRECISION NOT NULL DEFAULT 0,
      expired DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0
    )`);
    const { rows } = await pool.query('SELECT * FROM pricing_stats');
    mem.load(
      rows.map((r) => [
        r.key,
        { quotes: +r.quotes, requests: +r.requests, accepted: +r.accepted, declined: +r.declined, expired: +r.expired, updatedAt: +r.updated_at },
      ]),
    );
    log(`[boleia] base de dados ligada (${rows.length} estatísticas de preço carregadas)`);
  } catch (e) {
    log(`[boleia] base de dados indisponível (${e.message}); a aprendizagem fica só em memória`);
    try {
      if (ownPool) await pool?.end();
    } catch {
      // ignora
    }
    return { store: mem, close: async () => {} };
  }

  let busy = false;
  async function flush() {
    if (busy) return;
    const rows = mem.takeDirty();
    if (!rows.length) return;
    busy = true;
    try {
      const values = [];
      const params = [];
      rows.forEach(([k, r], i) => {
        const b = i * 7;
        values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
        params.push(k, r.quotes, r.requests, r.accepted, r.declined, r.expired, Math.round(r.updatedAt));
      });
      await pool.query(
        `INSERT INTO pricing_stats (key,quotes,requests,accepted,declined,expired,updated_at) VALUES ${values.join(',')}
         ON CONFLICT (key) DO UPDATE SET quotes=EXCLUDED.quotes, requests=EXCLUDED.requests, accepted=EXCLUDED.accepted,
         declined=EXCLUDED.declined, expired=EXCLUDED.expired, updated_at=EXCLUDED.updated_at`,
        params,
      );
    } catch (e) {
      log(`[boleia] falha a gravar estatísticas: ${e.message}`);
      for (const [k] of rows) mem.mark(k); // volta a tentar na próxima
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(flush, flushMs);
  timer.unref?.();
  return {
    store: mem,
    flush,
    async close() {
      clearInterval(timer);
      await flush();
      if (ownPool) await pool.end().catch(() => {});
    },
  };
}
