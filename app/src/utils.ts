import type { Category, LatLng, Payment, PricePeriod, Traffic } from './types';

export const MAPUTO: LatLng = { lat: -25.9692, lng: 32.5732 };

export const CATEGORIES: { id: Category; label: string; icon: string; desc: string }[] = [
  { id: 'moto', label: 'Moto', icon: 'motorcycle', desc: 'Rápida e económica' },
  { id: 'economico', label: 'Económico', icon: 'car', desc: 'Carro para o dia a dia' },
  { id: 'conforto', label: 'Conforto', icon: 'car', desc: 'Mais espaço e conforto' },
];

export const PAYMENTS: { id: Payment; label: string; note?: string }[] = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'mpesa', label: 'M-Pesa', note: 'pagamento ao motorista' },
  { id: 'emola', label: 'e-Mola', note: 'pagamento ao motorista' },
];

export const categoryLabel = (c?: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? '';

export const money = (n: number | undefined | null) =>
  `MZN ${Math.round(Number.isFinite(n as number) ? (n as number) : 0)}`;

export function formatDistance(m: number | undefined | null) {
  const v = Number.isFinite(m as number) ? (m as number) : 0;
  return v < 1000 ? `${Math.round(v / 10) * 10} m` : `${(v / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDuration(s: number | undefined | null) {
  const v = Number.isFinite(s as number) ? (s as number) : 0;
  const min = Math.max(1, Math.round(v / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function haversine(a: LatLng, b: LatLng) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const toRN = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export const validPoint = (p: any): p is LatLng =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export const cleanPath = (pts: LatLng[] | undefined | null) =>
  Array.isArray(pts) ? pts.filter(validPoint) : [];

/** "+25%" a partir de 1.25 */
export const pct = (m: number | undefined) =>
  `+${Math.round(((Number.isFinite(m as number) ? (m as number) : 1) - 1) * 100)}%`;

export type Tag = { key: string; icon: string; text: string; tone: 'night' | 'warn' | 'accent' };

/** Etiquetas que explicam o preço ao passageiro e ao motorista. */
export function priceTags(p: { period?: PricePeriod; traffic?: Traffic; highDemand?: boolean }): Tag[] {
  const tags: Tag[] = [];
  if (p.period && p.period.multiplier > 1) {
    tags.push({
      key: 'period',
      icon: p.period.id === 'noite' ? 'moon' : 'clock',
      text: `${p.period.label} ${pct(p.period.multiplier)}`,
      tone: p.period.id === 'noite' ? 'night' : 'warn',
    });
  }
  if (p.traffic === 'intenso') tags.push({ key: 'traffic', icon: 'traffic', text: 'Trânsito intenso', tone: 'warn' });
  else if (p.traffic === 'moderado') tags.push({ key: 'traffic', icon: 'car', text: 'Trânsito moderado', tone: 'warn' });
  if (p.highDemand) tags.push({ key: 'demand', icon: 'bolt', text: 'Procura alta', tone: 'accent' });
  return tags;
}

/**
 * Número de WhatsApp de Moçambique no formato +2588XXXXXXXX, ou null se inválido.
 * Aceita "84 123 4567", "+258 84 123 4567", "258841234567". Redes móveis 82–87.
 * (Igual à validação do servidor.)
 */
export function normalizePhone(raw: string): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00258')) d = d.slice(5);
  else if (d.startsWith('258') && d.length === 12) d = d.slice(3);
  return /^8[2-7]\d{7}$/.test(d) ? `+258${d}` : null;
}

/** "+258841234567" -> "84 123 4567" */
export const formatPhone = (p: string) => {
  const d = p.replace(/^\+258/, '');
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : p;
};

export const clockTime = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const newSession = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
