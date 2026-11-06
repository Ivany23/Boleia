/**
 * Zonas com estrada de AREIA/TERRA ao longo do percurso.
 *
 * Em muitos bairros de Maputo e Matola as ruas não são alcatroadas: só areia.
 * Os carros baixos atolam, gastam mais combustível e alguns motoristas recusam.
 *
 * Dados: as estradas de areia/terra da Grande Maputo, tiradas do OpenStreetMap
 * (surface=sand/unpaved/dirt/ground…, highway=track, tracktype grade3-5) e
 * guardadas em src/data/sand-maputo.json (gerar de novo: scripts/build-sand-data.mjs).
 * A consulta é LOCAL: instantânea, sem internet, sem falhas de serviços externos.
 *
 * Método: pontos a cada ~50 m do percurso. Um ponto conta como areia se estiver a
 * menos de 15 m de uma estrada de areia E seguir na mesma direcção dela (assim, ao
 * atravessar uma rua de areia num cruzamento da avenida alcatroada, não conta).
 * Ruas sem informação no OpenStreetMap contam como "não é areia": nunca cobramos
 * areia sem dados.
 */
import fs from 'node:fs';
import { haversine } from './geo.js';

const SANDY = new Set(['sand', 'unpaved', 'dirt', 'ground', 'earth', 'mud', 'grass', 'soil', 'dust']);
const PAVED = new Set([
  'asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone',
  'unhewn_cobblestone', 'chipseal', 'compacted', 'fine_gravel', 'gravel', 'pebblestone', 'bricks', 'metal', 'wood',
]);

const NEAR_M = 15; // distância máxima do percurso à estrada de areia
const MAX_ANGLE_DEG = 35; // diferença máxima de direcção (sem sentido)
const STEP_M = 50;
const MAX_SAMPLES = 400;
const CELL = 0.005; // grelha do índice (~500 m)

/** 'sand' | 'paved' | 'unknown' a partir das etiquetas OSM de uma estrada. */
export function classifyWay(tags = {}) {
  const t = tags ?? {};
  const s = String(t.surface ?? '').toLowerCase();
  if (SANDY.has(s)) return 'sand';
  if (PAVED.has(s)) return 'paved';
  const tt = String(t.tracktype ?? '');
  if (/^grade[345]$/.test(tt)) return 'sand';
  if (tt === 'grade1' || tt === 'grade2') return 'paved';
  if (t.highway === 'track') return 'sand';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Polylines codificadas (formato Google, precisão 1e-5 ≈ 1 m): dados compactos
// ---------------------------------------------------------------------------

export function encodePolyline(points) {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += enc(lat - pLat) + enc(lng - pLng);
    pLat = lat;
    pLng = lng;
  }
  return out;
}

function decode(str) {
  const out = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i <= str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d;
      else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometria local (metros), boa para distâncias de alguns km
// ---------------------------------------------------------------------------

const kx = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const KY = 110540;

/** Vector unitário (em metros) de a para b, ou null se forem o mesmo ponto. */
function dirOf(a, b) {
  const x = (b.lng - a.lng) * kx((a.lat + b.lat) / 2);
  const y = (b.lat - a.lat) * KY;
  const len = Math.hypot(x, y);
  return len > 0.01 ? { x: x / len, y: y / len } : null;
}

function distToSegment(p, a, b) {
  const k = kx(p.lat);
  const ax = (a.lng - p.lng) * k;
  const ay = (a.lat - p.lat) * KY;
  const bx = (b.lng - p.lng) * k;
  const by = (b.lat - p.lat) * KY;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Pontos igualmente espaçados ao longo do percurso (inclui o início e o fim),
 * cada um com a direcção do percurso nesse sítio: { lat, lng, dir }.
 */
export function samplePath(path, step = STEP_M, maxSamples = MAX_SAMPLES) {
  const pts = (Array.isArray(path) ? path : []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  if (pts.length === 0) return [];
  if (pts.length === 1) return [{ lat: pts[0].lat, lng: pts[0].lng, dir: null }];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.min(maxSamples, Math.floor(total / step) + 1));
  const stepLen = total / (n - 1);
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const d = Math.min(total, k * stepLen);
    while (j < pts.length - 1 && cum[j] < d) j++;
    const a = pts[j - 1];
    const b = pts[j];
    const seg = cum[j] - cum[j - 1];
    const t = seg > 0 ? Math.min(1, Math.max(0, (d - cum[j - 1]) / seg)) : 0;
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, dir: dirOf(a, b) });
  }
  return out;
}

/** Índice em grelha dos segmentos de estradas de areia. */
export function buildIndex(ways) {
  const cells = new Map();
  let segments = 0;
  const pad = 0.0002; // ~20 m de margem à volta de cada segmento
  for (const w of ways) {
    const g = typeof w === 'string' ? decode(w) : w;
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1];
      const b = g[i];
      const seg = { a, b, dir: dirOf(a, b) };
      if (!seg.dir) continue;
      segments++;
      const x0 = Math.floor((Math.min(a.lng, b.lng) - pad) / CELL);
      const x1 = Math.floor((Math.max(a.lng, b.lng) + pad) / CELL);
      const y0 = Math.floor((Math.min(a.lat, b.lat) - pad) / CELL);
      const y1 = Math.floor((Math.max(a.lat, b.lat) + pad) / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${x}:${y}`;
          let list = cells.get(key);
          if (!list) cells.set(key, (list = []));
          list.push(seg);
        }
      }
    }
  }
  return { cells, segments };
}

const COS_MAX = Math.cos((MAX_ANGLE_DEG * Math.PI) / 180);

/** O ponto (com a direcção do percurso) está numa estrada de areia? */
export function onSand(index, p) {
  const list = index.cells.get(`${Math.floor(p.lng / CELL)}:${Math.floor(p.lat / CELL)}`);
  if (!list) return false;
  for (const s of list) {
    if (distToSegment(p, s.a, s.b) > NEAR_M) continue;
    // mesma direcção (ou sentido contrário): segue PELA rua de areia, não a atravessa
    if (!p.dir || Math.abs(p.dir.x * s.dir.x + p.dir.y * s.dir.y) >= COS_MAX) return true;
  }
  return false;
}

/** Resumo: metros em areia (proporcional aos pontos) e se a recolha/destino são em areia. */
export function summarize(flags, distanceMeters) {
  const n = flags.length;
  if (!n) return null;
  const sand = flags.filter(Boolean).length;
  const ratio = sand / n;
  return {
    sandMeters: Math.round(ratio * Math.max(0, Number(distanceMeters) || 0)),
    sandRatio: Math.round(ratio * 100) / 100,
    pickupSand: !!flags[0],
    dropoffSand: !!flags[n - 1],
  };
}

const DATA_FILE = new URL('./data/sand-maputo.json', import.meta.url);

/**
 * @param ways  lista de estradas de areia (polylines codificadas ou [{lat,lng}]);
 *              por omissão, lê src/data/sand-maputo.json na primeira utilização.
 * @param bbox  [sul, oeste, norte, este] da zona coberta pelos dados.
 */
export function createSurface({ ways, bbox, enabled = process.env.SURFACE_CHECK !== '0' } = {}) {
  let index = null;
  let box = bbox ?? null;

  function load() {
    if (index) return index;
    let list = ways;
    if (!list) {
      try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        list = Array.isArray(data.ways) ? data.ways : [];
        box = box ?? data.bbox ?? null;
      } catch (e) {
        console.log(`[areia] sem dados de estradas de areia: ${e?.message ?? e}`);
        list = [];
      }
    }
    index = buildIndex(list);
    return index;
  }

  const inside = (p) => !box || (p.lat >= box[0] && p.lat <= box[2] && p.lng >= box[1] && p.lng <= box[3]);

  /**
   * { sandMeters, sandRatio, pickupSand, dropoffSand } ou null (desligado,
   * percurso vazio, ou totalmente fora da zona com dados).
   */
  async function analyse(polyline, distanceMeters) {
    if (!enabled) return null;
    const idx = load();
    const samples = samplePath(polyline);
    if (!samples.length || !samples.some(inside)) return null;
    return summarize(samples.map((p) => inside(p) && onSand(idx, p)), distanceMeters);
  }

  return { analyse, segments: () => load().segments };
}
