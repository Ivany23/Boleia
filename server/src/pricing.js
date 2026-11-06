/**
 * Motor de preços da Boleia (MZN): preço dinâmico, calculado viagem a viagem.
 *
 * 1. CUSTO REAL do motorista: combustível (preço ARENE) + desgaste por km,
 *    combustível ao ralenti por minuto parado no trânsito.
 * 2. TARIFA:   base + km × porKm + min × porMin + ida até à recolha (custo real)
 * 3. GARANTIA: o motorista recebe sempre, no mínimo, o custo real + ganho mínimo
 *              por hora de trabalho (ida até à recolha + viagem), por categoria
 * 4. AJUSTE:   × multiplicador (horário × procura na zona × aprendizagem), 0,9 a 1,6,
 *              aplicado POR CIMA da garantia (a noite rende sempre mais)
 * 5. PLATAFORMA: comissão PLATFORM_FEE somada por cima + taxa de serviço fixa SERVICE_FEE
 *
 *   total = arredonda5( max(líquido / (1 − comissão), mínimo × multiplicador) + taxa de serviço )
 *
 * Valores ajustáveis no server/.env (ou no painel do Render) sem mexer no código.
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
/** Taxa de serviço fixa por viagem (MZN), toda para a plataforma. */
export const SERVICE_FEE = envNum('SERVICE_FEE', 10, 0, 200);
/** Lucro mínimo do motorista por hora de trabalho (carro Económico), depois de combustível e desgaste (MZN). */
export const DRIVER_MIN_HOURLY = envNum('DRIVER_MIN_HOURLY', 300, 0, 5000);
/** A garantia acompanha a categoria: a mota custa menos a operar, o Conforto mais. */
const HOURLY_FACTOR = { moto: 0.7, economico: 1, conforto: 1.3 };
export const driverMinHourlyFor = (category) => DRIVER_MIN_HOURLY * (HOURLY_FACTOR[category] ?? 1);

/** Distância de recolha usada quando não há motorista livre por perto (m). */
export const DEFAULT_PICKUP_M = 1500;
/** A ida até à recolha só é cobrada até este limite (km). */
const MAX_PAID_PICKUP_KM = 5;
/** Velocidade média na ida até à recolha, em cidade (km/h). */
const PICKUP_KMH = 20;

/**
 * Custos por categoria (carros/motas típicos em Maputo, a gasolina).
 * consumo: L/100 km em cidade; ralenti: L/min parado no trânsito;
 * desgaste: pneus, óleo, manutenção, depreciação (MZN/km).
 */
export const CATEGORY_COSTS = {
  moto: { consumo: 3.0, ralenti: 0.004, desgaste: 1.5, ganhoKm: 2.0, ganhoMin: 0.6, base: 20, minimo: 30 },
  economico: { consumo: 7.5, ralenti: 0.012, desgaste: 3.5, ganhoKm: 3.0, ganhoMin: 1.2, base: 40, minimo: 70 },
  conforto: { consumo: 9.5, ralenti: 0.015, desgaste: 5.0, ganhoKm: 6.0, ganhoMin: 1.8, base: 70, minimo: 110 },
};
export const CATEGORIES = Object.keys(CATEGORY_COSTS);
export const PAYMENTS = ['dinheiro', 'mpesa', 'emola'];

export const MIN_MULTIPLIER = 0.9;
export const MAX_MULTIPLIER = 1.6;

/** Tarifas e custos por km/min, derivados do preço actual da gasolina. */
export function ratesFor(category, fuelPrice = FUEL.gasolina) {
  const c = CATEGORY_COSTS[category];
  if (!c) throw new Error('Categoria invalida');
  const fuelKm = (c.consumo / 100) * fuelPrice;
  const idleMin = c.ralenti * fuelPrice;
  return {
    base: c.base,
    minimo: c.minimo,
    /** custo real por km (combustível + desgaste) */
    costKm: fuelKm + c.desgaste,
    /** custo real por minuto parado */
    costMin: idleMin,
    porKm: fuelKm + c.desgaste + c.ganhoKm,
    porMin: idleMin + c.ganhoMin,
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
 * - Noite (todos os dias) 21:00–05:00: ×1,25
 * - Ponta da manhã (seg–sex) 06:00–09:00: ×1,15
 * - Ponta da tarde (seg–sex) 16:30–19:30: ×1,20
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

/** Procura instantânea: pedidos à espera vs. motoristas livres perto (1 a 1,3). */
export function demandMultiplier(waiting, freeDrivers) {
  if (!(waiting > 0) || !(freeDrivers > 0)) return 1;
  const ratio = waiting / freeDrivers;
  if (ratio <= 1) return 1;
  return Math.min(1.3, Math.round((1 + (ratio - 1) * 0.1) * 100) / 100);
}

const round5 = (n) => Math.round(n / 5) * 5;
const clampM = (m) => Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Number.isFinite(m) ? m : 1));

/**
 * Tarifa completa de uma categoria.
 * @param opts.multiplier   horário × procura × aprendizagem (limitado a 0,9–1,6)
 * @param opts.pickupMeters distância estimada do motorista até à recolha
 * @returns {{ total, driverEarnings, platformFee, multiplier, driverCost,
 *   breakdown: { base, distance, time, pickup, surcharge, guarantee, serviceFee } }}
 */
export function fareFor(
  category,
  distanceMeters,
  durationSeconds,
  { multiplier = 1, fuelPrice, pickupMeters = DEFAULT_PICKUP_M } = {},
) {
  const r = ratesFor(category, fuelPrice);
  const km = Math.max(0, Number(distanceMeters) || 0) / 1000;
  const min = Math.max(0, Number(durationSeconds) || 0) / 60;
  const pickupKm = Math.max(0, Number.isFinite(pickupMeters) ? pickupMeters : DEFAULT_PICKUP_M) / 1000;
  const m = clampM(Number(multiplier));

  // 2. tarifa
  const raw = {
    base: r.base,
    distance: km * r.porKm,
    time: min * r.porMin,
    pickup: Math.min(pickupKm, MAX_PAID_PICKUP_KM) * r.costKm,
  };
  const tariff = raw.base + raw.distance + raw.time + raw.pickup;

  // 3. garantia: custo real + lucro mínimo por hora de trabalho (ida + viagem)
  const engagedMin = min + (pickupKm / PICKUP_KMH) * 60;
  const driverCost = (km + pickupKm) * r.costKm + min * r.costMin;
  const floorNet = driverCost + (driverMinHourlyFor(category) / 60) * engagedMin;
  const guaranteed = Math.max(tariff, floorNet);
  const guarantee = guaranteed - tariff;

  // 4. ajuste por cima da garantia (noite / ponta / procura sobem sempre o preço);
  //    um desconto da aprendizagem nunca desce abaixo da garantia do motorista
  const net = Math.max(guaranteed * m, floorNet);

  // 5. plataforma
  const fare = round5(Math.max(net / (1 - PLATFORM_FEE), r.minimo * m));
  const total = fare + round5(SERVICE_FEE);
  const platformFee = Math.round(fare * PLATFORM_FEE) + round5(SERVICE_FEE);
  const driverEarnings = total - platformFee;

  // Repartição visível (soma exactamente o total)
  const parts = { ...raw, guarantee, surcharge: net - guaranteed };
  const partsSum = Object.values(parts).reduce((a, b) => a + b, 0);
  const k = partsSum > 0 ? fare / partsSum : 0;
  const breakdown = {
    base: Math.round(parts.base * k),
    distance: Math.round(parts.distance * k),
    time: Math.round(parts.time * k),
    pickup: Math.round(parts.pickup * k),
    surcharge: Math.round(parts.surcharge * k), // negativo quando há desconto
    guarantee: Math.round(parts.guarantee * k),
    serviceFee: round5(SERVICE_FEE),
  };
  const shown = Object.values(breakdown).reduce((a, b) => a + b, 0);
  breakdown.distance += total - shown; // acerta arredondamentos

  return {
    total,
    driverEarnings,
    platformFee,
    multiplier: Math.round(m * 100) / 100,
    driverCost: Math.round(driverCost),
    breakdown,
  };
}

export function priceFor(category, distanceMeters, durationSeconds, opts) {
  return fareFor(category, distanceMeters, durationSeconds, opts).total;
}

/**
 * Cotação de todas as categorias para uma rota, num dado momento.
 * demand(category)   -> multiplicador de procura na zona (≥ 1)
 * learning(category) -> factor aprendido com o histórico (0,9 a 1,2)
 * pickup(category)   -> metros do motorista livre mais próximo (ou null)
 */
export function priceRoute(route, { date = new Date(), demand = () => 1, learning = () => 1, pickup = () => null } = {}) {
  const period = periodAt(date);
  const fares = {};
  const prices = {};
  let demandMax = 1;
  for (const c of CATEGORIES) {
    const dm = Math.max(1, Number(demand(c)) || 1);
    const lf = Number(learning(c)) || 1;
    demandMax = Math.max(demandMax, dm);
    const p = pickup(c);
    fares[c] = fareFor(c, route.distanceMeters, route.durationSeconds, {
      multiplier: period.multiplier * dm * lf,
      pickupMeters: Number.isFinite(p) ? p : DEFAULT_PICKUP_M,
    });
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
    serviceFee: SERVICE_FEE,
    driverMinHourly: DRIVER_MIN_HOURLY,
    driverMinHourlyByCategory: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(driverMinHourlyFor(c))])),
    period: { id: p.id, label: p.label, multiplier: p.multiplier },
    rates: Object.fromEntries(
      CATEGORIES.map((c) => {
        const r = ratesFor(c);
        return [c, { base: r.base, minimo: r.minimo, porKm: +r.porKm.toFixed(2), porMin: +r.porMin.toFixed(2) }];
      }),
    ),
  };
}
