import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { connectDb, migrate, toNodeUrl } from '../src/db.js';
import { createPgRepo, normalizePhone } from '../src/repo.js';

const quietDb = async () => {
  const mem = newDb();
  const db = await connectDb('postgres://mem/boleia', { pgModule: mem.adapters.createPg(), log: () => {} });
  return { mem, db };
};

test('WhatsApp de Moçambique: normalização', () => {
  assert.equal(normalizePhone('84 123 4567'), '+258841234567');
  assert.equal(normalizePhone('+258 84 123 4567'), '+258841234567');
  assert.equal(normalizePhone('258841234567'), '+258841234567');
  assert.equal(normalizePhone('00258 87-765-4321'), '+258877654321');
  assert.equal(normalizePhone(821234567), '+258821234567');
  for (const bad of ['', '84123456', '8412345678', '81 123 4567', '88 123 4567', '+351912345678', null, undefined, {}]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
});

test('endereço JDBC (Neon) convertido para o formato do Node', () => {
  const u = toNodeUrl(
    'jdbc:postgresql://ep-x-pooler.c-8.us-east-2.aws.neon.tech/neondb?user=neondb_owner&password=p@ss&sslmode=require&channelBinding=require',
  );
  const p = new URL(u);
  assert.equal(p.protocol, 'postgres:');
  assert.equal(p.hostname, 'ep-x-pooler.c-8.us-east-2.aws.neon.tech');
  assert.equal(p.pathname, '/neondb');
  assert.equal(decodeURIComponent(p.username), 'neondb_owner');
  assert.equal(decodeURIComponent(p.password), 'p@ss');
  assert.equal(p.searchParams.get('sslmode'), 'verify-full', 'verificação completa do certificado');
  assert.equal(p.searchParams.get('user'), null);
  assert.equal(p.searchParams.get('channelBinding'), null);
  assert.equal(toNodeUrl('postgres://a:b@h/d'), 'postgres://a:b@h/d', 'formato do Node fica igual');
  assert.equal(new URL(toNodeUrl('postgresql://a:b@h/d?sslmode=require')).searchParams.get('sslmode'), 'verify-full');
});

test('migração: cria as 4 tabelas uma vez e é segura a repetir', async () => {
  const { mem, db } = await quietDb();
  assert.ok(db, 'ligou');
  const tables = mem.public
    .many(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
    .map((r) => r.table_name)
    .sort();
  assert.deepEqual(tables, ['drivers', 'passengers', 'pricing_stats', 'rides']);
  // colunas do cliente: só nome e WhatsApp (+ datas)
  const cols = mem.public
    .many(`SELECT column_name FROM information_schema.columns WHERE table_name = 'passengers'`)
    .map((r) => r.column_name)
    .sort();
  assert.deepEqual(cols, ['created_at', 'name', 'phone', 'updated_at']);
  assert.deepEqual(await migrate(db.pool), [], 'segunda vez não cria nada');
  await db.close();
});

test('repositório PostgreSQL: passageiro, motorista, avaliação e viagem', async () => {
  const { mem, db } = await quietDb();
  const repo = createPgRepo(db.pool, { log: () => {} });

  await repo.savePassenger({ phone: '+258841234567', name: '  Ana   Machava ' });
  await repo.savePassenger({ phone: '+258841234567', name: 'Ana M.' });
  const pax = mem.public.many('SELECT phone, name FROM passengers');
  assert.deepEqual(pax, [{ phone: '+258841234567', name: 'Ana M.' }]);

  const d1 = await repo.saveDriver({ phone: '+258861000001', name: 'Zé', car: 'Vitz', plate: 'AAA 123 MC', category: 'economico' });
  assert.deepEqual(d1, { rating: 4.8, ratingCount: 5 });
  const r = await repo.rateDriver('+258861000001', 2);
  assert.equal(r.ratingCount, 6);
  assert.ok(Math.abs(r.rating - (4.8 * 5 + 2) / 6) < 1e-9);
  const d2 = await repo.saveDriver({ phone: '+258861000001', name: 'Zé', car: 'Vitz', plate: 'AAA 123 MC', category: 'conforto' });
  assert.equal(d2.ratingCount, 6, 'avaliação mantém-se ao voltar');
  assert.equal(await repo.rateDriver('+258869999999', 5), null, 'motorista desconhecido: sem erro');

  const ride = {
    id: 'r1',
    driverPhone: '+258861000001',
    category: 'economico',
    payment: 'mpesa',
    status: 'completed',
    price: 195,
    driverEarnings: 163,
    platformFee: 32,
    distanceMeters: 5000,
    durationSeconds: 720,
    period: 'normal',
    zone: '-1298:1629',
    createdAt: Date.now() - 900000,
    endedAt: Date.now(),
  };
  await repo.saveRide(ride);
  await repo.saveRide({ ...ride, status: 'completed' }); // repetir não duplica
  await repo.setRideRating('r1', 5);
  const rows = mem.public.many('SELECT id, price, driver_earnings, platform_fee, rating FROM rides');
  assert.deepEqual(rows, [{ id: 'r1', price: 195, driver_earnings: 163, platform_fee: 32, rating: 5 }]);
  await db.close();
});

test('base de dados em baixo: erros não rebentam o servidor', async () => {
  const logs = [];
  const broken = { query: async () => { throw new Error('ligação perdida'); } };
  const repo = createPgRepo(broken, { log: (s) => logs.push(s) });
  assert.equal(await repo.savePassenger({ phone: '+258841234567', name: 'Ana' }), null);
  assert.equal(await repo.saveDriver({ phone: '+258841234567', name: 'Zé', category: 'moto' }), null);
  assert.equal(await repo.saveRide({ id: 'x', category: 'moto', payment: 'dinheiro', status: 'cancelled', createdAt: Date.now() }), null);
  assert.equal(logs.length, 3);
  const none = await connectDb('postgres://x:y@127.0.0.1:1/nada', { log: () => {} });
  assert.equal(none, null, 'sem base de dados: devolve null e o servidor usa memória');
});
