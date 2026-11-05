import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DUST_DRIFT_X_GLSL, dustOffsetX } from '../core/dustdrift.js';

test('dust x-offset stays within the room over a 4 h scene', () => {
  let worst = 0;
  for (let t = 0; t <= 4 * 3600; t += 60) {
    for (let i = 0; i < 20; i++) {
      const p = i / 20;
      worst = Math.max(worst, Math.abs(dustOffsetX(t, p)));
    }
  }
  assert.ok(worst <= 0.95, `max |offset| was ${worst}`);
});

test('DUST_DRIFT_X_GLSL has no bare uTime term outside sin()', () => {
  const outside = DUST_DRIFT_X_GLSL.replace(/sin\([^()]*\)/g, '');
  assert.equal(outside.includes('uTime'), false, `bare uTime in: ${outside}`);
});

test('war-table dust shader uses the shared drift term', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../shared/war-table.js', import.meta.url)),
    'utf8',
  );
  assert.ok(
    src.includes("import { DUST_DRIFT_X_GLSL } from '../core/dustdrift.js';"),
    'missing import of DUST_DRIFT_X_GLSL',
  );
  assert.ok(src.includes('p.x += ${DUST_DRIFT_X_GLSL};'), 'missing shader line');
  assert.equal(src.includes('uTime * 0.02'), false, 'unbounded drift term still present');
});
