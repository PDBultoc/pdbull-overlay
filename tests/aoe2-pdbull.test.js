import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs'; import { normalizeMatch } from '../core/aoe2.js';
const L = JSON.parse(readFileSync(new URL('./fixtures/pa100.json', import.meta.url)));
test('PDBull side picked from a real match', () => {
  const m = normalizeMatch(L[0], 551021);
  assert.equal(m.me.name, 'PDBull'); assert.equal(m.enemies[0][0].name, 'SwedishGoblinTwitch'); assert.equal(m.map, 'Arabia');
});
