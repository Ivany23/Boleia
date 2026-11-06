/** Erro com mensagem em portugues segura para o cliente. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Descodifica uma polyline codificada do Google para [{lat,lng}]. */
export function decodePolyline(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i <= str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

const TTL = 5 * 60 * 1000;
const r4 = (n) => Number(n).toFixed(4);

export function createGoogle({ fetchImpl = fetch, now = Date.now, timeoutMs = 10000 } = {}) {
  const cache = new Map();

  async function call(url, init, key, what, ms = timeoutMs) {
    if (!key) throw new HttpError(503, `Serviço ${what} não configurado no servidor.`);
    let res;
    try {
      res = await fetchImpl(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers, 'X-Goog-Api-Key': key },
        signal: AbortSignal.timeout(ms),
      });
    } catch {
      throw new HttpError(504, `Sem resposta do serviço ${what}. Tente novamente.`);
    }
    if (!res.ok) {
      console.log(`[google] ${what} falhou: HTTP ${res.status}`);
      throw new HttpError(502, `O serviço ${what} está indisponível de momento.`);
    }
    try {
      return await res.json();
    } catch {
      throw new HttpError(502, `Resposta inválida do serviço ${what}.`);
    }
  }

  async function autocomplete({ input, lat, lng, session }) {
    if (typeof input !== 'string' || input.trim().length < 2) return { suggestions: [] };
    const body = { input: input.trim(), includedRegionCodes: ['mz'], languageCode: 'pt' };
    if (session) body.sessionToken = String(session);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } };
    }
    const data = await call(
      'https://places.googleapis.com/v1/places:autocomplete',
      { method: 'POST', body: JSON.stringify(body) },
      process.env.GOOGLE_PLACES_API_KEY,
      'de pesquisa de locais',
    );
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p) => p?.placeId)
      .map((p) => ({
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondary: p.structuredFormat?.secondaryText?.text ?? '',
      }));
    return { suggestions };
  }

  async function details({ placeId, session }) {
    if (!placeId || typeof placeId !== 'string') throw new HttpError(400, 'placeId em falta.');
    let url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt`;
    if (session) url += `&sessionToken=${encodeURIComponent(session)}`;
    const d = await call(
      url,
      { method: 'GET', headers: { 'X-Goog-FieldMask': 'location,formattedAddress,displayName' } },
      process.env.GOOGLE_PLACES_API_KEY,
      'de pesquisa de locais',
    );
    if (!d.location) throw new HttpError(404, 'Local não encontrado.');
    return {
      lat: d.location.latitude,
      lng: d.location.longitude,
      address: d.formattedAddress ?? d.displayName?.text ?? '',
    };
  }

  // Trânsito em tempo real (SKU "Pro" da Routes API). Se a Google recusar, recua para
  // o modo sem trânsito durante 30 min, para a app nunca ficar sem preço.
  let trafficOffUntil = 0;
  const trafficWanted = () => process.env.ROUTES_TRAFFIC !== '0' && now() >= trafficOffUntil;

  async function computeRoute(origin, destination, traffic, stops = []) {
    const ll = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const body = { origin: ll(origin), destination: ll(destination), travelMode: 'DRIVE' };
    // paragens intermédias, pela ordem escolhida pelo passageiro
    if (stops.length) body.intermediates = stops.map(ll);
    body.routingPreference = traffic ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE';
    return call(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify(body),
      },
      process.env.GOOGLE_ROUTES_API_KEY,
      'de rotas',
      // com trânsito espera menos, para a rota de reserva ainda caber no tempo da app (15 s)
      traffic ? Math.min(timeoutMs, 6000) : timeoutMs,
    );
  }

  /**
   * Rota de carro (com paragens opcionais pelo caminho):
   * { distanceMeters, durationSeconds (com trânsito), staticDurationSeconds, polyline }.
   */
  async function route(origin, destination, stops = []) {
    const via = (Array.isArray(stops) ? stops : []).map((p) => `${r4(p.lat)},${r4(p.lng)}`).join('>');
    const key = `${r4(origin.lat)},${r4(origin.lng)}>${via ? via + '>' : ''}${r4(destination.lat)},${r4(destination.lng)}`;
    stops = Array.isArray(stops) ? stops : [];
    const hit = cache.get(key);
    if (hit && now() - hit.at < TTL) return hit.value;

    let data;
    let trafficAware = false;
    if (trafficWanted()) {
      try {
        data = await computeRoute(origin, destination, true, stops);
        trafficAware = true;
      } catch (e) {
        if (e?.status === 503) throw e; // chave em falta: não adianta tentar de novo
        // Recusa da Google (ex.: SKU não autorizado): desliga o trânsito por 30 min.
        // Timeout: só recua desta vez.
        if (e?.status === 502) {
          console.log('[google] rota com trânsito recusada; a usar rota sem trânsito durante 30 min');
          trafficOffUntil = now() + 30 * 60 * 1000;
        }
      }
    }
    if (!data) data = await computeRoute(origin, destination, false, stops);

    const r = data.routes?.[0];
    if (!r) throw new HttpError(404, 'Não foi possível calcular a rota entre os dois locais.');
    const secs = (s) => parseInt(s ?? '0', 10) || 0;
    const distanceMeters = r.distanceMeters ?? 0;
    const durationSeconds = secs(r.duration);
    const staticDurationSeconds = secs(r.staticDuration) || durationSeconds;
    const encoded = r.polyline?.encodedPolyline;
    const polyline = encoded ? decodePolyline(encoded) : [origin, ...stops, destination];
    // trafficAware: false = a duração NÃO inclui o trânsito (o preço estima-o na hora de ponta)
    const value = { distanceMeters, durationSeconds, staticDurationSeconds, polyline, trafficAware };
    cache.set(key, { at: now(), value });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return value;
  }

  // ---------------------------------------------------------------------
  // Morada de um ponto (para "escolher no mapa").
  // 1) Google Places "nearby" (o lugar conhecido mais próximo, até 120 m)
  // 2) OpenStreetMap Nominatim (rua/bairro), no máximo 1 pedido por segundo
  // 3) Sem resposta: "Ponto no mapa"
  // ---------------------------------------------------------------------
  const revCache = new Map();
  let nominatimNext = 0;

  async function nominatim(p) {
    const wait = nominatimNext - now();
    nominatimNext = Math.max(now(), nominatimNext) + 1100;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=pt&lat=${p.lat}&lon=${p.lng}`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Boleia/1.0 (servidor da app Boleia, Maputo)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j?.address ?? {};
    const street = [a.road ?? a.pedestrian ?? a.neighbourhood, a.house_number].filter(Boolean).join(' ');
    const parts = [street, a.suburb ?? a.neighbourhood ?? a.city_district, a.city ?? a.town].filter(
      (x, i, arr) => !!x && arr.indexOf(x) === i,
    );
    // Sem rua/bairro/cidade (ex.: no mar só vem "Moçambique"): não serve como morada
    return parts.length ? parts.join(', ') : null;
  }

  async function reverse(p) {
    const key = `${r4(p.lat)},${r4(p.lng)}`;
    const hit = revCache.get(key);
    if (hit && now() - hit.at < 24 * 3600 * 1000) return hit.value;
    let address = null;
    if (process.env.GOOGLE_PLACES_API_KEY) {
      try {
        const d = await call(
          'https://places.googleapis.com/v1/places:searchNearby',
          {
            method: 'POST',
            headers: { 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress' },
            body: JSON.stringify({
              maxResultCount: 1,
              rankPreference: 'DISTANCE',
              languageCode: 'pt',
              locationRestriction: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 120 } },
            }),
          },
          process.env.GOOGLE_PLACES_API_KEY,
          'de pesquisa de locais',
        );
        const pl = d.places?.[0];
        if (pl) {
          const name = pl.displayName?.text;
          const addr = pl.formattedAddress ?? '';
          address = name && !addr.startsWith(name) ? `${name}, ${addr}` : addr || name || null;
        }
      } catch {
        // tenta o OpenStreetMap
      }
    }
    if (!address) {
      try {
        address = await nominatim(p);
      } catch {
        // sem morada
      }
    }
    const value = { lat: p.lat, lng: p.lng, address: address || 'Ponto no mapa' };
    revCache.set(key, { at: now(), value });
    if (revCache.size > 5000) revCache.delete(revCache.keys().next().value);
    return value;
  }

  return { autocomplete, details, route, reverse };
}
