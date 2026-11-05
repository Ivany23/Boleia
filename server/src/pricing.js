/**
 * Motor de preços da Boleia (MZN).
 *
 * Ideia: o passageiro paga o CUSTO REAL da viagem para o motorista (combustível,
 * desgaste do carro, tempo parado no trânsito) mais um ganho justo para o motorista.
 * A comissão da plataforma é somada POR CIMA, para nunca sair do bolso do motorista
 * para o combustível.
 *
 *   porKm  = combustível/km × 1,25 (km vazios até à recolha) + desgaste/km + ganho/km
 *   porMin = combustível ao ralenti/min + ganho/min         (paga o tempo no trânsito)
 *   líquido do motorista = (base + km × porKm + min × porMin) × multiplicador horário
 *   total = líquido / (1 − comissão), mínimo `minimo`, arredondado a 5 MZN
 *
 * Os preços dos combustíveis vêm da ARENE e podem ser actualizados no server/.env
 * (FUEL_GASOLINA_MZN, FUEL_GASOLEO_MZN) sem mexer no código.
 */

const envNum = (name, def, min, max) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min && v <= max ? v : def;
};

/** Preços ARENE em vigor desde 07/05/2026 (MZN por litro). */
export const FUEL = {
  gasolina: envNum('FUEL_GASOLINA_MZN', 93.69, 10, 1000),
  gasoleo: envNum('FUEL_GASOLEO_MZN', 116.25, 10, 1000),
  fonte: process.env.FUEL_FONTE || 'ARENE, 07/05/2026',
};

/** Comissão da plataforma (0,12 = 12%). */
export const PLATFORM_FEE = envNum('PLATFORM_FEE', 0.12, 0, 0.4);

/** Factor de km vazios: o motorista conduz até à recolha sem receber por esses km. */
const DEADHEAD = 1.25;

/**
 * Custos por categoria (carros/motas típicos em Maputo, a gasolina).
 * consumo: L/100 km em cidade; ralenti: L/min parado no trânsito;
 * desgaste: pneus, óleo, manutenção, depreciação (MZN/km).
 */
export const CATEGORY_COSTS = {
  moto: { consumo: 3.0, ralenti: 0.004, desgaste: 1.5, ganhoKm: 2.0, ganhoMin: 0.6, base: 20, minimo: 40 },
  economico: { consumo: 7.5, ralenti: 0.012, desgaste: 3.5, ganhoKm: 3.0, ganhoMin: 1.2, base: 40, minimo: 100 },
  conforto: { consumo: 9.5, ralenti: 0.015, desgaste: 5.0, ganhoKm: 6.0, ganhoMin: 1.8, base: 70, minimo: 150 },
};
export const CATEGORIES = Object.keys(CATEGORY_COSTS);
export const PAYMENTS = ['dinheiro', 'mpesa', 'emola'];

/** Tarifas por km e por minuto, derivadas do preço actual da gasolina. */
export function ratesFor(category, fuelPrice = FUEL.gasolina) {
  const c = CATEGORY_COSTS[category];
  if (!c) throw new Error('Categoria invalida');
  return {
    base: c.base,
    minimo: c.minimo,
    porKm: (c.consumo / 100) * fuelPrice * DEADHEAD + c.desgaste + c.ganhoKm,
    porMin: c.ralenti * fuelPrice + c.ganhoMin,
  };
}

// ---------------------------------------------------------------------------
// Horários (hora de Maputo, UTC+2, sem hora de Verão)
// ---------------------------------------------------------------------------

export const PERIODS = {
  normal: { id: 'normal', label: 'Tarifa normal', multiplier: 1 },
  ponta_manha: { id: 'ponta_manha', label: 'Hora de ponta', multiplier: 1.15 },
  ponta_tarde: { id: 'ponta_tarde', label: 'Hora de ponta', multiplier: 1.2 },
  noite: { id: 'noite', label: 'Tarifa nocturna', multiplier: 1.25 },
};

/** Hora local de Maputo: { day: 0=Dom..6=Sáb, minutes: minutos desde 00:00 }. */
export function maputoTime(date) {
  const d = new Date(date.getTime() + 2 * 3600 * 1000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/**
 * - Noite (todos os dias) 21:00–05:00: ×1,25 (menos motoristas, mais risco)
 * - Ponta da manhã (seg–sex) 06:00–09:00: ×1,15
 * - Ponta da tarde (seg–sex) 16:30–19:30: ×1,20 (EN4, Av. Julius Nyerere, Matola)
 */
export function periodAt(date = new Date()) {
  const { day, minutes } = maputoTime(date);
  const h = (hh, mm = 0) => hh * 60 + mm;
  if (minutes >= h(21) || minutes < h(5)) return PERIODS.noite;
  const weekday = day >= 1 && day <= 5;
  if (weekday && minutes >= h(6) && minutes < h(9)) return PERIODS.ponta_manha;
  if (weekday && minutes >= h(16, 30) && minutes < h(19, 30)) return PERIODS.ponta_tarde;
  return PERIODS.normal;
}

/** Nível de trânsito a partir da duração com trânsito vs. sem trânsito. */
export function trafficLevel(durationSeconds, staticDurationSeconds) {
  if (!(staticDurationSeconds > 0) || !(durationSeconds > 0)) return 'desconhecido';
  const r = durationSeconds / staticDurationSeconds;
  if (r >= 1.5) return 'intenso';
  if (r >= 1.2) return 'moderado';
  return 'livre';
}

/** Factor de procura: pedidos à espera vs. motoristas livres perto (máx. +30%). */
export function demandMultiplier(waiting, freeDrivers) {
  if (!(waiting > 0) || !(freeDrivers > 0)) return 1;
  const ratio = waiting / freeDrivers;
  if (ratio <= 1) return 1;
  return Math.min(1.3, Math.round((1 + (ratio - 1) * 0.1) * 100) / 100);
}

const MAX_MULTIPLIER = 1.6;
const round5 = (n) => Math.round(n / 5) * 5;

/**
 * Tarifa completa de uma categoria.
 * @returns {{ total, driverEarnings, platformFee, multiplier,
 *             breakdown: { base, distance, time, surcharge } }}
 */
export function fareFor(category, distanceMeters, durationSeconds, { multiplier = 1, fuelPrice } = {}) {
  const r = ratesFor(category, fuelPrice);
  const km = Math.max(0, Number(distanceMeters) || 0) / 1000;
  const min = Math.max(0, Number(durationSeconds) || 0) / 60;
  const m = Math.min(MAX_MULTIPLIER, Math.max(1, Number(multiplier) || 1));

  const base = r.base;
  const distance = km * r.porKm;
  const time = min * r.porMin;
  const net = (base + distance + time) * m;
  const total = round5(Math.max(net / (1 - PLATFORM_FEE), r.minimo));
  const platformFee = Math.round(total * PLATFORM_FEE);

  // Repartição visível, escalada para somar exactamente o total
  const raw = { base, distance, time, surcharge: (base + distance + time) * (m - 1) };
  const rawSum = raw.base + raw.distance + raw.time + raw.surcharge;
  const k = rawSum > 0 ? total / rawSum : 0;
  const breakdown = {
    base: Math.round(raw.base * k),
    distance: Math.round(raw.distance * k),
    time: Math.round(raw.time * k),
    surcharge: Math.round(raw.surcharge * k),
  };
  // Acerta arredondamentos para a soma bater certo com o total
  const diff = total - (breakdown.base + breakdown.distance + breakdown.time + breakdown.surcharge);
  breakdown.distance += diff;

  return { total, driverEarnings: total - platformFee, platformFee, multiplier: m, breakdown };
}

export function priceFor(category, distanceMeters, durationSeconds, opts) {
  return fareFor(category, distanceMeters, durationSeconds, opts).total;
}

/**
 * Cotação de todas as categorias para uma rota, num dado momento.
 * demand(category) -> multiplicador de procura (1 a 1,3).
 */
export function priceRoute(route, { date = new Date(), demand = () => 1 } = {}) {
  const period = periodAt(date);
  const fares = {};
  const prices = {};
  let demandMax = 1;
  for (const c of CATEGORIES) {
    const dm = Math.max(1, Number(demand(c)) || 1);
    demandMax = Math.max(demandMax, dm);
    const multiplier = Math.round(period.multiplier * dm * 100) / 100;
    fares[c] = fareFor(c, route.distanceMeters, route.durationSeconds, { multiplier });
    prices[c] = fares[c].total;
  }
  return {
    prices,
    fares,
    period: { id: period.id, label: period.label, multiplier: period.multiplier },
    highDemand: demandMax > 1,
    traffic: trafficLevel(route.durationSeconds, route.staticDurationSeconds),
  };
}

export function allPrices(distanceMeters, durationSeconds, opts) {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c, priceFor(c, distanceMeters, durationSeconds, opts)]),
  );
}

/** Informação pública de preços (para o ecrã do motorista e transparência). */
export function pricingInfo(date = new Date()) {
  const p = periodAt(date);
  return {
    fuel: { ...FUEL },
    platformFee: PLATFORM_FEE,
    period: { id: p.id, label: p.label, multiplier: p.multiplier },
    rates: Object.fromEntries(
      CATEGORIES.map((c) => {
        const r = ratesFor(c);
        return [c, { base: r.base, minimo: r.minimo, porKm: +r.porKm.toFixed(2), porMin: +r.porMin.toFixed(2) }];
      }),
    ),
  };
}
