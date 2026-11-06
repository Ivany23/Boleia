import { createMarket, createPgStore } from './market.js';
import { createServer } from './server.js';

process.on('unhandledRejection', (e) => console.log(`[boleia] unhandledRejection: ${e?.message ?? e}`));
process.on('uncaughtException', (e) => console.log(`[boleia] uncaughtException: ${e?.message ?? e}`));

const port = Number(process.env.PORT) || 3000;

// Aprendizagem de preços: guardada no PostgreSQL se houver DATABASE_URL (Render), senão em memória
let persistence = null;
if (process.env.DATABASE_URL) persistence = await createPgStore(process.env.DATABASE_URL);
const market = createMarket(persistence ? { store: persistence.store } : {});

const server = createServer({ market });
await server.listen(port, '0.0.0.0');
console.log(`[boleia] servidor a escutar em 0.0.0.0:${port}`);

// Ao desligar (ex.: novo deploy no Render), grava as estatísticas antes de sair
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, async () => {
    try {
      await persistence?.close();
      await server.close();
    } finally {
      process.exit(0);
    }
  });
}
