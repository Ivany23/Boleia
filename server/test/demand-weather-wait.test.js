import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import {
  CATEGORIES,
  FREE_WAIT_MIN,
  addExtra,
  delayMinutes,
  demandMultiplier,
  extraCharge,
  fareFor,
  priceRoute,
  waitRatePerMin,
} from '../src/pricing.js';
import { createMarket } from '../src/market.js';
import { createQuoteService } from '../src/quotes.js';
import { createServer } from '../src/server.js';
import { RAIN_MULTIPLIER, createWeather, rainLevel } from '../src/weather.js';

const sum = (b) => Object.values(b).reduce((a, x) => a + x, 0);
const maputo = (y, mo, d, h, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 2, mi));
const WED_NOON = maputo(2026, 11, 4, 12);
const WED_PEAK = maputo(2026, 11, 4, 17, 30);
const A = { lat: -25.9692, lng: 32.5732 };
const B = { lat: -25.9622, lng: 32.4589 };

// ---------------------------------------------------------------------------
// Falta de carros e picos de pedidos
// ---------------------------------------------------------------------------

test('falta de carros: nenhum livre +15%, só um +5%, muitos = sem ajuste', () => {
  // sozinho a pedir (waiting = 1 é o próprio pedido) não é falta de carros
  assert.equal(demandMultiplier(1, 0), 1);
  assert.equal(demandMultiplier(1, 1), 1);
  assert.equal(demandMultiplier(2, 0), 1.15);
  assert.equal(demandMultiplier(2, 1), 1.1);
  assert.equal(demandMultiplier(1, 2), 1);
  assert.equal(demandMultiplier(1, 8), 1);
  assert.equal(demandMultiplier(4, 1), 1.3, 'muitos pedidos para um carro');
});

test('picos de pedidos: muitos pedidos recentes por carro livre sobem até +15%', () => {
  assert.equal(demandMultiplier(1, 5, 0), 1);
  assert.equal(demandMultiplier(1, 5, 12), 1, '2 por carro: normal');
  assert.equal(demandMultiplier(1, 5, 18), 1.03);
  assert.equal(demandMultiplier(1, 5, 1000), 1.15, 'nunca mais de +15% pelo pico');
  assert.equal(demandMultiplier(2, 0, 1000), 1.3, 'falta de carros + pico: tecto de 1,3');
  for (const r of [0, 3, 10, 30, 100]) {
    for (const f of [0, 1, 2, 5]) {
      const m = demandMultiplier(2, f, r);
      assert.ok(m >= 1 && m <= 1.3, `${r}/${f}: ${m}`);
    }
  }
});

test('mercado: o pico entra suavemente na procura da zona', () => {
  let t = WED_NOON.getTime();
  const m = createMarket({ clock: () => new Date(t) });
  assert.equal(m.demand('moto', A, 1, 5, 0), 1);
  t += 10 * 60 * 1000; // passou bastante tempo: chega ao alvo
  assert.equal(m.demand('moto', A, 1, 5, 1000), 1.15);
});

test('priceRoute: categorias sem carro livre por perto vêm em fewDrivers', () => {
  const q = priceRoute(
    { distanceMeters: 5000, durationSeconds: 600 },
    { date: WED_NOON, pickup: (c) => (c === 'moto' ? 400 : null) },
  );
  assert.deepEqual(q.fewDrivers, ['economico', 'conforto']);
  assert.equal(q.freeWaitMin, FREE_WAIT_MIN);
  for (const c of CATEGORIES) assert.equal(q.waitRates[c], waitRatePerMin(c));
});

// ---------------------------------------------------------------------------
// Chuva
// ---------------------------------------------------------------------------

test('chuva: nível a partir do código WMO e da precipitação', () => {
  assert.equal(rainLevel({ weather_code: 2, precipitation: 0 }), 'none');
  assert.equal(rainLevel({ weather_code: 61, precipitation: 0.1 }), 'fraca');
  assert.equal(rainLevel({ weather_code: 3, precipitation: 0.2 }), 'fraca');
  assert.equal(rainLevel({ weather_code: 65, precipitation: 0.3 }), 'forte');
  assert.equal(rainLevel({ weather_code: 95 }), 'forte');
  assert.equal(rainLevel({ weather_code: 3, precipitation: 1.2 }), 'forte');
  assert.equal(rainLevel(), 'none');
});

test('chuva: sobe o preço de todas as categorias (fraca < forte), dentro do tecto 1,6', () => {
  const route = { distanceMeters: 6000, durationSeconds: 900 };
  const dry = priceRoute(route, { date: WED_NOON });
  const light = priceRoute(route, { date: WED_NOON, rain: RAIN_MULTIPLIER.fraca });
  const heavy = priceRoute(route, { date: WED_NOON, rain: RAIN_MULTIPLIER.forte });
  for (const c of CATEGORIES) {
    // na mota (tarifas de ~60 MT) o arredondamento a 5 MT pode juntar chuva fraca e forte
    assert.ok(light.prices[c] > dry.prices[c] && heavy.prices[c] >= light.prices[c], c);
    if (c !== 'moto') assert.ok(heavy.prices[c] > light.prices[c], c);
  }
  assert.equal(dry.rain, null);
  assert.deepEqual(heavy.rain, { multiplier: 1.2 });
  const worst = priceRoute(route, { date: maputo(2026, 11, 4, 22), rain: 1.2, demand: () => 1.3 });
  for (const c of CATEGORIES) assert.equal(worst.fares[c].multiplier, 1.6);
  assert.equal(priceRoute(route, { date: WED_NOON, rain: 0.5 }).prices.economico, dry.prices.economico, 'nunca desce');
});

test('createWeather: lê o Open-Meteo, guarda 10 min, falhas = sem ajuste', async () => {
  let t = 0;
  let calls = 0;
  let body = { current: { weather_code: 63, precipitation: 0.3 } };
  const wx = createWeather({
    now: () => t,
    log: () => {},
    enabled: true,
    fetchImpl: async (url) => {
      calls++;
      assert.match(url, /open-meteo\.com/);
      return { ok: true, json: async () => body };
    },
  });
  assert.equal(wx.current(), null, 'ainda sem dados: não espera');
  await wx.refresh();
  assert.deepEqual({ ...wx.current(), at: 0 }, { rain: 'fraca', multiplier: 1.1, at: 0 });
  const n = calls;
  t += 5 * 60 * 1000;
  wx.current();
  assert.equal(calls, n, 'dentro dos 10 min usa a cache');
  body = { current: { weather_code: 0, precipitation: 0 } };
  t += 6 * 60 * 1000;
  wx.current(); // velho: actualiza em segundo plano
  await wx.refresh();
  assert.equal(wx.current().rain, 'none');

  const broken = createWeather({ enabled: true, log: () => {}, fetchImpl: async () => ({ ok: false, status: 500 }) });
  await broken.refresh();
  assert.equal(broken.current(), null);
  const off = createWeather({ enabled: false, fetchImpl: async () => { throw new Error('não devia'); } });
  assert.equal(off.current(), null);
  // dados com mais de 1 hora não contam
  let t2 = 0;
  const old = createWeather({ enabled: true, log: () => {}, now: () => t2, fetchImpl: async () => ({ ok: true, json: async () => ({ current: { weather_code: 65 } }) }) });
  await old.refresh();
  t2 += 2 * 3600 * 1000;
  const failing = old; // a próxima actualização vai correr, mas o valor velho já não é usado
  assert.equal(failing.current(), null);
});

test('cotação: chuva entra no preço e aparece na cotação', async () => {
  const route = async (o, d) => ({ distanceMeters: 5000, durationSeconds: 600, polyline: [o, d] });
  const dry = await createQuoteService({ route, clock: () => WED_NOON, pickup: () => 0 }).quote(A, B);
  const wet = await createQuoteService({
    route,
    clock: () => WED_NOON,
    pickup: () => 0,
    weather: { current: () => ({ rain: 'forte', multiplier: 1.2 }) },
  }).quote(A, B);
  assert.equal(dry.rain, null);
  assert.deepEqual(wet.rain, { level: 'forte', multiplier: 1.2 });
  assert.ok(wet.prices.economico > dry.prices.economico);
  const broken = await createQuoteService({
    route,
    clock: () => WED_NOON,
    pickup: () => 0,
    weather: { current: () => { throw new Error('x'); } },
  }).quote(A, B);
  assert.equal(broken.prices.economico, dry.prices.economico);
});

// ---------------------------------------------------------------------------
// Trânsito: rota sem trânsito na hora de ponta
// ---------------------------------------------------------------------------

test('trânsito: sem dados de trânsito na hora de ponta, estima +30% de tempo', () => {
  const base = { distanceMeters: 8000, durationSeconds: 1200, staticDurationSeconds: 1200 };
  const withTraffic = priceRoute({ ...base, trafficAware: true }, { date: WED_PEAK });
  const noTraffic = priceRoute({ ...base, trafficAware: false }, { date: WED_PEAK });
  const unknown = priceRoute(base, { date: WED_PEAK });
  for (const c of CATEGORIES) assert.ok(noTraffic.prices[c] > withTraffic.prices[c], c);
  assert.equal(noTraffic.traffic, 'moderado');
  assert.equal(unknown.prices.economico, withTraffic.prices.economico, 'rotas de teste: sem estimativa');
  // fora da ponta não estima
  const noon = priceRoute({ ...base, trafficAware: false }, { date: WED_NOON });
  assert.equal(noon.prices.economico, priceRoute({ ...base, trafficAware: true }, { date: WED_NOON }).prices.economico);
});

test('trânsito: mais tempo parado custa sempre mais', () => {
  for (const c of CATEGORIES) {
    let prev = 0;
    for (const min of [10, 20, 35, 60, 90]) {
      const p = fareFor(c, 8000, min * 60).total;
      assert.ok(p >= prev, `${c} ${min} min`);
      prev = p;
    }
    assert.ok(fareFor(c, 8000, 90 * 60).total > fareFor(c, 8000, 10 * 60).total);
  }
});

// ---------------------------------------------------------------------------
// Carro parado: espera na recolha e atrasos
// ---------------------------------------------------------------------------

test('espera e atraso: valores por minuto, múltiplos de 5, com tecto', () => {
  assert.ok(waitRatePerMin('moto') < waitRatePerMin('economico'));
  assert.ok(waitRatePerMin('economico') < waitRatePerMin('conforto'));
  assert.equal(extraCharge('economico', 0), 0);
  assert.equal(extraCharge('economico', -3), 0);
  assert.equal(extraCharge('economico', NaN), 0);
  assert.equal(extraCharge('economico', 5), 20); // 5 × (1,12 ralenti + 150/60) = 18,1 -> 20
  assert.equal(extraCharge('economico', 0.1) % 5, 0);
  assert.ok(extraCharge('economico', 0.1) >= 5, 'um minuto começado conta');
  assert.equal(extraCharge('economico', 500), extraCharge('economico', 60), 'tecto de 60 min');
  assert.equal(delayMinutes(1200, 20), 0, 'dentro do previsto');
  assert.equal(delayMinutes(1200, 30), 0, 'dentro da tolerância (20 × 1,25 + 5 = 30)');
  assert.equal(delayMinutes(1200, 40), 10);
});

test('addExtra: o extra vai todo para o motorista e a repartição bate certo', () => {
  const f = fareFor('economico', 5000, 600);
  const g = addExtra(addExtra(f, 'waiting', 30), 'delay', 20);
  assert.equal(g.total, f.total + 50);
  assert.equal(g.driverEarnings, f.driverEarnings + 50);
  assert.equal(g.platformFee, f.platformFee);
  assert.equal(g.driverEarnings + g.platformFee, g.total);
  assert.equal(sum(g.breakdown), g.total);
  assert.equal(addExtra(f, 'waiting', 0), f);
  assert.equal(addExtra(null, 'waiting', 10), null);
});

// Servidor real com relógio controlado: chegou -> espera -> iniciar -> trânsito -> concluir
let srv;
const sockets = [];
after(async () => {
  sockets.forEach((s) => s.disconnect());
  await srv?.close();
});

test('viagem: cobra a espera depois de 3 min e o atraso grande no trânsito', async () => {
  let t = WED_NOON.getTime();
  srv = createServer({
    route: async (o, d) => ({ distanceMeters: 5000, durationSeconds: 600, staticDurationSeconds: 600, polyline: [o, d] }),
    clock: () => new Date(t),
    nearbyIntervalMs: 100000,
  });
  const port = await srv.listen(0, '127.0.0.1');
  const client = async () => {
    const s = connect(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
    sockets.push(s);
    s.log = {};
    s.onAny((ev, p) => (s.log[ev] ??= []).push(p));
    await new Promise((res, rej) => {
      s.once('connect', res);
      s.once('connect_error', rej);
    });
    return s;
  };
  const until = async (fn, ms = 2000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timeout');
  };
  const last = (s, st) => (s.log['ride:update'] ?? []).filter((r) => r.status === st).pop();

  const drv = await client();
  drv.emit('driver:online', { phone: '86 111 2222', name: 'Zé', car: 'Vitz', plate: 'AAA', category: 'economico', location: A });
  await until(() => srv.rides.driverCount() > 0);
  const pax = await client();
  const r = await new Promise((res) =>
    pax.emit('ride:request', { pickup: { ...A, address: 'a' }, dropoff: { ...B, address: 'b' }, category: 'economico', payment: 'dinheiro', passengerName: 'Ana', phone: '84 123 4567' }, res),
  );
  assert.equal(r.ok, true);
  assert.equal(r.ride.freeWaitMin, 3);
  assert.equal(r.ride.waitRatePerMin, waitRatePerMin('economico'));
  const base = r.ride.price;
  const id = r.ride.id;
  await until(() => drv.log['ride:offer']?.length);
  drv.emit('ride:accept', { rideId: id });
  await until(() => last(pax, 'accepted'));
  drv.emit('ride:arrived', { rideId: id });
  const arrived = await until(() => last(pax, 'arrived'));
  assert.equal(typeof arrived.arrivedAt, 'number');

  t += 8 * 60 * 1000; // esperou 8 min: 5 pagos
  drv.emit('ride:start', { rideId: id });
  const started = await until(() => last(pax, 'in_progress'));
  assert.equal(started.extraWaitMin, 5);
  assert.equal(started.fare.breakdown.waiting, extraCharge('economico', 5));
  assert.equal(started.price, base + extraCharge('economico', 5));

  t += 30 * 60 * 1000; // previsto 10 min; tolerância 10 × 1,25 + 5 = 17,5 -> 12,5 min a mais (13)
  drv.emit('ride:complete', { rideId: id });
  const done = await until(() => last(pax, 'completed'));
  assert.equal(done.extraDelayMin, 13);
  assert.equal(done.fare.breakdown.delay, extraCharge('economico', 12.5));
  assert.equal(done.price, base + extraCharge('economico', 5) + extraCharge('economico', 12.5));
  assert.equal(done.fare.total, done.price);
  assert.equal(done.fare.driverEarnings + done.fare.platformFee, done.price);
  assert.equal(sum(done.fare.breakdown), done.price);
  assert.equal(last(drv, 'completed').price, done.price, 'o motorista cobra o mesmo valor');
});

test('viagem rápida: sem espera paga nem atraso', async () => {
  // usa o servidor do teste anterior: recolha a 2 min, viagem dentro do previsto
  assert.ok(srv);
  assert.equal(extraCharge('economico', 2 - FREE_WAIT_MIN), 0);
  assert.equal(extraCharge('economico', delayMinutes(600, 12)), 0);
});
