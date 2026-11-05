import { createServer } from './server.js';

process.on('unhandledRejection', (e) => console.log(`[boleia] unhandledRejection: ${e?.message ?? e}`));
process.on('uncaughtException', (e) => console.log(`[boleia] uncaughtException: ${e?.message ?? e}`));

const port = Number(process.env.PORT) || 3000;
const server = createServer();
await server.listen(port, '0.0.0.0');
console.log(`[boleia] servidor a escutar em 0.0.0.0:${port}`);
