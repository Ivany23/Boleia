/**
 * Chuva em Maputo (Open-Meteo: gratuito, sem chave). Com chuva há menos carros
 * na rua, o trânsito anda mais devagar e há mais pedidos: o preço sobe um pouco.
 *
 *  - chuva fraca (chuvisco, aguaceiros fracos):        × 1,10
 *  - chuva forte (chuva/aguaceiros fortes, trovoada):  × 1,20
 *
 * Nunca atrasa uma cotação: current() devolve logo o último valor conhecido e,
 * se estiver velho (> 10 min), actualiza em segundo plano. Sem dados = sem ajuste.
 * Desligar: WEATHER_CHECK=0.
 */

export const RAIN_MULTIPLIER = { none: 1, fraca: 1.1, forte: 1.2 };

const LIGHT_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 66, 80, 81]);
const HEAVY_CODES = new Set([65, 67, 82, 95, 96, 99]);

/** Nível de chuva a partir do código WMO e da precipitação dos últimos 15 min (mm). */
export function rainLevel({ weather_code: code, precipitation } = {}) {
  const mm = Number(precipitation) || 0;
  if (HEAVY_CODES.has(code) || mm >= 0.6) return 'forte'; // ~2,5 mm/h ou mais
  if (LIGHT_CODES.has(code) || mm >= 0.1) return 'fraca';
  return 'none';
}

export function createWeather({
  fetchImpl = fetch,
  now = Date.now,
  lat = -25.9692,
  lng = 32.5732,
  ttlMs = 10 * 60 * 1000,
  maxAgeMs = 60 * 60 * 1000,
  enabled = process.env.WEATHER_CHECK !== '0',
  log = console.log,
} = {}) {
  let state = null; // { rain, multiplier, at }
  let inflight = null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&current=precipitation,weather_code&timezone=Africa%2FMaputo';

  async function refresh() {
    if (!enabled) return null;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!j?.current) throw new Error('resposta sem "current"');
        const rain = rainLevel(j.current);
        state = { rain, multiplier: RAIN_MULTIPLIER[rain], at: now() };
      } catch (e) {
        log(`[tempo] sem dados meteorológicos: ${e?.message ?? e}`);
      } finally {
        inflight = null;
      }
      return state;
    })();
    return inflight;
  }

  /** Último estado conhecido (ou null). Actualiza em segundo plano se for velho. */
  function current() {
    if (!enabled) return null;
    if (!state || now() - state.at > ttlMs) refresh().catch(() => {});
    if (!state || now() - state.at > maxAgeMs) return null; // dados demasiado antigos: não ajusta
    return state;
  }

  return { current, refresh };
}
