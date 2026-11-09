import Constants from 'expo-constants';
import type { LatLng, Place, PricingInfo, Quote, Suggestion } from './types';

function resolveServerUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;
  if (fromEnv) return fromEnv;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export const SERVER_URL = resolveServerUrl().replace(/\/$/, '');

export class ApiError extends Error { }

async function request<T>(path: string, init?: RequestInit, timeoutMs = 10000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(SERVER_URL + path, {
      ...init,
      signal: ctrl.signal,

      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      throw new ApiError(
        typeof body?.error === 'string' ? body.error : `O servidor respondeu com erro (${res.status}).`,
      );
    }
    return body as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    if (e?.name === 'AbortError') {
      throw new ApiError('O servidor demorou demasiado a responder. Tente novamente.');
    }
    throw new ApiError('Não foi possível ligar ao servidor. Verifique o Wi-Fi e tente novamente.');
  } finally {
    clearTimeout(timer);
  }
}

export async function autocomplete(input: string, session: string, near?: LatLng): Promise<Suggestion[]> {
  const q = new URLSearchParams({ input, session });
  if (near) {
    q.set('lat', String(near.lat));
    q.set('lng', String(near.lng));
  }
  const r = await request<{ suggestions?: Suggestion[] }>(`/api/places/autocomplete?${q.toString()}`);
  return Array.isArray(r?.suggestions) ? r.suggestions.filter((s) => s && s.placeId) : [];
}

export async function placeDetails(placeId: string, session: string): Promise<Place> {
  const q = new URLSearchParams({ placeId, session });
  const p = await request<Place>(`/api/places/details?${q.toString()}`);
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
    throw new ApiError('Não foi possível obter este local.');
  }
  return { ...p, address: p.address || 'Local seleccionado' };
}

export async function getQuote(origin: LatLng, destination: LatLng, stops: LatLng[] = []): Promise<Quote> {
  const pt = (p: LatLng) => ({ lat: p.lat, lng: p.lng });
  const body: Record<string, unknown> = { origin: pt(origin), destination: pt(destination) };
  if (stops.length) body.stops = stops.map(pt);
  const q = await request<Quote>('/api/quote', { method: 'POST', body: JSON.stringify(body) }, 15000);
  if (!q || !q.prices) throw new ApiError('Resposta inválida do servidor.');
  const fix = (r: Quote): Quote => ({ ...r, polyline: Array.isArray(r.polyline) ? r.polyline : [] });
  const routes = (Array.isArray(q.routes) ? q.routes : []).filter((r) => r && r.prices).map(fix);
  return { ...fix(q), routes: routes.length ? routes : [fix(q)] };
}

export async function reverseGeocode(p: LatLng): Promise<Place> {
  const q = new URLSearchParams({ lat: String(p.lat), lng: String(p.lng) });
  const r = await request<Place>(`/api/geocode/reverse?${q.toString()}`, undefined, 12000);
  return { lat: p.lat, lng: p.lng, address: (r && typeof r.address === 'string' && r.address) || 'Ponto no mapa' };
}

export async function getPricing(): Promise<PricingInfo | null> {
  try {
    const p = await request<PricingInfo>('/api/pricing', undefined, 8000);
    return p && p.fuel && p.period ? p : null;
  } catch {
    return null;
  }
}
