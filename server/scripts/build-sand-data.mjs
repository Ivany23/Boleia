/**
 * Gera src/data/sand-maputo.json: as estradas de AREIA/TERRA da Grande Maputo
 * (Maputo, Matola, KaTembe, Marracuene, Boane), a partir do OpenStreetMap.
 *
 * Uso (de vez em quando, para actualizar os dados):
 *   node scripts/build-sand-data.mjs              -> descarrega do Overpass e grava
 *   node scripts/build-sand-data.mjs dados.json   -> usa uma resposta do Overpass já guardada
 *
 * Os dados são © contribuidores do OpenStreetMap, licença ODbL (ver src/data/README.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyWay, encodePolyline } from '../src/surface.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'data', 'sand-maputo.json');
const BBOX = [-26.25, 32.25, -25.6, 32.85]; // sul, oeste, norte, este
const ROADS =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track|road';
const SAND = 'sand|unpaved|dirt|ground|earth|mud|grass|soil|dust';
const QUERY =
  `[out:json][timeout:300][bbox:${BBOX.join(',')}];(` +
  `way[highway~"^(${ROADS})$"][surface~"^(${SAND})$"];` +
  `way[highway=track][!surface];` +
  `way[highway~"^(${ROADS})$"][tracktype~"^grade[345]$"][!surface];` +
  `);out tags geom;`;
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function download() {
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'Boleia/1.0 (app de boleias, Maputo)',
          },
          body: 'data=' + encodeURIComponent(QUERY),
          signal: AbortSignal.timeout(320000),
        });
        if (res.ok) return await res.json();
        console.log(`${url}: HTTP ${res.status}`);
      } catch (e) {
        console.log(`${url}: ${e?.message ?? e}`);
      }
    }
    const wait = 5000 * 2 ** attempt;
    console.log(`a tentar de novo dentro de ${wait / 1000} s…`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error('Overpass indisponível');
}

const input = process.argv[2];
const raw = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : await download();
const ways = [];
for (const w of raw.elements ?? []) {
  if (w.type !== 'way' || !Array.isArray(w.geometry) || w.geometry.length < 2) continue;
  if (classifyWay(w.tags) !== 'sand') continue;
  ways.push(encodePolyline(w.geometry.map((g) => ({ lat: g.lat, lng: g.lon }))));
}
const out = {
  about: 'Estradas de areia/terra da Grande Maputo (surface=sand/unpaved/dirt/ground…, highway=track, tracktype grade3-5).',
  source: '© contribuidores do OpenStreetMap (https://www.openstreetmap.org/copyright), ODbL 1.0',
  osmTimestamp: raw.osm3s?.timestamp_osm_base ?? null,
  bbox: BBOX,
  ways,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${ways.length} estradas gravadas em ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
