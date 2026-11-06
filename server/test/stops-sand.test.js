import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { CATEGORIES, MAX_STOPS, STOP_WAIT_MIN, fareFor, ratesFor, priceRoute } from '../src/pricing.js';
import { createQuoteService } from '../src/quotes.js';
import { createServer } from '../src/server.js';
import { decodePolyline } from '../src/google.js';
import { buildIndex, classifyWay, createSurface, encodePolyline, onSand, samplePath, summarize } from '../src/surface.js';

const sum = (b) => Object.values(b).reduce((a, x) => a + x, 0);
const NOON = new Date(Date.UTC(2026, 10, 4, 10, 0)); // quarta, 12:00 em Maputo
const A = { lat: -25.9692, lng: 32.5732 };
const B = { lat: -25.9622, lng: 32.4589 };
const S1 = { lat: -25.955, lng: 32.53 };
const S2 = { lat: -25.95, lng: 32.5 };

// ---------------------------------------------------------------------------
// Preço: paragens e areia
// ---------------------------------------------------------------------------

test('paragens: cada paragem soma valor fixo + 3 min de espera; repartição bate certo', () => {
  for (const c of CATEGORIES) {
    let prev = fareFor(c, 6000, 900, { pickupMeters: 0 });
    for (let n = 1; n <= MAX_STOPS; n++) {
      const f = fareFor(c, 6000, 900, { pickupMeters: 0, stops: n });
      assert.ok(f.total > prev.total, `${c} ${n} paragens: ${f.total} <= ${prev.total}`);
      assert.ok(f.breakdown.stops > 0);
      assert.equal(sum(f.breakdown), f.total);
      assert.equal(f.driverEarnings + f.platformFee, f.total);
      prev = f;
    }
    // nunca mais do que MAX_STOPS, nem valores estranhos
    assert.equal(fareFor(c, 6000, 900, { stops: 99 }).total, fareFor(c, 6000, 900, { stops: MAX_STOPS }).total);
    assert.equal(fareFor(c, 6000, 900, { stops: -2 }).total, fareFor(c, 6000, 900).total);
    assert.equal(fareFor(c, 6000, 900, { stops: 'x' }).total, fareFor(c, 6000, 900).total);
  }
});

test('paragens: valor por paragem aproximado (sem garantia nem arredondamentos)', () => {
  const r = ratesFor('economico');
  const per = r.paragem + STOP_WAIT_MIN * r.porMin; // 15 + 3 × 2,92 ≈ 23,8 líquido
  const a = fareFor('economico', 10000, 1200, { pickupMeters: 0 });
  const b = fareFor('economico', 10000, 1200, { pickupMeters: 0, stops: 1 });
  const diff = b.total - a.total;
  // ao passageiro: líquido / (1 − 12%) ≈ 27 MZN, arredondado a 5
  assert.ok(diff >= 20 && diff <= 35, `diferença ${diff} (líquido ${per.toFixed(1)})`);
});

test('areia: cobra mais em areia, o Económico sofre mais do que o Conforto (em proporção)', () => {
  for (const c of CATEGORIES) {
    const base = fareFor(c, 8000, 1200, { pickupMeters: 0 });
    const half = fareFor(c, 8000, 1200, { pickupMeters: 0, sandMeters: 4000 });
    const all = fareFor(c, 8000, 1200, { pickupMeters: 0, sandMeters: 8000 });
    const more = fareFor(c, 8000, 1200, { pickupMeters: 0, sandMeters: 99999 });
    assert.ok(half.total > base.total && all.total > half.total, `${c}: ${base.total} ${half.total} ${all.total}`);
    assert.equal(more.total, all.total, 'areia nunca passa a distância total');
    assert.ok(all.breakdown.sand > 0);
    assert.equal(sum(all.breakdown), all.total);
    assert.equal(fareFor(c, 8000, 1200, { sandMeters: NaN }).total, fareFor(c, 8000, 1200).total);
  }
  const extra = (c) => {
    const b = fareFor(c, 8000, 1200, { pickupMeters: 0 }).total;
    return fareFor(c, 8000, 1200, { pickupMeters: 0, sandMeters: 8000 }).total / b;
  };
  assert.ok(extra('economico') > extra('conforto'), 'carro baixo paga mais a areia');
});

test('areia e paragens também protegem a garantia do motorista', () => {
  for (const c of CATEGORIES) {
    const f = fareFor(c, 3000, 1800, { pickupMeters: 2000, stops: 2, sandMeters: 3000, multiplier: 0.9 });
    assert.ok(f.driverEarnings >= f.driverCost, `${c}: ${f.driverEarnings} < ${f.driverCost}`);
  }
});

test('priceRoute passa paragens e areia a todas as categorias', () => {
  const route = { distanceMeters: 7000, durationSeconds: 1000 };
  const plain = priceRoute(route, { date: NOON });
  const q = priceRoute(route, { date: NOON, stops: 1, sandMeters: 2000 });
  for (const c of CATEGORIES) {
    assert.ok(q.prices[c] > plain.prices[c]);
    assert.ok(q.fares[c].breakdown.stops > 0 && q.fares[c].breakdown.sand > 0);
  }
});

// ---------------------------------------------------------------------------
// Estradas de areia (dados do OpenStreetMap guardados no servidor)
// ---------------------------------------------------------------------------

test('classifyWay: areia, alcatrão e sem informação', () => {
  assert.equal(classifyWay({ highway: 'residential', surface: 'sand' }), 'sand');
  assert.equal(classifyWay({ highway: 'residential', surface: 'unpaved' }), 'sand');
  assert.equal(classifyWay({ highway: 'unclassified', surface: 'dirt' }), 'sand');
  assert.equal(classifyWay({ highway: 'track' }), 'sand');
  assert.equal(classifyWay({ highway: 'track', surface: 'asphalt' }), 'paved');
  assert.equal(classifyWay({ highway: 'service', tracktype: 'grade4' }), 'sand');
  assert.equal(classifyWay({ highway: 'primary', surface: 'asphalt' }), 'paved');
  assert.equal(classifyWay({ highway: 'residential', surface: 'paving_stones' }), 'paved');
  assert.equal(classifyWay({ highway: 'residential' }), 'unknown');
  assert.equal(classifyWay(undefined), 'unknown');
  assert.equal(classifyWay(null), 'unknown');
});

test('encodePolyline: ida e volta com o descodificador do Google', () => {
  const pts = [A, S1, B];
  const back = decodePolyline(encodePolyline(pts));
  assert.equal(back.length, 3);
  back.forEach((p, i) => {
    assert.ok(Math.abs(p.lat - pts[i].lat) < 1e-5);
    assert.ok(Math.abs(p.lng - pts[i].lng) < 1e-5);
  });
  assert.equal(encodePolyline([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
});

test('samplePath: pontos igualmente espaçados, com início, fim e direcção', () => {
  const path = [A, { lat: -25.9692, lng: 32.5232 }];
  const s = samplePath(path);
  assert.ok(s.length >= 50 && s.length <= 400, String(s.length));
  assert.equal(s[0].lat, A.lat);
  assert.equal(s[0].lng, A.lng);
  assert.ok(Math.abs(s[s.length - 1].lng - 32.5232) < 1e-9);
  assert.ok(Math.abs(s[3].dir.x + 1) < 1e-6, 'segue para oeste');
  assert.deepEqual(samplePath([]), []);
  assert.equal(samplePath([A]).length, 1);
  assert.equal(samplePath([A, A]).length, 2);
  assert.ok(samplePath([A, null, { lat: NaN, lng: 1 }, B]).length >= 2);
});

// Rua de areia de oeste para este (2 km), a lat -25.96
const SAND_ROAD = [{ lat: -25.96, lng: 32.5 }, { lat: -25.96, lng: 32.52 }];

test('onSand: segue pela rua de areia = areia; atravessá-la num cruzamento = não', () => {
  const idx = buildIndex([SAND_ROAD]);
  const along = samplePath([{ lat: -25.96005, lng: 32.505 }, { lat: -25.96005, lng: 32.51 }]);
  assert.ok(along.every((p) => onSand(idx, p)));
  const across = samplePath([{ lat: -25.9595, lng: 32.51 }, { lat: -25.9605, lng: 32.51 }]);
  assert.ok(across.every((p) => !onSand(idx, p)), 'perpendicular não conta');
  const parallelFar = samplePath([{ lat: -25.9605, lng: 32.505 }, { lat: -25.9605, lng: 32.51 }]); // ~55 m ao lado
  assert.ok(parallelFar.every((p) => !onSand(idx, p)));
});

test('summarize: metros em areia e se a recolha/destino são em areia', () => {
  const s = summarize([true, false, false], 3000);
  assert.equal(s.sandMeters, 1000);
  assert.equal(s.pickupSand, true);
  assert.equal(s.dropoffSand, false);
  assert.equal(summarize([], 1000), null);
});

test('createSurface: percurso meio em areia, meio em alcatrão', async () => {
  const sf = createSurface({ ways: [encodePolyline(SAND_ROAD)], enabled: true });
  // 1 km pela rua de areia, depois 1 km para norte (sem dados = não é areia)
  const path = [{ lat: -25.96, lng: 32.51 }, { lat: -25.96, lng: 32.52 }, { lat: -25.951, lng: 32.52 }];
  const r = await sf.analyse(path, 2000);
  assert.ok(r.sandRatio > 0.4 && r.sandRatio < 0.6, JSON.stringify(r));
  assert.equal(r.pickupSand, true);
  assert.equal(r.dropoffSand, false);
  const off = createSurface({ ways: [SAND_ROAD], enabled: false });
  assert.equal(await off.analyse(path, 2000), null);
  const boxed = createSurface({ ways: [SAND_ROAD], bbox: [-26, 32.4, -25.9, 32.6], enabled: true });
  assert.equal(await boxed.analyse([{ lat: -19.8, lng: 34.8 }, { lat: -19.81, lng: 34.81 }], 1000), null, 'fora da zona');
});

test('dados reais da Grande Maputo: carregam e a Baixa (alcatrão) não é areia', async () => {
  const sf = createSurface({ enabled: true });
  assert.ok(sf.segments() > 10000, String(sf.segments()));
  const baixa = [{ lat: -25.9692, lng: 32.5732 }, { lat: -25.965, lng: 32.58 }, { lat: -25.96, lng: 32.585 }];
  const r = await sf.analyse(baixa, 1500);
  assert.equal(r.sandMeters, 0);
});

// ---------------------------------------------------------------------------
// Cotações e viagens com paragens
// ---------------------------------------------------------------------------

test('cotação com paragens: rota passa pelas paragens e o preço garantido exige as mesmas', async () => {
  let seen = null;
  const qs = createQuoteService({
    route: async (o, d, stops) => {
      seen = stops;
      return { distanceMeters: 9000, durationSeconds: 1200, polyline: [o, ...stops, d] };
    },
    clock: () => NOON,
    pickup: () => 0,
  });
  const plain = await qs.quote(A, B);
  const q = await qs.quote(A, B, [S1, S2]);
  assert.deepEqual(seen, [S1, S2]);
  assert.deepEqual(q.stops, [S1, S2]);
  assert.equal(q.polyline.length, 4);
  assert.ok(q.prices.economico > plain.prices.economico);
  assert.equal(qs.lookup(q.quoteId, A, B, [S1, S2]), q);
  assert.equal(qs.lookup(q.quoteId, A, B, [S1]), null, 'faltou uma paragem');
  assert.equal(qs.lookup(q.quoteId, A, B, [S2, S1]), null, 'ordem diferente');
  assert.equal(qs.lookup(q.quoteId, A, B), null);
  assert.equal(qs.lookup(plain.quoteId, A, B, []), plain);
});

test('cotação com areia: preço sobe e o aviso vem na cotação', async () => {
  const route = async (o, d) => ({ distanceMeters: 6000, durationSeconds: 900, polyline: [o, d] });
  const plain = await createQuoteService({ route, clock: () => NOON, pickup: () => 0 }).quote(A, B);
  const sandy = await createQuoteService({
    route,
    clock: () => NOON,
    pickup: () => 0,
    surface: { analyse: async () => ({ sandMeters: 3000, sandRatio: 0.5, pickupSand: true, dropoffSand: false }) },
  }).quote(A, B);
  assert.deepEqual(sandy.surface, { sandMeters: 3000, sandRatio: 0.5, pickupSand: true, dropoffSand: false });
  for (const c of CATEGORIES) assert.ok(sandy.prices[c] > plain.prices[c], c);
  const broken = await createQuoteService({
    route,
    clock: () => NOON,
    pickup: () => 0,
    surface: { analyse: async () => { throw new Error('x'); } },
  }).quote(A, B);
  assert.equal(broken.surface, null);
  assert.equal(broken.prices.economico, plain.prices.economico);
});

// Servidor real (rota de teste, sem internet)
let srv;
const sockets = [];
after(async () => {
  sockets.forEach((s) => s.disconnect());
  await srv?.close();
});

test('servidor: /api/quote e ride:request com paragens', async () => {
  const calls = [];
  srv = createServer({
    route: async (o, d, stops = []) => {
      calls.push(stops.length);
      return { distanceMeters: 8000, durationSeconds: 1100, staticDurationSeconds: 1100, polyline: [o, ...stops, d] };
    },
    clock: () => NOON,
    nearbyIntervalMs: 100000,
  });
  const port = await srv.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const post = (body) =>
    fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const q = await (await post({ origin: A, destination: B, stops: [S1] })).json();
  assert.deepEqual(q.stops, [S1]);
  assert.equal(q.surface, null, 'com rota de teste não consulta o Overpass');
  const tooMany = await post({ origin: A, destination: B, stops: [S1, S1, S1, S1] });
  assert.equal(tooMany.status, 400);
  assert.match((await tooMany.json()).error, /Paragens/);
  assert.equal((await post({ origin: A, destination: B, stops: [{ lat: 'x' }] })).status, 400);
  assert.equal((await post({ origin: A, destination: B, stops: 'x' })).status, 400);
  assert.equal((await post({ origin: A, destination: B, stops: null })).status, 200);

  const pax = connect(base, { forceNew: true, transports: ['websocket'] });
  sockets.push(pax);
  await new Promise((res, rej) => {
    pax.once('connect', res);
    pax.once('connect_error', rej);
  });
  const ask = (p) => new Promise((res) => pax.emit('ride:request', p, res));
  const body = {
    pickup: { ...A, address: 'Baixa' },
    dropoff: { ...B, address: 'Matola' },
    stops: [{ ...S1, address: 'Farmácia' }],
    category: 'economico',
    payment: 'dinheiro',
    passengerName: 'Ana',
    phone: '84 123 4567',
    quoteId: q.quoteId,
  };
  const before = calls.length;
  const r = await ask(body);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ride.price, q.prices.economico, 'preço garantido da cotação');
  assert.equal(calls.length, before, 'usou a cotação guardada (não recalculou a rota)');
  assert.deepEqual(r.ride.stops, [{ ...S1, address: 'Farmácia' }]);
  assert.ok(r.ride.fare.breakdown.stops > 0);
  pax.emit('ride:cancel', { rideId: r.ride.id });

  const bad = await ask({ ...body, stops: [S1, S1, S1, S1] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Paragens/);
});
