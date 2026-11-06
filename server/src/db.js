/**
 * Base de dados da Boleia (PostgreSQL: Neon, Render ou outro).
 *
 * Tabelas (criadas automaticamente no arranque, se não existirem):
 *  - passengers     clientes: SÓ nome e número de WhatsApp
 *  - drivers        motoristas: nome, WhatsApp, carro, matrícula, categoria, avaliação
 *  - rides          viagens terminadas, SEM moradas nem identificação do passageiro:
 *                   categoria, pagamento, estado, valores (total / motorista / plataforma),
 *                   distância, duração, horário, zona, avaliação
 *  - pricing_stats  estatísticas da aprendizagem de preços
 */

const TABLES = {
  passengers: `CREATE TABLE passengers (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  drivers: `CREATE TABLE drivers (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    car TEXT NOT NULL DEFAULT '',
    plate TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    rating DOUBLE PRECISION NOT NULL DEFAULT 4.8,
    rating_count INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  rides: `CREATE TABLE rides (
    id TEXT PRIMARY KEY,
    driver_phone TEXT,
    category TEXT NOT NULL,
    payment TEXT NOT NULL,
    status TEXT NOT NULL,
    price INTEGER NOT NULL,
    driver_earnings INTEGER NOT NULL,
    platform_fee INTEGER NOT NULL,
    distance_m INTEGER NOT NULL,
    duration_s INTEGER NOT NULL,
    period TEXT,
    zone TEXT,
    cancelled_by TEXT,
    rating SMALLINT,
    created_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  pricing_stats: `CREATE TABLE pricing_stats (
    key TEXT PRIMARY KEY,
    quotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    requests DOUBLE PRECISION NOT NULL DEFAULT 0,
    accepted DOUBLE PRECISION NOT NULL DEFAULT 0,
    declined DOUBLE PRECISION NOT NULL DEFAULT 0,
    expired DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`,
};

const INDEXES = [
  ['rides_created_at_idx', 'CREATE INDEX rides_created_at_idx ON rides (created_at)'],
  ['rides_driver_phone_idx', 'CREATE INDEX rides_driver_phone_idx ON rides (driver_phone)'],
];

/** Converte um endereço JDBC (jdbc:postgresql://host/db?user=..&password=..) para o formato do Node. */
export function toNodeUrl(url) {
  if (!url) return url;
  let u;
  try {
    u = new URL(url.startsWith('jdbc:') ? url.slice('jdbc:'.length) : url);
  } catch {
    return url;
  }
  const user = u.searchParams.get('user');
  const pass = u.searchParams.get('password');
  if (user) u.username = encodeURIComponent(user);
  if (pass) u.password = encodeURIComponent(pass);
  u.searchParams.delete('user');
  u.searchParams.delete('password');
  u.searchParams.delete('channelBinding'); // parâmetro só do JDBC
  // "require" verifica pouco: usa a verificação completa do certificado (Neon, Render… têm certificados válidos)
  if (['require', 'prefer', 'verify-ca'].includes(u.searchParams.get('sslmode'))) u.searchParams.set('sslmode', 'verify-full');
  return u.toString().replace(/^postgresql:/, 'postgres:');
}

/** Cria as tabelas e índices que faltarem (seguro para correr em cada arranque). */
export async function migrate(pool) {
  const have = new Set(
    (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map(
      (r) => r.table_name,
    ),
  );
  const created = [];
  for (const [name, sql] of Object.entries(TABLES)) {
    if (!have.has(name)) {
      await pool.query(sql);
      created.push(name);
    }
  }
  for (const [name, sql] of INDEXES) {
    try {
      const r = await pool.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [name]);
      if (!r.rows.length) await pool.query(sql);
    } catch {
      // índices são uma optimização: nunca impedem o arranque
    }
  }
  return created;
}

/**
 * Liga à base de dados e prepara as tabelas. Devolve { pool, close } ou null
 * se não for possível (o servidor continua a funcionar em memória).
 */
export async function connectDb(rawUrl, { log = console.log, pgModule } = {}) {
  const url = toNodeUrl(rawUrl);
  let pool;
  try {
    const pg = pgModule ?? (await import('pg')).default;
    const hasSslMode = /[?&]sslmode=/.test(url ?? '');
    const ssl = !hasSslMode && /render\.com|amazonaws|neon\.tech|supabase/.test(url ?? '') ? { rejectUnauthorized: false } : undefined;
    pool = new pg.Pool({ connectionString: url, ssl, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    pool.on('error', (e) => log(`[boleia] base de dados: ${e.message}`));
    const created = await migrate(pool);
    log(`[boleia] base de dados ligada${created.length ? ` (tabelas criadas: ${created.join(', ')})` : ''}`);
    return {
      pool,
      async close() {
        await pool.end().catch(() => {});
      },
    };
  } catch (e) {
    log(`[boleia] base de dados indisponível (${e.message}); a funcionar só em memória`);
    try {
      await pool?.end();
    } catch {
      // ignora
    }
    return null;
  }
}
