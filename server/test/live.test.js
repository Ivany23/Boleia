import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogle } from '../src/google.js';

const live = {
  skip: process.env.RUN_LIVE !== '1' && 'defina RUN_LIVE=1 para testar a Google',
  timeout: 30000,
};
const g = createGoogle();

test('live: rota Baixa → Matola (com trânsito)', live, async () => {
  const r = await g.route({ lat: -25.9692, lng: 32.5732 }, { lat: -25.9622, lng: 32.4589 });
  assert.ok(r.distanceMeters > 0);
  assert.ok(r.durationSeconds > 0);
  assert.ok(r.staticDurationSeconds > 0);
  assert.ok(r.polyline.length > 1);
});

test('live: autocomplete "Shoprite"', live, async () => {
  const r = await g.autocomplete({
    input: 'Shoprite',
    lat: -25.9692,
    lng: 32.5732,
    session: 'teste-boleia-1',
  });
  assert.ok(r.suggestions.length >= 1);
  assert.ok(r.suggestions[0].placeId);
});
