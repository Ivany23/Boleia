import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  PLATFORM_FEE,
  allPrices,
  demandMultiplier,
  fareFor,
  periodAt,
  priceFor,
  priceRoute,
  pricingInfo,
  ratesFor,
  trafficLevel,
} from '../src/pricing.js';
import { decodePolyline } from '../src/google.js';
import { haversine } from '../src/geo.js';
import { createQuoteService } from '../src/quotes.js';

// Hora de Maputo = UTC+2
const maputo = (y, mo, d, h, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 2, mi));
const WED_NOON = maputo(2026, 11, 4, 12); // quarta-feira

test('preço: mínimos por categoria', () => {
  assert.equal(priceFor('moto', 0, 0), 40);
  assert.equal(priceFor('economico', 500, 60), 100);
  assert.equal(priceFor('conforto', 0, 0), 150);
});

test('preço: económico 5 km / 10 min (gasolina 93,69)', () => {
  // porKm = 7,5/100 × 93,69 × 1,25 + 3,5 + 3 = 15,28 ; porMin = 0,012 × 93,69 + 1,2 = 2,32
  // líquido = 40 + 76,42 + 23,24 = 139,66 ; total = 139,66 / 0,88 = 158,7 -> 160
  assert.equal(priceFor('economico', 5000, 600), 160);
  // noite ×1,25: 174,6 / 0,88 = 198,4 -> 200
  assert.equal(priceFor('economico', 5000, 600, { multiplier: 1.25 }), 200);
});

test('preço: múltiplos de 5 e ordem moto < económico < conforto', () => {
  for (const [m, s] of [[8123, 977], [1500, 300], [25000, 3600]]) {
    const p = allPrices(m, s);
    for (const v of Object.values(p)) assert.equal(v % 5, 0);
    assert.ok(p.moto < p.economico && p.economico < p.conforto, JSON.stringify(p));
  }
});

test('preço: sobe com o combustível e com o tempo no trânsito', () => {
  const normal = fareFor('economico', 10000, 1200).total;
  assert.ok(fareFor('economico', 10000, 1200, { fuelPrice: 130 }).total > normal);
  assert.ok(fareFor('economico', 10000, 2400).total > normal, 'mais tempo parado custa mais');
});

test('tarifa: motorista + comissão = total; repartição soma o total', () => {
  for (const c of CATEGORIES) {
    for (const mult of [1, 1.2, 1.6]) {
      const f = fareFor(c, 7300, 900, { multiplier: mult });
      assert.equal(f.driverEarnings + f.platformFee, f.total);
      const b = f.breakdown;
      assert.equal(b.base + b.distance + b.time + b.surcharge, f.total);
      assert.ok(b.distance >= 0 && b.time >= 0 && b.surcharge >= 0);
      assert.ok(Math.abs(f.platformFee - f.total * PLATFORM_FEE) <= 1);
    }
  }
});

test('tarifa: o motorista cobre sempre o combustível da viagem', () => {
  // 10 km de económico gastam 0,75 L (+25% de km vazios) = ~88 MZN
  const f = fareFor('economico', 10000, 900);
  const fuel = 0.075 * 10 * 93.69 * 1.25;
  assert.ok(f.driverEarnings > fuel * 2, `${f.driverEarnings} vs ${fuel}`);
});

test('tarifa: multiplicador limitado a 1,6 e nunca abaixo de 1', () => {
  assert.equal(fareFor('conforto', 10000, 1200, { multiplier: 5 }).multiplier, 1.6);
  assert.equal(fareFor('conforto', 10000, 1200, { multiplier: 0.2 }).multiplier, 1);
  assert.equal(fareFor('conforto', 10000, 1200, { multiplier: NaN }).multiplier, 1);
});

test('preço: categoria inválida', () => {
  assert.throws(() => priceFor('luxo', 1, 1));
  assert.throws(() => ratesFor('luxo'));
});

test('horários de Maputo', () => {
  assert.equal(periodAt(WED_NOON).id, 'normal');
  assert.equal(periodAt(maputo(2026, 11, 4, 7, 30)).id, 'ponta_manha');
  assert.equal(periodAt(maputo(2026, 11, 4, 9, 0)).id, 'normal');
  assert.equal(periodAt(maputo(2026, 11, 4, 16, 29)).id, 'normal');
  assert.equal(periodAt(maputo(2026, 11, 4, 16, 30)).id, 'ponta_tarde');
  assert.equal(periodAt(maputo(2026, 11, 4, 19, 29)).id, 'ponta_tarde');
  assert.equal(periodAt(maputo(2026, 11, 4, 19, 30)).id, 'normal');
  assert.equal(periodAt(maputo(2026, 11, 4, 21, 0)).id, 'noite');
  assert.equal(periodAt(maputo(2026, 11, 4, 23, 59)).id, 'noite');
  assert.equal(periodAt(maputo(2026, 11, 5, 4, 59)).id, 'noite');
  assert.equal(periodAt(maputo(2026, 11, 5, 5, 0)).id, 'normal');
  // Sábado (07/11/2026) e domingo não têm hora de ponta
  assert.equal(periodAt(maputo(2026, 11, 7, 7, 30)).id, 'normal');
  assert.equal(periodAt(maputo(2026, 11, 8, 17, 0)).id, 'normal');
  // 22h UTC de terça = 00h de quarta em Maputo -> noite
  assert.equal(periodAt(new Date(Date.UTC(2026, 10, 3, 22, 0))).id, 'noite');
});

test('trânsito e procura', () => {
  assert.equal(trafficLevel(600, 600), 'livre');
  assert.equal(trafficLevel(780, 600), 'moderado');
  assert.equal(trafficLevel(900, 600), 'intenso');
  assert.equal(trafficLevel(600, 0), 'desconhecido');
  assert.equal(demandMultiplier(1, 3), 1);
  assert.equal(demandMultiplier(3, 0), 1);
  assert.equal(demandMultiplier(3, 1), 1.2);
  assert.equal(demandMultiplier(100, 1), 1.3);
});

test('priceRoute: aplica horário × procura a todas as categorias', () => {
  const route = { distanceMeters: 5000, durationSeconds: 900, staticDurationSeconds: 600 };
  const night = maputo(2026, 11, 4, 22);
  const q = priceRoute(route, { date: night, demand: (c) => (c === 'moto' ? 1.2 : 1) });
  assert.equal(q.period.id, 'noite');
  assert.equal(q.traffic, 'intenso');
  assert.equal(q.highDemand, true);
  assert.equal(q.fares.moto.multiplier, 1.5);
  assert.equal(q.fares.economico.multiplier, 1.25);
  for (const c of CATEGORIES) assert.equal(q.prices[c], q.fares[c].total);
});

test('pricingInfo', () => {
  const i = pricingInfo(WED_NOON);
  assert.equal(i.fuel.gasolina, 93.69);
  assert.equal(i.fuel.gasoleo, 116.25);
  assert.equal(i.period.id, 'normal');
  assert.ok(i.rates.economico.porKm > 15 && i.rates.economico.porKm < 16);
});

test('cotações: preço garantido 5 min e só para os mesmos locais', async () => {
  let now = WED_NOON.getTime();
  const qs = createQuoteService({
    route: async (o, d) => ({ distanceMeters: 5000, durationSeconds: 600, polyline: [o, d] }),
    clock: () => new Date(now),
  });
  const A = { lat: -25.9692, lng: 32.5732 };
  const B = { lat: -25.9622, lng: 32.4589 };
  const q = await qs.quote(A, B);
  assert.equal(typeof q.quoteId, 'string');
  assert.equal(q.prices.economico, 160);
  assert.equal(q.staticDurationSeconds, 600);
  assert.equal(qs.lookup(q.quoteId, A, B), q);
  assert.equal(qs.lookup(q.quoteId, A, { lat: -25.9, lng: 32.4 }), null, 'destino diferente');
  assert.equal(qs.lookup('nao-existe', A, B), null);
  assert.equal(qs.lookup(undefined, A, B), null);
  now += 5 * 60 * 1000 + 1;
  assert.equal(qs.lookup(q.quoteId, A, B), null, 'expirou');
  await qs.quote(A, B);
  assert.equal(qs.size(), 1, 'cotações expiradas são apagadas');
});

test('polyline: exemplo da documentação do Google', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(pts.length, 3);
  const exp = [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ];
  pts.forEach((p, i) => {
    assert.ok(Math.abs(p.lat - exp[i][0]) < 1e-6);
    assert.ok(Math.abs(p.lng - exp[i][1]) < 1e-6);
  });
  assert.deepEqual(decodePolyline(''), []);
});

test('haversine', () => {
  assert.equal(haversine({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
  const d = haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(d - 111195) < 200);
  const m = haversine({ lat: -25.9692, lng: 32.5732 }, { lat: -25.9622, lng: 32.4589 });
  assert.ok(m > 11000 && m < 12500, String(m));
});
