/**
 * Motor de preços da Boleia (MZN): preço dinâmico, calculado viagem a viagem.
 *
 * 1. CUSTO REAL do motorista, a partir do COMBUSTÍVEL:
 *      combustível por km = preço do litro ÷ km por litro
 *      (ex.: carro 1.5 faz 9,5 km/L; gasolina 94 MT/L -> ~9,9 MT por km)
 *    + desgaste por km; combustível ao ralenti por minuto PARADO no trânsito.
 * 2. TARIFA:   base + km × (combustível + desgaste + lucro) + minutos PARADOS × porMin
 *              + ida até à recolha (o 1.º km é grátis). Os minutos a andar já estão pagos
 *              nos km; só conta o tempo abaixo de FREE_FLOW_KMH (trânsito, semáforos).
 *              TARIFA DE BAIRRO: destino a menos de LOCAL_RADIUS_M do ponto de partida
 *              (mesmo bairro ou bairros vizinhos): metade da base e mínimo mais baixo.
 * 3. GARANTIA: o motorista recebe sempre, no mínimo, o custo real + ganho mínimo
 *              por hora de trabalho (ida até à recolha + viagem), por categoria
 * 4. AJUSTE:   × multiplicador (horário × procura/falta de carros × chuva × aprendizagem),
 *              0,9 a 1,6, aplicado POR CIMA da garantia (a noite rende sempre mais)
 * 6. CARRO PARADO: 3 min de espera grátis na recolha, depois por minuto; e, se a viagem
 *              demorar muito mais do que o previsto (parado no trânsito), o tempo extra.
 *              Estes extras vão inteiros para o motorista.
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
export const SERVICE_FEE = envNum('SERVICE_FEE', 5, 0, 200);
/** Lucro mínimo do motorista por hora de trabalho (carro Económico), depois de combustível e desgaste (MZN). */
export const DRIVER_MIN_HOURLY = envNum('DRIVER_MIN_HOURLY', 150, 0, 5000);
/** A garantia acompanha a categoria: a mota custa menos a operar, o Conforto mais. */
const HOURLY_FACTOR = { moto: 0.7, economico: 1, conforto: 1.3 };
export const driverMinHourlyFor = (category) => DRIVER_MIN_HOURLY * (HOURLY_FACTOR[category] ?? 1);

/** Distância de recolha usada quando não há motorista livre por perto (m). */
export const DEFAULT_PICKUP_M = 1000;
/** Ida até à recolha: o 1.º km é grátis e só se cobra até este limite (km). */
const FREE_PICKUP_KM = 1;
const MAX_PAID_PICKUP_KM = 3;
/** Velocidade "a andar" na cidade: abaixo disto o tempo conta como parado (km/h). */
export const FREE_FLOW_KMH = 25;
/** Tarifa de bairro: destino (e paragens) até esta distância em linha recta da partida. */
export const LOCAL_RADIUS_M = 2500;
const LOCAL_BASE_FACTOR = 0.5;
const LOCAL_MIN_FACTOR = 0.85;
/** Velocidade média na ida até à recolha, em cidade (km/h). */
const PICKUP_KMH = 20;

/**
 * Custos por categoria (veículos típicos de Maputo, a gasolina).
 * kmPorLitro: km que faz com 1 litro na cidade (Económico = carro 1.5: 9,5 km/L;
 *   Mota = motas de Maputo como a LF49-D e a Rolls: 35 km/L);
 * ralenti: L/min parado; desgaste: pneus, óleo, manutenção (MZN/km);
 * ganhoKm: lucro do motorista por km; ganhoMin: lucro por minuto PARADO;
 * base: arranque; minimo: valor mínimo antes da taxa de serviço.
 */
export const CATEGORY_COSTS = {
  moto: { kmPorLitro: 35, ralenti: 0.003, desgaste: 0.6, ganhoKm: 2.8, ganhoMin: 0.8, base: 10, minimo: 25, paragem: 5, areia: 0.3 },
  economico: { kmPorLitro: 9.5, ralenti: 0.012, desgaste: 1.5, ganhoKm: 3.5, ganhoMin: 1.5, base: 15, minimo: 45, paragem: 10, areia: 0.5 },
  conforto: { kmPorLitro: 8, ralenti: 0.015, desgaste: 2.5, ganhoKm: 5.5, ganhoMin: 2.0, base: 25, minimo: 70, paragem: 15, areia: 0.35 },
};
// paragem: valor fixo por paragem intermédia (MZN), além de STOP_WAIT_MIN minutos de espera.
// areia: custo extra por km em estrada de areia/terra, em fracção do preço por km
//        (mais combustível, embraiagem e suspensão; o carro baixo sofre mais do que o SUV).

/** Minutos de espera incluídos em cada paragem intermédia. */
export const STOP_WAIT_MIN = 3;
/** Máximo de paragens intermédias por viagem. */
export const MAX_STOPS = 3;
export const CATEGORIES = Object.keys(CATEGORY_COSTS);
export const PAYMENTS = ['dinheiro', 'mpesa', 'emola'];

const round5 = (n) => Math.round(n / 5) * 5;

export const MIN_MULTIPLIER = 0.9;
export const MAX_MULTIPLIER = 1.6;

/** Tarifas e custos por km/min, derivados do preço actual da gasolina. */
export function ratesFor(category, fuelPrice = FUEL.gasolina) {
  const c = CATEGORY_COSTS[category];
  if (!c) throw new Error('Categoria invalida');
  const fuelKm = fuelPrice / c.kmPorLitro;
  const idleMin = c.ralenti * fuelPrice;
  return {
    base: c.base,
    minimo: c.minimo,
    paragem: c.paragem,
    areia: c.areia,
    /** combustível por km (preço do litro ÷ km por litro) */
    fuelKm,
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

/** Nenhum carro livre por perto: um pouco mais caro (atrai motoristas de longe). */
export const SCARCITY_NONE = 1.15;
/** Só um carro livre por perto. */
export const SCARCITY_ONE = 1.05;
export const MAX_DEMAND = 1.3;

/**
 * Procura instantânea na zona (1 a 1,3):
 *  - pedidos à espera vs. motoristas livres perto (+10% por cada pedido a mais);
 *  - falta de carros: nenhum livre ×1,15; só um ×1,05;
 *  - pico de pedidos: pedidos dos últimos 15 min por carro livre; acima de 2 por
 *    carro, +3% por cada pedido a mais (no máximo +15%).
 */
export function demandMultiplier(waiting, freeDrivers, recentRequests = 0) {
  const wait = waiting > 0 ? waiting : 0;
  const free = freeDrivers > 0 ? Math.floor(freeDrivers) : 0;
  let m = 1;
  if (free === 0) {
    if (wait > 0) m = SCARCITY_NONE;
  } else {
    const ratio = wait / free;
    if (ratio > 1) m = 1 + (ratio - 1) * 0.1;
    if (free === 1 && wait > 0) m = Math.max(m, SCARCITY_ONE);
  }
  const perCar = (Number(recentRequests) || 0) / (free + 1);
  if (perCar > 2) m *= 1 + Math.min(0.15, (perCar - 2) * 0.03);
  return Math.min(MAX_DEMAND, Math.round(m * 100) / 100);
}

// ---------------------------------------------------------------------------
// Carro parado: espera na recolha e atrasos grandes no trânsito
// ---------------------------------------------------------------------------

/** Minutos de espera grátis depois de o motorista chegar à recolha. */
export const FREE_WAIT_MIN = 3;
/** A viagem só cobra tempo extra se demorar mais do que previsto × 1,25 + 5 min. */
export const DELAY_FACTOR = 1.25;
export const DELAY_GRACE_MIN = 5;
/** Máximo de minutos extra cobrados (espera ou atraso), por segurança. */
export const MAX_EXTRA_MIN = 60;

/** MZN por minuto parado: combustível ao ralenti + ganho mínimo por hora do motorista. */
export function waitRatePerMin(category, fuelPrice) {
  const r = ratesFor(category, fuelPrice);
  return Math.round((r.costMin + driverMinHourlyFor(category) / 60) * 100) / 100;
}

/** Valor (múltiplo de 5) de N minutos parado; 0 se não houver minutos a cobrar. */
export function extraCharge(category, minutes) {
  const m = Math.min(MAX_EXTRA_MIN, Math.max(0, Math.ceil(Number(minutes) || 0)));
  return m > 0 ? Math.max(5, round5(m * waitRatePerMin(category))) : 0;
}

/** Minutos de atraso a cobrar numa viagem (0 se dentro do previsto + tolerância). */
export function delayMinutes(estimatedSeconds, actualMinutes) {
  const est = Math.max(0, Number(estimatedSeconds) || 0) / 60;
  const allowed = est * DELAY_FACTOR + DELAY_GRACE_MIN;
  return Math.max(0, (Number(actualMinutes) || 0) - allowed);
}

/** Junta um extra (todo para o motorista) a uma tarifa; a repartição continua a bater certo. */
export function addExtra(fare, kind, amount) {
  if (!fare || !(amount > 0)) return fare;
  return {
    ...fare,
    total: fare.total + amount,
    driverEarnings: fare.driverEarnings + amount,
    breakdown: { ...fare.breakdown, [kind]: (fare.breakdown?.[kind] ?? 0) + amount },
  };
}

const clampM = (m) => Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Number.isFinite(m) ? m : 1));

/**
 * Tarifa completa de uma categoria.
 * @param opts.multiplier   horário × procura × aprendizagem (limitado a 0,9–1,6)
 * @param opts.pickupMeters distância estimada do motorista até à recolha
 * @param opts.stops        número de paragens intermédias (0 a MAX_STOPS)
 * @param opts.sandMeters   metros do percurso em estrada de areia/terra
 * @returns {{ total, driverEarnings, platformFee, multiplier, driverCost,
 *   breakdown: { base, distance, time, pickup, stops, sand, surcharge, guarantee, serviceFee } }}
 */
export function fareFor(
  category,
  distanceMeters,
  durationSeconds,
  { multiplier = 1, fuelPrice, pickupMeters = DEFAULT_PICKUP_M, stops = 0, sandMeters = 0, local = false } = {},
) {
  const r = ratesFor(category, fuelPrice);
  const km = Math.max(0, Number(distanceMeters) || 0) / 1000;
  const min = Math.max(0, Number(durationSeconds) || 0) / 60;
  const pickupKm = Math.max(0, Number.isFinite(pickupMeters) ? pickupMeters : DEFAULT_PICKUP_M) / 1000;
  const m = clampM(Number(multiplier));
  const nStops = Math.min(MAX_STOPS, Math.max(0, Math.floor(Number(stops) || 0)));
  const sandKm = Math.min(km, Math.max(0, Number(sandMeters) || 0) / 1000);
  const stopMin = nStops * STOP_WAIT_MIN;
  // só o tempo PARADO (abaixo de FREE_FLOW_KMH) é cobrado por minuto; o resto já está nos km
  const stoppedMin = Math.max(0, min - (km / FREE_FLOW_KMH) * 60);
  const base = local ? r.base * LOCAL_BASE_FACTOR : r.base;
  const minimo = local ? r.minimo * LOCAL_MIN_FACTOR : r.minimo;

  // 2. tarifa
  const raw = {
    base,
    distance: km * r.porKm,
    time: stoppedMin * r.porMin,
    pickup: Math.min(Math.max(0, pickupKm - FREE_PICKUP_KM), MAX_PAID_PICKUP_KM) * r.costKm,
    stops: nStops * r.paragem + stopMin * r.porMin,
    sand: sandKm * r.porKm * r.areia,
  };
  const tariff = raw.base + raw.distance + raw.time + raw.pickup + raw.stops + raw.sand;

  // 3. garantia: custo real + lucro mínimo por hora de trabalho (ida + viagem + paragens)
  const engagedMin = min + stopMin + (pickupKm / PICKUP_KMH) * 60;
  const driverCost =
    (km + pickupKm) * r.costKm + (stoppedMin + stopMin) * r.costMin + sandKm * r.costKm * r.areia;
  const floorNet = driverCost + (driverMinHourlyFor(category) / 60) * engagedMin;
  const guaranteed = Math.max(tariff, floorNet);
  const guarantee = guaranteed - tariff;

  // 4. ajuste por cima da garantia (noite / ponta / procura sobem sempre o preço);
  //    um desconto da aprendizagem nunca desce abaixo da garantia do motorista
  const net = Math.max(guaranteed * m, floorNet);

  // 5. plataforma
  // com subida (ponta, noite, chuva…) arredonda para CIMA: a subida nunca desaparece no arredondamento
  const preFee = Math.max(net / (1 - PLATFORM_FEE), minimo * m);
  const fare = m > 1 ? Math.ceil(preFee / 5 - 1e-9) * 5 : round5(preFee);
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
    stops: Math.round(parts.stops * k),
    sand: Math.round(parts.sand * k),
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
    local: !!local,
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
 * stops              -> número de paragens intermédias
 * sandMeters         -> metros do percurso em areia/terra (0 se desconhecido)
 * rain               -> multiplicador da chuva (1 sem chuva)
 *
 * Se a rota veio SEM trânsito (route.trafficAware === false, ex.: a Google recusou o
 * trânsito) e é hora de ponta, o tempo é estimado com +30% (o carro fica mais parado).
 */
export const PEAK_NO_TRAFFIC_FACTOR = 1.3;

export function priceRoute(
  route,
  {
    date = new Date(),
    demand = () => 1,
    learning = () => 1,
    pickup = () => null,
    stops = 0,
    sandMeters = 0,
    rain = 1,
    local = false,
  } = {},
) {
  const period = periodAt(date);
  const rainM = Math.max(1, Number(rain) || 1);
  const peak = period.id === 'ponta_manha' || period.id === 'ponta_tarde';
  const seconds =
    route.trafficAware === false && peak ? route.durationSeconds * PEAK_NO_TRAFFIC_FACTOR : route.durationSeconds;
  const fares = {};
  const prices = {};
  const fewDrivers = [];
  const waitRates = {};
  let demandMax = 1;
  for (const c of CATEGORIES) {
    const dm = Math.max(1, Number(demand(c)) || 1);
    const lf = Number(learning(c)) || 1;
    demandMax = Math.max(demandMax, dm);
    const p = pickup(c);
    if (!Number.isFinite(p)) fewDrivers.push(c);
    waitRates[c] = waitRatePerMin(c);
    fares[c] = fareFor(c, route.distanceMeters, seconds, {
      multiplier: period.multiplier * dm * lf * rainM,
      pickupMeters: Number.isFinite(p) ? p : DEFAULT_PICKUP_M,
      stops,
      sandMeters,
      local,
    });
    prices[c] = fares[c].total;
  }
  return {
    prices,
    fares,
    period: { id: period.id, label: period.label, multiplier: period.multiplier },
    highDemand: demandMax > 1,
    fewDrivers,
    local: !!local,
    rain: rainM > 1 ? { multiplier: rainM } : null,
    waitRates,
    freeWaitMin: FREE_WAIT_MIN,
    traffic:
      route.trafficAware === false && peak ? 'moderado' : trafficLevel(route.durationSeconds, route.staticDurationSeconds),
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
    maxStops: MAX_STOPS,
    freeWaitMin: FREE_WAIT_MIN,
    waitRates: Object.fromEntries(CATEGORIES.map((c) => [c, waitRatePerMin(c)])),
    driverMinHourly: DRIVER_MIN_HOURLY,
    driverMinHourlyByCategory: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(driverMinHourlyFor(c))])),
    period: { id: p.id, label: p.label, multiplier: p.multiplier },
    rates: Object.fromEntries(
      CATEGORIES.map((c) => {
        const r = ratesFor(c);
        return [
          c,
          {
            base: r.base,
            minimo: r.minimo,
            kmPorLitro: CATEGORY_COSTS[c].kmPorLitro,
            combustivelPorKm: +r.fuelKm.toFixed(2),
            porKm: +r.porKm.toFixed(2),
            porMin: +r.porMin.toFixed(2),
            paragem: +(r.paragem + STOP_WAIT_MIN * r.porMin).toFixed(2),
            areiaPorKm: +(r.porKm * r.areia).toFixed(2),
          },
        ];
      }),
    ),
  };
}
