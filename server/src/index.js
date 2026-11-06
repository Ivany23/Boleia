import { connectDb } from './db.js';
import { createMarket, createPgStore } from './market.js';
import { createMemoryRepo, createPgRepo } from './repo.js';
import { createServer } from './server.js';

process.on('unhandledRejection', (e) => console.log(`[boleia] unhandledRejection: ${e?.message ?? e}`));
process.on('uncaughtException', (e) => console.log(`[boleia] uncaughtException: ${e?.message ?? e}`));

const port = Number(process.env.PORT) || 3000;

// Base de dados (Neon/PostgreSQL) em DATABASE_URL. Sem ela, tudo funciona em memória.
const db = process.env.DATABASE_URL ? await connectDb(process.env.DATABASE_URL) : null;
const persistence = db ? await createPgStore(null, { pool: db.pool }) : null;
const market = createMarket(persistence ? { store: persistence.store } : {});
const repo = db ? createPgRepo(db.pool) : createMemoryRepo();

const server = createServer({ market, repo });
await server.listen(port, '0.0.0.0');
console.log(`[boleia] servidor a escutar em 0.0.0.0:${port} (dados: ${repo.kind})`);

// Ao desligar (ex.: novo deploy no Render), grava as estatísticas antes de sair
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, async () => {
    try {
      await persistence?.close();
      await server.close();
      await db?.close();
    } finally {
      process.exit(0);
    }
  });
}
