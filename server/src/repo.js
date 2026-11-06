/**
 * Gravação de dados da Boleia. Duas versões com a mesma interface:
 *  - createPgRepo(pool): grava no PostgreSQL
 *  - createMemoryRepo():  sem base de dados (testes / falha da base de dados)
 *
 * Nunca bloqueia nem faz falhar uma viagem: todos os erros são registados e ignorados.
 */

/**
 * Número de WhatsApp de Moçambique em formato internacional (+2588XXXXXXXX),
 * ou null se inválido. Aceita "84 123 4567", "+258 84 123 4567", "258841234567"...
 * Redes móveis: 82, 83, 84, 85, 86, 87.
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00258')) d = d.slice(5);
  else if (d.startsWith('258') && d.length === 12) d = d.slice(3);
  return /^8[2-7]\d{7}$/.test(d) ? `+258${d}` : null;
}

const cleanName = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, 60) : '');

export function createMemoryRepo() {
  const passengers = new Map();
  const drivers = new Map();
  const rides = new Map();
  return {
    kind: 'memoria',
    async savePassenger({ phone, name }) {
      passengers.set(phone, { phone, name: cleanName(name) });
    },
    /** Guarda o motorista e devolve a avaliação acumulada { rating, ratingCount }. */
    async saveDriver({ phone, name, car, plate, category }) {
      const prev = drivers.get(phone);
      const row = { phone, name: cleanName(name), car, plate, category, rating: prev?.rating ?? 4.8, ratingCount: prev?.ratingCount ?? 5 };
      drivers.set(phone, row);
      return { rating: row.rating, ratingCount: row.ratingCount };
    },
    async rateDriver(phone, stars) {
      const d = drivers.get(phone);
      if (!d) return null;
      d.rating = (d.rating * d.ratingCount + stars) / (d.ratingCount + 1);
      d.ratingCount += 1;
      return { rating: d.rating, ratingCount: d.ratingCount };
    },
    async saveRide(r) {
      rides.set(r.id, { ...r });
    },
    async setRideRating(id, stars) {
      const r = rides.get(id);
      if (r) r.rating = stars;
    },
    // para testes / diagnóstico
    _passengers: passengers,
    _drivers: drivers,
    _rides: rides,
  };
}

export function createPgRepo(pool, { log = console.log } = {}) {
  const safe = (what, fn) => async (...a) => {
    try {
      return await fn(...a);
    } catch (e) {
      log(`[boleia] base de dados: falha a ${what} (${e.message})`);
      return null;
    }
  };
  return {
    kind: 'postgres',
    savePassenger: safe('guardar passageiro', async ({ phone, name }) => {
      await pool.query(
        `INSERT INTO passengers (phone, name) VALUES ($1, $2)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
        [phone, cleanName(name)],
      );
    }),
    saveDriver: safe('guardar motorista', async ({ phone, name, car, plate, category }) => {
      const r = await pool.query(
        `INSERT INTO drivers (phone, name, car, plate, category) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, car = EXCLUDED.car, plate = EXCLUDED.plate,
           category = EXCLUDED.category, updated_at = now()
         RETURNING rating, rating_count`,
        [phone, cleanName(name), car ?? '', plate ?? '', category],
      );
      const row = r.rows[0];
      return row ? { rating: Number(row.rating), ratingCount: Number(row.rating_count) } : null;
    }),
    rateDriver: safe('guardar avaliação', async (phone, stars) => {
      const r = await pool.query(
        `UPDATE drivers SET rating = (rating * rating_count + $2) / (rating_count + 1),
           rating_count = rating_count + 1, updated_at = now()
         WHERE phone = $1 RETURNING rating, rating_count`,
        [phone, stars],
      );
      const row = r.rows[0];
      return row ? { rating: Number(row.rating), ratingCount: Number(row.rating_count) } : null;
    }),
    saveRide: safe('guardar viagem', async (r) => {
      await pool.query(
        `INSERT INTO rides (id, driver_phone, category, payment, status, price, driver_earnings, platform_fee,
           distance_m, duration_s, period, zone, cancelled_by, created_at, ended_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, driver_phone = EXCLUDED.driver_phone,
           cancelled_by = EXCLUDED.cancelled_by, ended_at = EXCLUDED.ended_at`,
        [
          r.id,
          r.driverPhone ?? null,
          r.category,
          r.payment,
          r.status,
          Math.round(r.price ?? 0),
          Math.round(r.driverEarnings ?? 0),
          Math.round(r.platformFee ?? 0),
          Math.round(r.distanceMeters ?? 0),
          Math.round(r.durationSeconds ?? 0),
          r.period ?? null,
          r.zone ?? null,
          r.cancelledBy ?? null,
          new Date(r.createdAt),
          new Date(r.endedAt ?? Date.now()),
        ],
      );
    }),
    setRideRating: safe('guardar avaliação da viagem', async (id, stars) => {
      await pool.query('UPDATE rides SET rating = $2 WHERE id = $1', [id, stars]);
    }),
  };
}
