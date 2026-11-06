import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createServer } from '../src/server.js';
import { createGoogle } from '../src/google.js';
import { DEFAULT_PICKUP_M, priceFor } from '../src/pricing.js';

let routeCalls = 0;
const mockRoute = async (o, d) => {
  routeCalls++;
  return { distanceMeters: 5000, durationSeconds: 600, staticDurationSeconds: 600, polyline: [o, d] };
};
// Quarta-feira, 12:00 em Maputo (tarifa normal)
const NOON = new Date(Date.UTC(2026, 10, 4, 10, 0));

const BAIXA = { lat: -25.9692, lng: 32.5732, address: 'Baixa' };
const DEST = { lat: -25.9622, lng: 32.4589, address: 'Matola' };
const reqBody = (extra = {}) => ({
  pickup: BAIXA,
  dropoff: DEST,
  category: 'economico',
  payment: 'dinheiro',
  passengerName: 'Ana',
  phone: '84 123 4567',
  ...extra,
});
let driverSeq = 0;

let srv, port;
const sockets = [];

before(async () => {
  srv = createServer({ route: mockRoute, clock: () => NOON, offerTimeoutMs: 300, nearbyIntervalMs: 100000 });
  port = await srv.listen(0, '127.0.0.1');
});
after(async () => {
  sockets.forEach((s) => s.disconnect());
  await srv.close();
});

async function client() {
  const s = connect(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
  sockets.push(s);
  s.log = {};
  s.onAny((ev, p) => (s.log[ev] ??= []).push(p));
  await new Promise((res, rej) => {
    s.once('connect', res);
    s.once('connect_error', rej);
  });
  return s;
}

async function until(fn, ms = 2000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timeout à espera de condição');
}
const statuses = (s) => (s.log['ride:update'] ?? []).map((r) => r.status);
const waitStatus = (s, st) => until(() => statuses(s).includes(st));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const online = async (cat = 'economico', loc = BAIXA, phone = `86${String(1000000 + ++driverSeq)}`) => {
  const d = await client();
  d.phone = phone;
  d.emit('driver:online', {
    phone,
    name: 'Zé',
    car: 'Toyota',
    plate: 'AAA-111',
    category: cat,
    location: { lat: loc.lat, lng: loc.lng },
  });
  await until(() => srv.rides.driverCount() > 0);
  await new Promise((r) => setTimeout(r, 30));
  return d;
};

// Cada teste usa uma zona geográfica própria (>10 km das outras) para isolar motoristas.
const ZONE = (n) => ({ lat: -25.9 + n * 0.5, lng: 32.5, address: `Zona ${n}` });

test('fluxo completo: pedido → oferta → aceitar → chegou → iniciar → concluir', async () => {
  const driver = await online('economico', ZONE(0));
  const pax = await client();
  pax.emit('passenger:hello', { name: 'Ana', location: ZONE(0) });
  const nearby = await until(() => pax.log['drivers:nearby']?.[0]);
  assert.ok(Array.isArray(nearby));

  const r = await ack(pax, 'ride:request', reqBody({ pickup: ZONE(0) }));
  assert.equal(r.ok, true);
  assert.equal(r.ride.status, 'searching');
  assert.equal(r.ride.price, 160);
  assert.equal(r.ride.fare.total, 160);
  assert.equal(r.ride.fare.driverEarnings + r.ride.fare.platformFee, 160);
  assert.equal(r.ride.period.id, 'normal');
  assert.equal(r.ride.traffic, 'livre');
  assert.equal(r.ride.passengerId, pax.id);

  const offer = await until(() => driver.log['ride:offer']?.[0]);
  assert.equal(offer.ride.id, r.ride.id);
  assert.equal(offer.expiresInSeconds, 1); // offerTimeoutMs=300 nos testes (mínimo 1 s)
  assert.equal(offer.pickupDistanceMeters, 0);

  driver.emit('ride:accept', { rideId: r.ride.id });
  await waitStatus(pax, 'accepted');
  const acc = pax.log['ride:update'].find((u) => u.status === 'accepted');
  assert.equal(acc.driver.id, driver.id);
  assert.equal(acc.driver.plate, 'AAA-111');
  await waitStatus(driver, 'accepted');

  driver.emit('driver:location', { lat: -25.97, lng: 32.57 });
  await until(() => pax.log['ride:driver_location']?.some((l) => l.lat === -25.97));

  for (const [ev, st] of [
    ['ride:arrived', 'arrived'],
    ['ride:start', 'in_progress'],
    ['ride:complete', 'completed'],
  ]) {
    driver.emit(ev, { rideId: r.ride.id });
    await waitStatus(pax, st);
    await waitStatus(driver, st);
  }
  assert.deepEqual(statuses(pax), ['accepted', 'arrived', 'in_progress', 'completed']);
  assert.deepEqual(statuses(driver), ['accepted', 'arrived', 'in_progress', 'completed']);
});

test('recusar → passa ao próximo motorista (sem repetir); depois no_drivers', async () => {
  const z = ZONE(1);
  const d1 = await online('conforto', z);
  const d2 = await online('conforto', { lat: z.lat - 0.02, lng: z.lng });
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'conforto', pickup: z }));
  assert.equal(r.ok, true);

  // d1 é o mais próximo
  const o1 = await until(() => d1.log['ride:offer']?.[0]);
  assert.equal(o1.ride.id, r.ride.id);
  assert.equal(d2.log['ride:offer'], undefined);
  d1.emit('ride:decline', { rideId: r.ride.id });

  await until(() => d2.log['ride:offer']?.[0]);
  d2.emit('ride:decline', { rideId: r.ride.id });

  await waitStatus(pax, 'no_drivers');
  assert.equal(d1.log['ride:offer'].length, 1);
  assert.equal(d2.log['ride:offer'].length, 1);
});

test('sem motoristas → no_drivers', async () => {
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'moto', pickup: ZONE(2) }));
  assert.equal(r.ok, true);
  await waitStatus(pax, 'no_drivers');
});

test('oferta sem resposta expira e vai para o próximo', async () => {
  const z = ZONE(3);
  const a = await online('moto', z);
  const b = await online('moto', { lat: z.lat - 0.02, lng: z.lng });
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'moto', pickup: z }));
  assert.equal(r.ok, true);
  await until(() => a.log['ride:offer']);
  await until(() => b.log['ride:offer']);
  await waitStatus(pax, 'no_drivers');
});

test('passageiro cancela durante a viagem; motorista fica livre', async () => {
  const z = ZONE(4);
  const driver = await online('economico', z);
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ pickup: z }));
  await until(() => driver.log['ride:offer']?.[0]);
  driver.emit('ride:accept', { rideId: r.ride.id });
  await waitStatus(pax, 'accepted');

  pax.emit('ride:cancel', { rideId: r.ride.id, reason: 'Mudei de planos' });
  await waitStatus(pax, 'cancelled');
  await waitStatus(driver, 'cancelled');
  const c = driver.log['ride:update'].find((u) => u.status === 'cancelled');
  assert.equal(c.cancelledBy, 'passenger');
  assert.equal(c.cancelReason, 'Mudei de planos');

  const pax2 = await client();
  const r2 = await ack(pax2, 'ride:request', reqBody({ pickup: z }));
  await until(() => driver.log['ride:offer']?.some((o) => o.ride.id === r2.ride.id));
});

test('passageiro cancela enquanto procura', async () => {
  const z = ZONE(5);
  const driver = await online('moto', z);
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'moto', pickup: z }));
  await until(() => driver.log['ride:offer']);
  pax.emit('ride:cancel', { rideId: r.ride.id });
  await waitStatus(pax, 'cancelled');
  await waitStatus(driver, 'cancelled');
});

test('motorista cai durante a viagem → volta a searching e passa a outro', async () => {
  const z = ZONE(6);
  const a = await online('conforto', z);
  const b = await online('conforto', { lat: z.lat - 0.02, lng: z.lng });
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'conforto', pickup: z }));
  await until(() => a.log['ride:offer']);
  a.emit('ride:accept', { rideId: r.ride.id });
  await waitStatus(pax, 'accepted');
  a.disconnect();
  await waitStatus(pax, 'searching');
  const offer = await until(() => b.log['ride:offer']?.[0]);
  assert.equal(offer.ride.id, r.ride.id);
});

test('validação de ride:request', async () => {
  const pax = await client();
  for (const bad of [
    null,
    reqBody({ category: 'luxo' }),
    reqBody({ payment: 'cartao' }),
    reqBody({ pickup: { lat: 'x', lng: 1, address: '' } }),
    reqBody({ dropoff: { lat: 100, lng: 1, address: '' } }),
  ]) {
    const r = await ack(pax, 'ride:request', bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.error, 'string');
  }
});

test('REST: health, quote, erros', async () => {
  const base = `http://127.0.0.1:${port}`;
  const post = (body) =>
    fetch(`${base}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.ok, true);
  assert.equal(typeof h.drivers, 'number');
  const bad = await post(JSON.stringify({ origin: { lat: 'a' } }));
  assert.equal(bad.status, 400);
  assert.equal(typeof (await bad.json()).error, 'string');
  const q = await (await post(JSON.stringify({ origin: BAIXA, destination: DEST }))).json();
  // o preço usa a distância real do motorista livre mais próximo da recolha
  const pk = srv.rides.nearestFree('economico', BAIXA) ?? DEFAULT_PICKUP_M;
  assert.equal(q.prices.economico, priceFor('economico', 5000, 600, { pickupMeters: pk }));
  assert.equal(q.fares.economico.total, q.prices.economico);
  assert.equal(typeof q.quoteId, 'string');
  assert.equal(q.period.id, 'normal');
  assert.equal((await post('{oops')).status, 400);
  const ac = await (await fetch(`${base}/api/places/autocomplete?input=a`)).json();
  assert.deepEqual(ac, { suggestions: [] });
  const pr = await (await fetch(`${base}/api/pricing`)).json();
  assert.equal(pr.fuel.gasolina, 93.69);
  assert.equal(pr.period.id, 'normal');
});

test('preço garantido: ride:request com quoteId usa a cotação (sem nova rota)', async () => {
  const z = ZONE(7);
  const base = `http://127.0.0.1:${port}`;
  const q = await (
    await fetch(`${base}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: z, destination: DEST }),
    })
  ).json();
  const before = routeCalls;
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ pickup: z, quoteId: q.quoteId }));
  assert.equal(r.ok, true);
  assert.equal(routeCalls, before, 'não voltou a pedir a rota');
  assert.equal(r.ride.price, q.prices.economico);
  pax.emit('ride:cancel', { rideId: r.ride.id });
  await until(() => statuses(pax).some((s) => s === 'no_drivers' || s === 'cancelled'));
});

test('nota do passageiro chega ao motorista; motorista cancela com motivo', async () => {
  const z = ZONE(8);
  const driver = await online('economico', z);
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ pickup: z, note: '  Portão azul, ao lado da farmácia  ' }));
  const offer = await until(() => driver.log['ride:offer']?.[0]);
  assert.equal(offer.ride.note, 'Portão azul, ao lado da farmácia');

  driver.emit('ride:accept', { rideId: r.ride.id });
  await waitStatus(pax, 'accepted');

  // a conversa foi removida: o servidor ignora estes eventos
  pax.emit('chat:send', { rideId: r.ride.id, text: 'olá' });
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(driver.log['chat:message'], undefined);

  driver.emit('ride:cancel', { rideId: r.ride.id, reason: 'O passageiro não apareceu' });
  await waitStatus(pax, 'cancelled');
  const c = pax.log['ride:update'].find((u) => u.status === 'cancelled');
  assert.equal(c.cancelledBy, 'driver');
  assert.equal(c.cancelReason, 'O passageiro não apareceu');
});

test('avaliação: só o passageiro, só uma vez, 1 a 5', async () => {
  const z = ZONE(9);
  const driver = await online('moto', z);
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'moto', pickup: z }));
  await until(() => driver.log['ride:offer']?.[0]);
  driver.emit('ride:accept', { rideId: r.ride.id });
  for (const [ev, st] of [['ride:arrived', 'arrived'], ['ride:start', 'in_progress'], ['ride:complete', 'completed']]) {
    driver.emit(ev, { rideId: r.ride.id });
    await waitStatus(pax, st);
  }
  assert.equal((await ack(driver, 'ride:rate', { rideId: r.ride.id, stars: 5 })).ok, false);
  assert.equal((await ack(pax, 'ride:rate', { rideId: r.ride.id, stars: 9 })).ok, false);
  assert.equal((await ack(pax, 'ride:rate', { rideId: r.ride.id, stars: 1 })).ok, true);
  assert.equal((await ack(pax, 'ride:rate', { rideId: r.ride.id, stars: 5 })).ok, false);
});

test('aprendizagem: o servidor regista cotações, pedidos e respostas', async () => {
  const z = ZONE(10);
  const d = await online('conforto', z);
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'conforto', pickup: z }));
  await until(() => d.log['ride:offer']?.[0]);
  d.emit('ride:decline', { rideId: r.ride.id });
  await waitStatus(pax, 'no_drivers');
  const keys = [];
  // a store guarda por zona e pela cidade inteira
  for (const k of ['o', 'q']) {
    const row = srv.rides.market.store.get(`${k}|*|normal${k === 'o' ? '|conforto' : ''}`);
    keys.push(row);
  }
  assert.ok(keys[0].declined >= 1, 'recusa registada');
  assert.ok(keys[1].requests >= 1, 'pedido registado');
  const pr = await (await fetch(`http://127.0.0.1:${port}/api/pricing`)).json();
  assert.equal(typeof pr.learning.conforto, 'number');
});

test('WhatsApp: pedido sem número válido é recusado; motorista sem número não fica online', async () => {
  const pax = await client();
  for (const phone of [undefined, '', '12345', '84 123 456', '81 123 4567', '+351 912 345 678']) {
    const r = await ack(pax, 'ride:request', reqBody({ pickup: ZONE(11), phone }));
    assert.equal(r.ok, false, String(phone));
    assert.match(r.error, /WhatsApp/);
  }
  const d = await client();
  const before = srv.rides.driverCount();
  d.emit('driver:online', { name: 'X', car: 'Y', plate: 'Z', category: 'moto', location: ZONE(11) });
  await until(() => d.log['driver:error']?.[0]);
  assert.match(d.log['driver:error'][0].error, /WhatsApp/);
  assert.equal(srv.rides.driverCount(), before);
});

test('dados guardados: cliente só nome e WhatsApp; viagem sem moradas; avaliação sobrevive ao desligar', async () => {
  const repo = srv.rides.repo;
  const z = ZONE(12);
  const phone = '87 765 4321';
  let d = await online('conforto', z, phone);
  const pax = await client();
  const r = await ack(pax, 'ride:request', reqBody({ category: 'conforto', pickup: z, passengerName: 'Maria', phone: '+258 82 555 0000' }));
  assert.equal(r.ok, true);

  // cliente: exactamente { phone, name }
  assert.deepEqual(repo._passengers.get('+258825550000'), { phone: '+258825550000', name: 'Maria' });

  await until(() => d.log['ride:offer']?.[0]);
  d.emit('ride:accept', { rideId: r.ride.id });
  for (const [ev, st] of [['ride:arrived', 'arrived'], ['ride:start', 'in_progress'], ['ride:complete', 'completed']]) {
    d.emit(ev, { rideId: r.ride.id });
    await waitStatus(pax, st);
  }
  assert.equal((await ack(pax, 'ride:rate', { rideId: r.ride.id, stars: 1 })).ok, true);

  // viagem guardada sem moradas, sem coordenadas e sem dados do passageiro
  const saved = await until(() => repo._rides.get(r.ride.id));
  assert.equal(saved.status, 'completed');
  assert.equal(saved.driverPhone, '+258877654321');
  assert.equal(saved.price, r.ride.price);
  assert.equal(saved.driverEarnings + saved.platformFee, saved.price);
  assert.equal(saved.rating, 1);
  const json = JSON.stringify(saved);
  for (const forbidden of ['Maria', '825550000', 'Zona', 'address', 'pickup', 'dropoff', '"lat"']) {
    assert.ok(!json.includes(forbidden), `a viagem guardada não pode conter ${forbidden}`);
  }

  // o motorista desliga e volta: a avaliação (puxada para baixo pelo 1) mantém-se
  const ratingBefore = repo._drivers.get('+258877654321').rating;
  assert.ok(ratingBefore < 4.8);
  d.disconnect();
  await until(() => !srv.rides.nearestFree('conforto', z));
  d = await online('conforto', z, phone);
  const pax2 = await client();
  const r2 = await ack(pax2, 'ride:request', reqBody({ category: 'conforto', pickup: z }));
  await until(() => d.log['ride:offer']?.[0]);
  d.emit('ride:accept', { rideId: r2.ride.id });
  await waitStatus(pax2, 'accepted');
  const acc = pax2.log['ride:update'].find((u) => u.status === 'accepted');
  assert.equal(acc.driver.rating, Math.round(ratingBefore * 10) / 10);
  assert.equal(acc.driver.phone, undefined, 'o WhatsApp do motorista não é enviado ao passageiro');
  pax2.emit('ride:cancel', { rideId: r2.ride.id, reason: 'teste' });
  await waitStatus(pax2, 'cancelled');
});

test('geocode reverso: valida coordenadas', async () => {
  const bad = await fetch(`http://127.0.0.1:${port}/api/geocode/reverse?lat=abc&lng=1`);
  assert.equal(bad.status, 400);
});

test('google.reverse: Places primeiro, OpenStreetMap como reserva, sem resposta -> "Ponto no mapa"', async () => {
  const prev = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'teste';
  try {
    let mode = 'places';
    const fetchImpl = async (url) => {
      if (url.includes('places.googleapis.com')) {
        if (mode !== 'places') return { ok: true, json: async () => ({ places: [] }) };
        return { ok: true, json: async () => ({ places: [{ displayName: { text: 'Shoprite' }, formattedAddress: 'Av. Acordos de Lusaka, Maputo' }] }) };
      }
      if (url.includes('nominatim')) {
        if (mode === 'nada') return { ok: false, status: 500 };
        if (mode === 'mar') return { ok: true, json: async () => ({ display_name: 'Moçambique', address: { country: 'Moçambique' } }) };
        return { ok: true, json: async () => ({ address: { road: 'Av. 24 de Julho', suburb: 'Polana', city: 'Maputo' } }) };
      }
      throw new Error('inesperado ' + url);
    };
    const g = createGoogle({ fetchImpl });
    assert.equal((await g.reverse({ lat: -25.95, lng: 32.59 })).address, 'Shoprite, Av. Acordos de Lusaka, Maputo');
    mode = 'osm';
    assert.equal((await g.reverse({ lat: -25.96, lng: 32.59 })).address, 'Av. 24 de Julho, Polana, Maputo');
    mode = 'nada';
    assert.equal((await g.reverse({ lat: -25.97, lng: 32.59 })).address, 'Ponto no mapa');
    // no mar o OpenStreetMap só devolve o país: não serve como morada
    mode = 'mar';
    assert.equal((await g.reverse({ lat: -25.955, lng: 32.625 })).address, 'Ponto no mapa');
    // cache: o mesmo ponto não volta a perguntar
    mode = 'places';
    assert.equal((await g.reverse({ lat: -25.97, lng: 32.59 })).address, 'Ponto no mapa');
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = prev;
  }
});

test('google.route: com trânsito; se a Google recusar, recua sem trânsito', async () => {
  const bodies = [];
  let reject = false;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body.routingPreference);
    if (reject && body.routingPreference === 'TRAFFIC_AWARE') return { ok: false, status: 403 };
    return {
      ok: true,
      json: async () => ({
        routes: [{ distanceMeters: 4000, duration: '900s', staticDuration: '600s', polyline: { encodedPolyline: '' } }],
      }),
    };
  };
  const prevKey = process.env.GOOGLE_ROUTES_API_KEY;
  process.env.GOOGLE_ROUTES_API_KEY = 'teste';
  try {
    const g = createGoogle({ fetchImpl });
    const r = await g.route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 });
    assert.equal(r.durationSeconds, 900);
    assert.equal(r.staticDurationSeconds, 600);
    assert.deepEqual(bodies, ['TRAFFIC_AWARE']);

    reject = true;
    const g2 = createGoogle({ fetchImpl });
    bodies.length = 0;
    const r2 = await g2.route({ lat: 1, lng: 1 }, { lat: 3, lng: 3 });
    assert.equal(r2.distanceMeters, 4000);
    assert.deepEqual(bodies, ['TRAFFIC_AWARE', 'TRAFFIC_UNAWARE']);
    bodies.length = 0;
    await g2.route({ lat: 1, lng: 1 }, { lat: 4, lng: 4 });
    assert.deepEqual(bodies, ['TRAFFIC_UNAWARE'], 'não insiste no trânsito durante 30 min');
  } finally {
    if (prevKey === undefined) delete process.env.GOOGLE_ROUTES_API_KEY;
    else process.env.GOOGLE_ROUTES_API_KEY = prevKey;
  }
});
