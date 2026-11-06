# Dados

## sand-maputo.json

Estradas de **areia/terra** da Grande Maputo (Maputo, Matola, KaTembe, Marracuene, Boane), usadas para
avisar o passageiro e ajustar o preço quando o percurso passa por ruas não alcatroadas
(ver `src/surface.js`).

- Origem: OpenStreetMap, estradas com `surface=sand/unpaved/dirt/ground/earth/mud/grass`,
  `highway=track` sem piso indicado, ou `tracktype=grade3/4/5`.
- Formato: `ways` é uma lista de polylines codificadas (formato Google, precisão 1e-5).
- Actualizar: `node scripts/build-sand-data.mjs` (descarrega do Overpass; pode demorar alguns minutos).

**Licença:** © contribuidores do OpenStreetMap, disponível sob a
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Ver <https://www.openstreetmap.org/copyright>.
