import type { Category, LatLng, Payment, PricePeriod, Rain, Surface, Traffic } from './types';

export const MAPUTO: LatLng = { lat: -25.9692, lng: 32.5732 };

export const CATEGORIES: { id: Category; label: string; icon: 'motorcycle' | 'taxi' | 'car'; desc: string }[] = [
  { id: 'moto', label: 'Mota', icon: 'motorcycle', desc: 'Rápida e económica' },
  { id: 'economico', label: 'Económico', icon: 'taxi', desc: 'Carro para o dia a dia' },
  { id: 'conforto', label: 'Conforto', icon: 'car', desc: 'SUV: mais espaço, melhor na areia' },
];

export const PAYMENTS: { id: Payment; label: string; icon: 'cash' | 'phone'; note?: string }[] = [
  { id: 'dinheiro', label: 'Dinheiro', icon: 'cash' },
  { id: 'mpesa', label: 'M-Pesa', icon: 'phone', note: 'pagamento ao motorista' },
  { id: 'emola', label: 'e-Mola', icon: 'phone', note: 'pagamento ao motorista' },
];

export const MAX_STOPS = 3;

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

/** Distância (m) de um ponto ao percurso mais próximo de uma linha; Infinity se vazia. */
export function distToPath(p: LatLng, path: LatLng[]) {
  if (!path.length) return Infinity;
  // plano local à volta do ponto (suficiente à escala de uma cidade)
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  const xy = (q: LatLng) => [(q.lng - p.lng) * kx, (q.lat - p.lat) * ky];
  if (path.length === 1) return Math.hypot(...(xy(path[0]) as [number, number]));
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1]);
    const [bx, by] = xy(path[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Para cada percurso, o ponto mais afastado dos outros (onde pôr a etiqueta do preço). */
export function labelPoints(paths: LatLng[][]): (LatLng | null)[] {
  return paths.map((path, i) => {
    if (!path.length) return null;
    const others = paths.filter((_, j) => j !== i);
    const step = Math.max(1, Math.floor(path.length / 60));
    let best = path[Math.floor(path.length / 2)];
    let bestD = -1;
    // evita as pontas (partida e destino são comuns a todas as rotas)
    for (let k = Math.floor(path.length * 0.15); k <= Math.ceil(path.length * 0.85) && k < path.length; k += step) {
      const d = others.length ? Math.min(...others.map((o) => distToPath(path[k], o))) : 0;
      if (d > bestD) {
        bestD = d;
        best = path[k];
      }
    }
    return best;
  });
}

export const pct = (m: number | undefined) =>
  `+${Math.round(((Number.isFinite(m as number) ? (m as number) : 1) - 1) * 100)}%`;

export type Tag = { key: string; icon: string; text: string; tone: 'night' | 'warn' | 'accent' | 'sand' };

export function priceTags(p: {
  period?: PricePeriod;
  traffic?: Traffic;
  highDemand?: boolean;
  surface?: Surface | null;
  rain?: Rain | null;
  fewDrivers?: Category[];
  local?: boolean;

  category?: Category;
}): Tag[] {
  const tags: Tag[] = [];
  if (p.local) tags.push({ key: 'local', icon: 'location', text: 'Tarifa de bairro', tone: 'sand' });
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
  if (p.rain) {
    tags.push({ key: 'rain', icon: 'rain', text: `Chuva ${p.rain.level} ${pct(p.rain.multiplier)}`, tone: 'night' });
  }
  const few = !!p.category && !!p.fewDrivers?.includes(p.category);
  if (few) tags.push({ key: 'few', icon: 'car', text: 'Poucos carros por perto', tone: 'accent' });
  else if (p.highDemand) tags.push({ key: 'demand', icon: 'bolt', text: 'Procura alta', tone: 'accent' });
  const sand = p.surface?.sandMeters ?? 0;
  if (sand >= 50) tags.push({ key: 'sand', icon: 'sand', text: `Areia: ${formatDistance(sand)}`, tone: 'sand' });
  return tags;
}

export function normalizePhone(raw: string): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00258')) d = d.slice(5);
  else if (d.startsWith('258') && d.length === 12) d = d.slice(3);
  return /^8[2-7]\d{7}$/.test(d) ? `+258${d}` : null;
}

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
