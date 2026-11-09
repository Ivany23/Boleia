import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  DRIVER_MIN_HOURLY,
  PLATFORM_FEE,
  SERVICE_FEE,
  allPrices,
  demandMultiplier,
  driverMinHourlyFor,
  fareFor,
  periodAt,
  priceFor,
  priceRoute,
  pricingInfo,
  ratesFor,
  trafficLevel,
} from '../src/pricing.js';
import { createMarket, createMemoryStore, createPgStore, learnedFactor, zoneOf } from '../src/market.js';
import { decodePolyline } from '../src/google.js';
import { haversine } from '../src/geo.js';
import { createQuoteService } from '../src/quotes.js';

// Hora de Maputo = UTC+2
const maputo = (y, mo, d, h, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 2, mi));
const WED_NOON = maputo(2026, 11, 4, 12); // quarta-feira
const sumBreakdown = (b) => Object.values(b).reduce((a, x) => a + x, 0);

test('configuração por omissão', () => {
  assert.equal(PLATFORM_FEE, 0.12);
  assert.equal(SERVICE_FEE, 5);
  assert.equal(DRIVER_MIN_HOURLY, 150);
});

test('garantia por categoria: moto 105, económico 150, conforto 195 MZN/hora', () => {
  assert.equal(driverMinHourlyFor('moto'), 105);
  assert.equal(driverMinHourlyFor('economico'), 150);
  assert.equal(driverMinHourlyFor('conforto'), 195);
  // viagem curta (850 m / 4 min): a moto fica bem mais barata do que o carro
  const p = allPrices(850, 240);
  assert.ok(p.moto <= p.economico * 0.65, JSON.stringify(p));
});

test('combustível: carro 1.5 faz 9,5 km/L -> gasolina 93,69 / 9,5 = 9,86 MT por km', () => {
  const r = ratesFor('economico');
  assert.ok(Math.abs(r.fuelKm - 93.69 / 9.5) < 1e-9);
  assert.ok(Math.abs(ratesFor('economico', 94).fuelKm - 94 / 9.5) < 1e-9);
  assert.ok(Math.abs(ratesFor('moto').fuelKm - 93.69 / 35) < 1e-9);
  assert.ok(Math.abs(ratesFor('conforto').fuelKm - 93.69 / 8) < 1e-9);
});

test('preço: económico 5 km / 10 min, recolha 1 km (calculado à mão)', () => {
  // combustível/km = 93,69 / 9,5 = 9,862 ; custo/km = 9,862 + 1,5 = 11,362 ; porKm = 11,362 + 3,5 = 14,862
  // 5 km em 10 min = 30 km/h: nada parado -> 0 min cobrados ; recolha de 1 km = grátis
  // tarifa = 15 + 5 × 14,862 = 89,31
  // garantia = custo 6 km × 11,362 (68,17) + 150/60 × (10 + 3 min de recolha) (32,5) = 100,67 -> líquido 100,67
  // 100,67 / 0,88 = 114,4 -> 115 ; + taxa de serviço 5 = 120
  const f = fareFor('economico', 5000, 600);
  assert.equal(f.total, 120);
  assert.equal(f.platformFee, 14 + 5);
  assert.equal(f.driverEarnings, 101);
  assert.equal(f.breakdown.time, 0, 'a andar, os minutos já estão pagos nos km');
  assert.ok(f.breakdown.guarantee > 0, 'a garantia do motorista foi activada');
  assert.ok(f.driverEarnings - f.driverCost >= 30, 'o motorista tem lucro depois do combustível');
});

test('preço: motorista ao lado (recolha 0 m) fica mais barato', () => {
  // tarifa = 89,31 ; garantia = 56,81 + 25 = 81,81 (não activa) ; 89,31 / 0,88 = 101,5 -> 100 ; + 5 = 105
  assert.equal(priceFor('economico', 5000, 600, { pickupMeters: 0 }), 105);
  assert.ok(priceFor('economico', 5000, 600, { pickupMeters: 4000 }) > 120);
});

test('preço: mínimos por categoria (+ taxa de serviço)', () => {
  assert.equal(priceFor('moto', 0, 0, { pickupMeters: 0 }), 25 + 5);
  assert.equal(priceFor('economico', 500, 60, { pickupMeters: 0 }), 45 + 5);
  assert.equal(priceFor('conforto', 0, 0, { pickupMeters: 0 }), 70 + 5);
});

test('tarifa de bairro: viagens perto do ponto de partida ficam mais baratas', () => {
  for (const c of CATEGORIES) {
    const city = priceFor(c, 1000, 180, { pickupMeters: 0 });
    const local = priceFor(c, 1000, 180, { pickupMeters: 0, local: true });
    assert.ok(local < city, `${c}: ${local} >= ${city}`);
    const f = fareFor(c, 1000, 180, { pickupMeters: 0, local: true });
    assert.equal(f.local, true);
    assert.ok(f.driverEarnings >= f.driverCost, 'mesmo no bairro, o motorista nunca perde');
  }
});

test('preço: barato e sempre com lucro para o motorista (cidade, 22 km/h)', () => {
  const at = (c, km) => fareFor(c, km * 1000, (km / 22) * 3600, { pickupMeters: 500 });
  assert.ok(at('economico', 5).total <= 125);
  assert.ok(at('economico', 1).total <= 50);
  assert.ok(at('moto', 5).total <= 60);
  for (const c of CATEGORIES) {
    for (const km of [1, 3, 5, 10, 20]) {
      const f = at(c, km);
      assert.ok(f.driverEarnings > f.driverCost, `${c} ${km} km: sem lucro`);
    }
  }
});

test('preço: viagens curtas não ficam todas com o mesmo preço', () => {
  const p = [[900, 180], [1300, 240], [1900, 360], [2500, 480]].map(([m, s]) => priceFor('economico', m, s));
  assert.equal(new Set(p).size, p.length, JSON.stringify(p));
  for (let i = 1; i < p.length; i++) assert.ok(p[i] > p[i - 1], JSON.stringify(p));
});

test('preço: noite e ponta sobem SEMPRE o preço (todas as categorias e distâncias)', () => {
  for (const c of CATEGORIES) {
    for (const [m, s] of [[500, 60], [900, 180], [5000, 600], [5000, 720], [10000, 1200], [15600, 1680], [30000, 3600]]) {
      const normal = priceFor(c, m, s);
      const ponta = priceFor(c, m, s, { multiplier: 1.15 });
      const noite = priceFor(c, m, s, { multiplier: 1.25 });
      assert.ok(ponta > normal && noite >= ponta, `${c} ${m}m: ${normal} / ${ponta} / ${noite}`);
      if (c !== 'moto') assert.ok(noite > ponta, `${c} ${m}m: ${ponta} / ${noite}`);
    }
  }
});

test('desconto da aprendizagem nunca tira a garantia ao motorista', () => {
  for (const c of CATEGORIES) {
    const f = fareFor(c, 3000, 900, { multiplier: 0.9 });
    const g = fareFor(c, 3000, 900, { multiplier: 1 });
    assert.ok(f.total <= g.total);
    assert.ok(f.driverEarnings >= f.driverCost, `${c}: ${f.driverEarnings} < custo ${f.driverCost}`);
  }
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

test('tarifa: repartição soma o total; motorista + plataforma = total', () => {
  for (const c of CATEGORIES) {
    for (const mult of [0.9, 1, 1.2, 1.6]) {
      for (const [m, s, pk] of [[7300, 900, 1500], [800, 120, 0], [30000, 3000, 8000]]) {
        const f = fareFor(c, m, s, { multiplier: mult, pickupMeters: pk });
        assert.equal(f.driverEarnings + f.platformFee, f.total);
        assert.equal(sumBreakdown(f.breakdown), f.total, JSON.stringify(f));
        assert.equal(f.breakdown.serviceFee, SERVICE_FEE);
        assert.ok(f.platformFee >= SERVICE_FEE);
      }
    }
  }
});

test('garantia: o motorista recebe sempre custo + lucro mínimo por hora', () => {
  for (const c of CATEGORIES) {
    for (const [m, s, pk] of [[2000, 900, 3000], [5000, 2400, 1500], [15000, 1800, 0], [1000, 600, 5000]]) {
      const f = fareFor(c, m, s, { pickupMeters: pk });
      const r = ratesFor(c);
      const engagedMin = s / 60 + (pk / 1000 / 20) * 60;
      // a andar, o combustível está nos km; ao ralenti só conta o tempo parado (abaixo de 25 km/h)
      const stopped = Math.max(0, s / 60 - (m / 1000 / 25) * 60);
      const cost = ((m + pk) / 1000) * r.costKm + stopped * r.costMin;
      const floor = cost + (driverMinHourlyFor(c) / 60) * engagedMin;
      // tolerância de arredondamento (múltiplos de 5 MZN e comissão inteira)
      assert.ok(f.driverEarnings >= floor - 5, `${c} ${m}m ${s}s: ${f.driverEarnings} < ${floor.toFixed(1)}`);
    }
  }
});

test('tarifa: multiplicador entre 0,9 e 1,6', () => {
  assert.equal(fareFor('conforto', 10000, 1200, { multiplier: 5 }).multiplier, 1.6);
  assert.equal(fareFor('conforto', 10000, 1200, { multiplier: 0.2 }).multiplier, 0.9);
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
  assert.equal(periodAt(maputo(2026, 11, 7, 7, 30)).id, 'normal');
  assert.equal(periodAt(maputo(2026, 11, 8, 17, 0)).id, 'normal');
  assert.equal(periodAt(new Date(Date.UTC(2026, 10, 3, 22, 0))).id, 'noite');
});

test('trânsito e procura instantânea', () => {
  assert.equal(trafficLevel(600, 600), 'livre');
  assert.equal(trafficLevel(780, 600), 'moderado');
  assert.equal(trafficLevel(900, 600), 'intenso');
  assert.equal(trafficLevel(600, 0), 'desconhecido');
  assert.equal(demandMultiplier(1, 3), 1);
  assert.equal(demandMultiplier(3, 0), 1.15, 'nenhum carro livre: +15%');
  assert.equal(demandMultiplier(0, 0), 1, 'sem pedido, sem ajuste');
  assert.equal(demandMultiplier(3, 1), 1.2);
  assert.equal(demandMultiplier(100, 1), 1.3);
});

test('priceRoute: horário × procura × aprendizagem, recolha real', () => {
  const route = { distanceMeters: 5000, durationSeconds: 900, staticDurationSeconds: 600 };
  const night = maputo(2026, 11, 4, 22);
  const q = priceRoute(route, {
    date: night,
    demand: (c) => (c === 'moto' ? 1.2 : 1),
    learning: (c) => (c === 'conforto' ? 0.9 : 1),
    pickup: (c) => (c === 'economico' ? 0 : null),
  });
  assert.equal(q.period.id, 'noite');
  assert.equal(q.traffic, 'intenso');
  assert.equal(q.highDemand, true);
  assert.equal(q.fares.moto.multiplier, 1.5);
  assert.equal(q.fares.economico.multiplier, 1.25);
  assert.ok(Math.abs(q.fares.conforto.multiplier - 1.125) <= 0.01, String(q.fares.conforto.multiplier));
  assert.equal(q.fares.economico.breakdown.pickup, 0);
  for (const c of CATEGORIES) assert.equal(q.prices[c], q.fares[c].total);
});

test('pricingInfo', () => {
  const i = pricingInfo(WED_NOON);
  assert.equal(i.fuel.gasolina, 93.69);
  assert.equal(i.fuel.gasoleo, 116.25);
  assert.equal(i.serviceFee, 5);
  assert.equal(i.driverMinHourly, 150);
  assert.ok(Math.abs(i.rates.economico.combustivelPorKm - 9.86) < 0.01);
  assert.equal(i.rates.economico.kmPorLitro, 9.5);
  assert.equal(i.period.id, 'normal');
  assert.ok(i.rates.economico.porKm > 14 && i.rates.economico.porKm < 15);
  assert.equal(i.maxStops, 3);
  assert.ok(i.rates.economico.paragem > 15 && i.rates.economico.areiaPorKm > 0);
});

// ---------------------------------------------------------------------------
// Aprendizagem e procura suavizada
// ---------------------------------------------------------------------------

test('aprendizagem: factor a partir das respostas', () => {
  const o = (a, d, e) => ({ accepted: a, declined: d, expired: e });
  const q = (quotes, requests) => ({ quotes, requests });
  assert.equal(learnedFactor(null, null), 1);
  assert.equal(learnedFactor(o(2, 3, 0), null), 1, 'poucos dados: não mexe');
  assert.equal(learnedFactor(o(7, 3, 0), null), 1, '70% aceites: equilibrado');
  assert.equal(learnedFactor(o(4, 4, 2), null), 1.1, '40% aceites: sobe');
  assert.equal(learnedFactor(o(0, 10, 10), null), 1.2, 'ninguém aceita: máximo +20%');
  assert.equal(learnedFactor(o(19, 1, 0), q(100, 50)), 1, 'aceitam e os passageiros pedem');
  assert.equal(learnedFactor(o(19, 1, 0), q(100, 10)), 0.92, 'passageiros desistem: desce');
  assert.equal(learnedFactor(o(19, 1, 0), q(100, 0)), 0.9, 'mínimo -10%');
});

test('aprendizagem: zonas, esquecimento e recurso à cidade', () => {
  let t = WED_NOON.getTime();
  const m = createMarket({ clock: () => new Date(t) });
  const A = { lat: -25.9655, lng: 32.5832 };
  const B = { lat: -25.8, lng: 32.4 }; // outra zona
  assert.notEqual(zoneOf(A), zoneOf(B));
  for (let i = 0; i < 10; i++) m.record('declined', { point: A, category: 'economico' });
  assert.equal(m.learning('economico', A), 1.2);
  assert.equal(m.learning('moto', A), 1, 'outra categoria não é afectada');
  // a zona B não tem dados próprios: usa a cidade inteira (mesmos 10 recusados)
  assert.equal(m.learning('economico', B), 1.2);
  // muitas aceitações em B: B equilibra
  for (let i = 0; i < 30; i++) m.record('accepted', { point: B, category: 'economico' });
  assert.equal(m.learning('economico', B), 1);
  // 9 dias depois (3 meias-vidas), os dados antigos pesam 1/8
  t += 9 * 24 * 3600 * 1000;
  for (let i = 0; i < 10; i++) m.record('accepted', { point: A, category: 'economico' });
  assert.equal(m.learning('economico', A), 1);
  // eventos inválidos são ignorados sem erro
  m.record('accepted', { point: A, category: 'luxo' });
  m.record('xpto', {});
  assert.equal(m.learning('luxo', A), 1);
});

test('procura suavizada: sobe e desce gradualmente', () => {
  let t = WED_NOON.getTime();
  const m = createMarket({ clock: () => new Date(t) });
  const P = { lat: -25.96, lng: 32.58 };
  assert.equal(m.demand('economico', P, 1, 3), 1);
  t += 10 * 1000;
  const a = m.demand('economico', P, 4, 1); // alvo 1,3
  assert.ok(a > 1 && a < 1.1, String(a));
  t += 10 * 60 * 1000;
  assert.equal(m.demand('economico', P, 4, 1), 1.3);
  t += 10 * 1000;
  const b = m.demand('economico', P, 1, 5); // alvo 1
  assert.ok(b > 1.2 && b < 1.3, String(b));
});

test('base de dados indisponível: continua em memória', async () => {
  const logs = [];
  const p = await createPgStore('postgres://x:y@127.0.0.1:1/nada', { log: (s) => logs.push(s) });
  assert.ok(logs.some((l) => l.includes('indisponível')));
  const m = createMarket({ store: p.store });
  m.record('quote', { point: { lat: -25.96, lng: 32.58 } });
  assert.ok(p.store.size() > 0);
  await p.close();
});

test('base de dados PostgreSQL: grava, recarrega após reinício e actualiza', async () => {
  const { newDb } = await import('pg-mem');
  const db = newDb();
  const pgModule = db.adapters.createPg();
  const P = { lat: -25.96, lng: 32.58 };

  // 1.º arranque: aprende com 10 recusas e grava
  const s1 = await createPgStore('postgres://mem/boleia', { pgModule, log: () => {}, flushMs: 60000 });
  const m1 = createMarket({ store: s1.store, clock: () => WED_NOON });
  for (let i = 0; i < 10; i++) m1.record('declined', { point: P, category: 'moto' });
  assert.equal(m1.learning('moto', P), 1.2);
  await s1.close();
  const rows = db.public.many('SELECT key, declined FROM pricing_stats ORDER BY key');
  assert.equal(rows.length, 2, 'zona + cidade');
  assert.ok(rows.every((r) => r.declined === 10));

  // 2.º arranque (ex.: novo deploy no Render): recupera o que aprendeu
  const s2 = await createPgStore('postgres://mem/boleia', { pgModule, log: () => {}, flushMs: 60000 });
  const m2 = createMarket({ store: s2.store, clock: () => WED_NOON });
  assert.equal(m2.learning('moto', P), 1.2, 'aprendizagem sobrevive ao reinício');
  for (let i = 0; i < 40; i++) m2.record('accepted', { point: P, category: 'moto' });
  await s2.flush();
  const after = db.public.one(`SELECT accepted FROM pricing_stats WHERE key = 'o|*|normal|moto'`);
  assert.equal(after.accepted, 40, 'actualização (ON CONFLICT) gravada');
  await s2.close();
});

test('store em memória: marca alterações', () => {
  const s = createMemoryStore();
  s.set('a', { quotes: 1 });
  assert.equal(s.takeDirty().length, 1);
  assert.equal(s.takeDirty().length, 0);
  s.mark('a');
  assert.equal(s.takeDirty()[0][1].quotes, 1);
});

test('cotações: preço garantido 5 min e só para os mesmos locais', async () => {
  let now = WED_NOON.getTime();
  let quotesSeen = 0;
  const qs = createQuoteService({
    route: async (o, d) => ({ distanceMeters: 5000, durationSeconds: 600, polyline: [o, d] }),
    clock: () => new Date(now),
    pickup: () => 0,
    onQuote: () => quotesSeen++,
  });
  const A = { lat: -25.9692, lng: 32.5732 };
  const B = { lat: -25.9622, lng: 32.4589 };
  const q = await qs.quote(A, B);
  assert.equal(quotesSeen, 1);
  assert.equal(typeof q.quoteId, 'string');
  assert.equal(q.prices.economico, 105);
  assert.equal(q.staticDurationSeconds, 600);
  assert.deepEqual(q.stops, []);
  assert.equal(q.surface, null);
  assert.equal(qs.lookup(q.quoteId, A, B), q.routes[0]);
  assert.equal(qs.lookup(q.quoteId, A, { lat: -25.9, lng: 32.4 }), null, 'destino diferente');
  assert.equal(qs.lookup('nao-existe', A, B), null);
  assert.equal(qs.lookup(undefined, A, B), null);
  now += 5 * 60 * 1000 + 1;
  assert.equal(qs.lookup(q.quoteId, A, B), null, 'expirou');
  await qs.quote(A, B);
  assert.equal(qs.size(), 1, 'cotações expiradas são apagadas');
});

test('cotações: uma falha nas funções de mercado não bloqueia o preço', async () => {
  const qs = createQuoteService({
    route: async (o, d) => ({ distanceMeters: 5000, durationSeconds: 600, polyline: [o, d] }),
    clock: () => WED_NOON,
    demand: () => {
      throw new Error('x');
    },
    learning: () => {
      throw new Error('y');
    },
    pickup: () => {
      throw new Error('z');
    },
    onQuote: () => {
      throw new Error('w');
    },
  });
  const q = await qs.quote({ lat: -25.96, lng: 32.58 }, { lat: -25.95, lng: 32.59 });
  assert.equal(q.prices.economico, 120);
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

test('rotas alternativas: cada uma com o seu preço e quoteId; repetidas não aparecem', async () => {
  const A = { lat: -25.97, lng: 32.57 };
  const B = { lat: -25.9, lng: 32.6 };
  const route = async (o, d) => ({
    distanceMeters: 9000,
    durationSeconds: 1500,
    polyline: [o, d],
    alternatives: [
      { distanceMeters: 7000, durationSeconds: 1300, polyline: [o, { lat: -25.95, lng: 32.6 }, d] },
      { distanceMeters: 9050, durationSeconds: 1520, polyline: [o, d] }, // quase igual à principal
    ],
  });
  const qs = createQuoteService({ route, clock: () => new Date(Date.UTC(2026, 10, 4, 10)) });
  const q = await qs.quote(A, B);
  assert.equal(q.routes.length, 2);
  assert.equal(q.quoteId, q.routes[0].quoteId, 'a principal vem primeiro');
  assert.notEqual(q.routes[0].quoteId, q.routes[1].quoteId);
  assert.ok(q.routes[1].prices.economico < q.routes[0].prices.economico, 'a mais curta é mais barata');
  const alt = qs.lookup(q.routes[1].quoteId, A, B);
  assert.equal(alt.distanceMeters, 7000, 'pedir com o quoteId da alternativa garante essa rota e esse preço');
  assert.equal(alt.routes, undefined);
});
