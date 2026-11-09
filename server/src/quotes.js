import { randomUUID } from 'node:crypto';
import { haversine } from './geo.js';
import { LOCAL_RADIUS_M, priceRoute } from './pricing.js';

export const QUOTE_TTL_MS = 5 * 60 * 1000;
const SAME_PLACE_M = 150;

const pt = (p) => ({ lat: p.lat, lng: p.lng });

/**
 * Cotações com preço garantido: o passageiro paga exactamente o que viu,
 * desde que peça a viagem dentro de 5 minutos e com os mesmos locais (e paragens).
 *
 * route(origin, destination, stops) -> { distanceMeters, durationSeconds, staticDurationSeconds?, polyline }
 * surface.analyse(polyline, m)      -> { sandMeters, pickupSand, dropoffSand, sandRatio } | null
 * weather.current()                 -> { rain: 'none'|'fraca'|'forte', multiplier } | null
 * demand(category, point)           -> multiplicador de procura na zona (>= 1)
 * learning(category, point)         -> factor aprendido (0,9 a 1,2)
 * pickup(category, point)           -> metros do motorista livre mais próximo (ou null)
 * onQuote(point)                    -> regista a cotação (estatísticas)
 */
export function createQuoteService({
  route,
  surface = null,
  weather = null,
  demand = () => 1,
  learning = () => 1,
  pickup = () => null,
  onQuote = () => {},
  clock = () => new Date(),
  ttlMs = QUOTE_TTL_MS,
}) {
  const store = new Map(); // quoteId -> { origin, destination, stops, value, expiresAt }

  function sweep(nowMs) {
    for (const [id, q] of store) if (q.expiresAt < nowMs) store.delete(id);
  }

  /** Preço de UMA rota já calculada; guarda a cotação (com o seu próprio quoteId). */
  async function priceOne(r, origin, destination, via, ctx) {
    const polyline = Array.isArray(r.polyline) ? r.polyline : [origin, ...via, destination];

    // Piso do percurso (areia): nunca impede a cotação
    let sand = null;
    if (surface) {
      try {
        sand = await surface.analyse(polyline, r.distanceMeters);
      } catch {
        sand = null;
      }
    }

    const priced = priceRoute(r, {
      date: ctx.date,
      demand: ctx.demand,
      learning: ctx.learning,
      pickup: ctx.pickup,
      stops: via.length,
      sandMeters: sand?.sandMeters ?? 0,
      rain: ctx.wx?.multiplier ?? 1,
      local: ctx.local,
    });
    const value = {
      quoteId: randomUUID(),
      expiresAt: ctx.nowMs + ttlMs,
      validForSeconds: Math.round(ttlMs / 1000),
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
      staticDurationSeconds: r.staticDurationSeconds ?? r.durationSeconds,
      polyline,
      stops: via,
      surface: sand
        ? {
            sandMeters: sand.sandMeters,
            sandRatio: sand.sandRatio,
            pickupSand: !!sand.pickupSand,
            dropoffSand: !!sand.dropoffSand,
          }
        : null,
      ...priced,
      rain: ctx.wx && ctx.wx.rain !== 'none' ? { level: ctx.wx.rain, multiplier: ctx.wx.multiplier } : null,
    };
    store.set(value.quoteId, {
      origin: pt(origin),
      destination: pt(destination),
      stops: via,
      value,
      expiresAt: value.expiresAt,
    });
    return value;
  }

  /**
   * Cotação da rota principal + `routes`: todas as rotas possíveis (até 3, a principal
   * primeiro), cada uma com o seu preço e quoteId, para o passageiro escolher a mais barata.
   */
  async function quote(origin, destination, stops = []) {
    const via = (Array.isArray(stops) ? stops : []).map(pt);
    const r = await route(origin, destination, via);

    let wx = null;
    try {
      wx = weather?.current?.() ?? null;
    } catch {
      wx = null;
    }

    const date = clock();
    const nowMs = date.getTime();
    const safe = (fn, def) => (c) => {
      try {
        return fn(c, origin);
      } catch {
        return def;
      }
    };
    // procura, aprendizagem e motorista mais perto: calculados UMA vez para todas as rotas
    const once = (fn) => {
      const memo = new Map();
      return (c) => {
        if (!memo.has(c)) memo.set(c, fn(c));
        return memo.get(c);
      };
    };
    const ctx = {
      date,
      nowMs,
      wx,
      demand: once(safe(demand, 1)),
      learning: once(safe(learning, 1)),
      pickup: once(safe(pickup, null)),
      // tarifa de bairro: destino e paragens perto do ponto de partida
      local: haversine(origin, destination) <= LOCAL_RADIUS_M && via.every((p) => haversine(origin, p) <= LOCAL_RADIUS_M),
    };

    sweep(nowMs);
    const alts = Array.isArray(r.alternatives) ? r.alternatives.filter((a) => a?.distanceMeters > 0) : [];
    const priced = await Promise.all([r, ...alts].map((x) => priceOne(x, origin, destination, via, ctx)));
    // rotas quase iguais (mesma distância e tempo) não ajudam a escolher
    const routes = priced.filter(
      (q, i) =>
        !priced
          .slice(0, i)
          .some(
            (o) =>
              Math.abs(o.distanceMeters - q.distanceMeters) < 100 &&
              Math.abs(o.durationSeconds - q.durationSeconds) < 60,
          ),
    );
    try {
      onQuote(origin);
    } catch {
      // as estatísticas nunca impedem a cotação
    }
    return { ...routes[0], routes };
  }

  /** Cotação guardada, se ainda válida e para os mesmos locais e paragens; senão null. */
  function lookup(quoteId, origin, destination, stops = []) {
    if (typeof quoteId !== 'string') return null;
    const q = store.get(quoteId);
    if (!q || q.expiresAt < clock().getTime()) return null;
    if (haversine(q.origin, origin) > SAME_PLACE_M) return null;
    if (haversine(q.destination, destination) > SAME_PLACE_M) return null;
    const via = Array.isArray(stops) ? stops : [];
    if (via.length !== q.stops.length) return null;
    if (via.some((s, i) => haversine(q.stops[i], s) > SAME_PLACE_M)) return null;
    return q.value;
  }

  return { quote, lookup, size: () => store.size };
}
