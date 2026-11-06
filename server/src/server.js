import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createGoogle, HttpError } from './google.js';
import { createMarket } from './market.js';
import { MAX_STOPS, pricingInfo } from './pricing.js';
import { createQuoteService } from './quotes.js';
import { createRideService, validLatLng, validStops } from './rides.js';
import { createSurface } from './surface.js';
import { createWeather } from './weather.js';

const num = (v) => (v === undefined || v === '' ? NaN : Number(v));

export function createServer({
  google,
  route,
  surface,
  weather,
  market,
  repo,
  clock = () => new Date(),
  offerTimeoutMs = 15000,
  nearbyIntervalMs = 5000,
} = {}) {
  const g = google ?? createGoogle();
  const mk = market ?? createMarket({ clock });
  // Estradas de areia (dados do OpenStreetMap no servidor): com as rotas reais do Google.
  // Com uma rota de teste injectada fica desligado, a não ser que o teste passe o seu `surface`.
  const sf = surface !== undefined ? surface : route ? null : createSurface();
  if (sf?.segments) setImmediate(() => sf.segments()); // carrega o índice já, não na 1.ª cotação
  // Chuva (Open-Meteo): igual, só com as rotas reais
  const wx = weather !== undefined ? weather : route ? null : createWeather();
  wx?.refresh?.().catch(() => {});
  const weatherTimer = wx?.refresh ? setInterval(() => wx.refresh().catch(() => {}), 10 * 60 * 1000) : null;
  weatherTimer?.unref?.();
  const quotes = createQuoteService({
    route: route ?? g.route,
    surface: sf,
    weather: wx,
    clock,
    demand: (category, point) => rides.demand(category, point),
    learning: (category, point) => rides.learning(category, point),
    pickup: (category, point) => rides.nearestFree(category, point),
    onQuote: (point) => mk.record('quote', { point, date: clock() }),
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const h = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.log(`[boleia] erro REST ${req.path}: ${e?.message ?? e}`);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  };

  // Página inicial do servidor (quem abre o endereço no browser vê que está a funcionar)
  app.get('/', (req, res) => {
    const storage = rides.repo.kind === 'postgres' ? 'base de dados ligada' : 'a funcionar em memória';
    res.type('html').send(`<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Boleia · servidor</title>
<style>body{font-family:system-ui,sans-serif;background:#F4F7F5;color:#0E1B14;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;border-radius:18px;padding:28px 32px;box-shadow:0 4px 18px rgba(6,33,15,.1);max-width:420px}
h1{margin:0 0 6px;color:#0A7A4B}p{margin:6px 0;color:#5F6F66}b{color:#0E1B14}a{color:#0A7A4B}</style></head>
<body><main><h1>Boleia · servidor ✅</h1>
<p>O servidor está a funcionar (${storage}).</p>
<p>Motoristas online: <b>${rides.driverCount()}</b></p>
<p>Este endereço é só para a app. A app está em <a href="https://boleia-nine.vercel.app">boleia-nine.vercel.app</a>.</p>
<p>Estado técnico: <a href="/api/health">/api/health</a></p></main></body></html>`);
  });
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  app.get('/api/health', (req, res) =>
    res.json({ ok: true, drivers: rides.driverCount(), storage: rides.repo.kind }),
  );

  // Configuração pública da app web: chave do Google Maps para o SITE.
  // PROTÓTIPO: se não houver chave própria do site (GOOGLE_MAPS_WEB_KEY), entrega a chave
  // do servidor, que fica VISÍVEL no browser. Vulnerabilidade conhecida, explicada em
  // SEGURANCA.md. Para desligar: MAPS_DEMO_USE_SERVER_KEY=0 no Render.
  const demoKey = process.env.MAPS_DEMO_USE_SERVER_KEY !== '0' ? process.env.GOOGLE_ROUTES_API_KEY : null;
  const webKey = process.env.GOOGLE_MAPS_WEB_KEY || demoKey || null;
  if (!process.env.GOOGLE_MAPS_WEB_KEY && demoKey) {
    console.log('[boleia] AVISO: o site usa a chave do servidor (modo protótipo). Ver SEGURANCA.md.');
  }
  app.get('/api/config', (req, res) => res.json({ googleMapsWebKey: webKey }));

  app.get('/api/pricing', (req, res) =>
    res.json({ ...pricingInfo(clock()), learning: mk.snapshot(clock()) }),
  );

  // Nome/morada de um ponto marcado no mapa
  app.get(
    '/api/geocode/reverse',
    h((req) => {
      const p = { lat: num(req.query.lat), lng: num(req.query.lng) };
      if (!validLatLng(p)) throw new HttpError(400, 'Coordenadas inválidas.');
      return g.reverse(p);
    }),
  );

  app.get(
    '/api/places/autocomplete',
    h((req) =>
      g.autocomplete({
        input: String(req.query.input ?? ''),
        lat: num(req.query.lat),
        lng: num(req.query.lng),
        session: req.query.session ? String(req.query.session) : undefined,
      }),
    ),
  );

  app.get(
    '/api/places/details',
    h((req) =>
      g.details({
        placeId: req.query.placeId ? String(req.query.placeId) : '',
        session: req.query.session ? String(req.query.session) : undefined,
      }),
    ),
  );

  app.post(
    '/api/quote',
    h((req) => {
      const { origin, destination, stops } = req.body ?? {};
      if (!validLatLng(origin) || !validLatLng(destination)) {
        throw new HttpError(400, 'Origem e destino inválidos.');
      }
      if (stops != null && !validStops(stops)) {
        throw new HttpError(400, `Paragens inválidas (no máximo ${MAX_STOPS}).`);
      }
      return quotes.quote(origin, destination, stops ?? []);
    }),
  );

  app.use((req, res) => res.status(404).json({ error: 'Pedido não encontrado.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    res
      .status(status)
      .json({ error: status === 400 ? 'Pedido inválido.' : 'Erro interno do servidor.' });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  const rides = createRideService({ io, quotes, market: mk, repo, offerTimeoutMs, clock });
  io.on('connection', (socket) => rides.attach(socket));
  const nearbyTimer = setInterval(() => rides.broadcastNearby(), nearbyIntervalMs);
  const sweepTimer = setInterval(() => rides.sweep(), 60 * 1000);
  sweepTimer.unref?.();

  return {
    app,
    httpServer,
    io,
    rides,
    quotes,
    listen(port, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => resolve(httpServer.address().port));
      });
    },
    async close() {
      clearInterval(nearbyTimer);
      clearInterval(sweepTimer);
      if (weatherTimer) clearInterval(weatherTimer);
      rides.shutdown();
      await io.close();
      if (httpServer.listening) await new Promise((r) => httpServer.close(r));
    },
  };
}
