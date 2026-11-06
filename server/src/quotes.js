import { randomUUID } from 'node:crypto';
import { haversine } from './geo.js';
import { priceRoute } from './pricing.js';

export const QUOTE_TTL_MS = 5 * 60 * 1000;
const SAME_PLACE_M = 150;

/**
 * Cotações com preço garantido: o passageiro paga exactamente o que viu,
 * desde que peça a viagem dentro de 5 minutos e com os mesmos locais.
 *
 * route(origin, destination) -> { distanceMeters, durationSeconds, staticDurationSeconds?, polyline }
 * demand(category, point)    -> multiplicador de procura na zona (>= 1)
 * learning(category, point)  -> factor aprendido (0,9 a 1,2)
 * pickup(category, point)    -> metros do motorista livre mais próximo (ou null)
 * onQuote(point)             -> regista a cotação (estatísticas)
 */
export function createQuoteService({
  route,
  demand = () => 1,
  learning = () => 1,
  pickup = () => null,
  onQuote = () => {},
  clock = () => new Date(),
  ttlMs = QUOTE_TTL_MS,
}) {
  const store = new Map(); // quoteId -> { origin, destination, value, expiresAt }

  function sweep(nowMs) {
    for (const [id, q] of store) if (q.expiresAt < nowMs) store.delete(id);
  }

  async function quote(origin, destination) {
    const r = await route(origin, destination);
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
    });
    const value = {
      quoteId: randomUUID(),
      expiresAt: nowMs + ttlMs,
      validForSeconds: Math.round(ttlMs / 1000),
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
      staticDurationSeconds: r.staticDurationSeconds ?? r.durationSeconds,
      polyline: Array.isArray(r.polyline) ? r.polyline : [origin, destination],
      ...priced,
    };
    sweep(nowMs);
    store.set(value.quoteId, {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
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

  /** Cotação guardada, se ainda válida e para os mesmos locais; senão null. */
  function lookup(quoteId, origin, destination) {
    if (typeof quoteId !== 'string') return null;
    const q = store.get(quoteId);
    if (!q || q.expiresAt < clock().getTime()) return null;
    if (haversine(q.origin, origin) > SAME_PLACE_M) return null;
    if (haversine(q.destination, destination) > SAME_PLACE_M) return null;
    return q.value;
  }

  return { quote, lookup, size: () => store.size };
}
