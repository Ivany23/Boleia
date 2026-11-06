import { randomUUID } from 'node:crypto';
import { haversine } from './geo.js';
import { priceRoute } from './pricing.js';

export const QUOTE_TTL_MS = 5 * 60 * 1000;
const SAME_PLACE_M = 150;

const pt = (p) => ({ lat: p.lat, lng: p.lng });

/**
 * Cotações com preço garantido: o passageiro paga exactamente o que viu,
 * desde que peça a viagem dentro de 5 minutos e com os mesmos locais (e paragens).
 *
 * route(origin, destination, stops) -> { distanceMeters, durationSeconds, staticDurationSeconds?, polyline }
 * surface.analyse(polyline, m)      -> { sandMeters, pickupSand, dropoffSand, sandRatio } | null
 * weather.current()                 -> { rain: 'none'|'fraca'|'forte', multiplier } | null
 * demand(category, point)           -> multiplicador de procura na zona (>= 1)
 * learning(category, point)         -> factor aprendido (0,9 a 1,2)
 * pickup(category, point)           -> metros do motorista livre mais próximo (ou null)
 * onQuote(point)                    -> regista a cotação (estatísticas)
 */
export function createQuoteService({
  route,
  surface = null,
  weather = null,
  demand = () => 1,
  learning = () => 1,
  pickup = () => null,
  onQuote = () => {},
  clock = () => new Date(),
  ttlMs = QUOTE_TTL_MS,
}) {
  const store = new Map(); // quoteId -> { origin, destination, stops, value, expiresAt }

  function sweep(nowMs) {
    for (const [id, q] of store) if (q.expiresAt < nowMs) store.delete(id);
  }

  async function quote(origin, destination, stops = []) {
    const via = (Array.isArray(stops) ? stops : []).map(pt);
    const r = await route(origin, destination, via);
    const polyline = Array.isArray(r.polyline) ? r.polyline : [origin, ...via, destination];

    // Piso do percurso (areia): nunca impede a cotação
    let sand = null;
    if (surface) {
      try {
        sand = await surface.analyse(polyline, r.distanceMeters);
      } catch {
        sand = null;
      }
    }

    let wx = null;
    try {
      wx = weather?.current?.() ?? null;
    } catch {
      wx = null;
    }

    const date = clock();
    const nowMs = date.getTime();
    const safe = (fn, def) => (c) => {
      try {
        return fn(c, origin);
      } catch {
        return def;
      }
    };
    const priced = priceRoute(r, {
      date,
      demand: safe(demand, 1),
      learning: safe(learning, 1),
      pickup: safe(pickup, null),
      stops: via.length,
      sandMeters: sand?.sandMeters ?? 0,
      rain: wx?.multiplier ?? 1,
    });
    const value = {
      quoteId: randomUUID(),
      expiresAt: nowMs + ttlMs,
      validForSeconds: Math.round(ttlMs / 1000),
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
      staticDurationSeconds: r.staticDurationSeconds ?? r.durationSeconds,
      polyline,
      stops: via,
      surface: sand
        ? {
            sandMeters: sand.sandMeters,
            sandRatio: sand.sandRatio,
            pickupSand: !!sand.pickupSand,
            dropoffSand: !!sand.dropoffSand,
          }
        : null,
      ...priced,
      rain: wx && wx.rain !== 'none' ? { level: wx.rain, multiplier: wx.multiplier } : null,
    };
    sweep(nowMs);
    store.set(value.quoteId, {
      origin: pt(origin),
      destination: pt(destination),
      stops: via,
      value,
      expiresAt: value.expiresAt,
    });
    try {
      onQuote(origin);
    } catch {
      // as estatísticas nunca impedem a cotação
    }
    return value;
  }

  /** Cotação guardada, se ainda válida e para os mesmos locais e paragens; senão null. */
  function lookup(quoteId, origin, destination, stops = []) {
    if (typeof quoteId !== 'string') return null;
    const q = store.get(quoteId);
    if (!q || q.expiresAt < clock().getTime()) return null;
    if (haversine(q.origin, origin) > SAME_PLACE_M) return null;
    if (haversine(q.destination, destination) > SAME_PLACE_M) return null;
    const via = Array.isArray(stops) ? stops : [];
    if (via.length !== q.stops.length) return null;
    if (via.some((s, i) => haversine(q.stops[i], s) > SAME_PLACE_M)) return null;
    return q.value;
  }

  return { quote, lookup, size: () => store.size };
}
