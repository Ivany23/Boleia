import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createGoogle, HttpError } from './google.js';
import { createMarket } from './market.js';
import { pricingInfo } from './pricing.js';
import { createQuoteService } from './quotes.js';
import { createRideService, validLatLng } from './rides.js';

const num = (v) => (v === undefined || v === '' ? NaN : Number(v));

export function createServer({
  google,
  route,
  market,
  repo,
  clock = () => new Date(),
  offerTimeoutMs = 15000,
  nearbyIntervalMs = 5000,
} = {}) {
  const g = google ?? createGoogle();
  const mk = market ?? createMarket({ clock });
  const quotes = createQuoteService({
    route: route ?? g.route,
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

  app.get('/api/health', (req, res) =>
    res.json({ ok: true, drivers: rides.driverCount(), storage: rides.repo.kind }),
  );

  // Configuração pública da app web (a chave do Google Maps do SITE: limitada ao domínio)
  app.get('/api/config', (req, res) =>
    res.json({ googleMapsWebKey: process.env.GOOGLE_MAPS_WEB_KEY || null }),
  );

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
      const { origin, destination } = req.body ?? {};
      if (!validLatLng(origin) || !validLatLng(destination)) {
        throw new HttpError(400, 'Origem e destino inválidos.');
      }
      return quotes.quote(origin, destination);
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
      rides.shutdown();
      await io.close();
      if (httpServer.listening) await new Promise((r) => httpServer.close(r));
    },
  };
}
