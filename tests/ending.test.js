import test from 'node:test';
import assert from 'node:assert/strict';
import { camDrift, lookDrift, beatAt, T_OUT, CAM_BOUNDS } from '../core/endinglogic.js';

test('camDrift stays inside its bounds for 4 hours (10 s steps)', () => {
  for (let t = 0; t <= 4 * 3600; t += 10) {
    const d = camDrift(t);
    assert.ok(Math.abs(d.x) <= CAM_BOUNDS.x, `x at ${t}`);
    assert.ok(Math.abs(d.y) <= CAM_BOUNDS.y, `y at ${t}`);
    assert.ok(Math.abs(d.z) <= CAM_BOUNDS.z, `z at ${t}`);
    assert.ok(Math.abs(lookDrift(t)) <= CAM_BOUNDS.lookX, `look at ${t}`);
  }
});

test('camDrift is small and finite', () => {
  assert.ok(CAM_BOUNDS.x <= 0.2 && CAM_BOUNDS.y <= 0.07 && CAM_BOUNDS.z <= 0.1);
  assert.deepEqual(camDrift(0), { x: 0, y: 0, z: 0 });
});

test('beat: the flame is lit at 0 and out at 3.2 s', () => {
  assert.equal(T_OUT, 3.2);
  assert.equal(beatAt(0).flame, 1);
  assert.ok(beatAt(2).flame > 0 && beatAt(2).flame < 1);
  assert.equal(beatAt(3.19).flame > 0, true);
  assert.equal(beatAt(4).flame, 0);
});

test('beat: ember glows after the flame is out, never before', () => {
  assert.equal(beatAt(3.2).ember, 0);
  assert.equal(beatAt(0).ember, 0);
  assert.equal(beatAt(4).ember, 1);
});

test('beat: the letter is written between 2.6 s and 8 s', () => {
  assert.equal(beatAt(2.6).ink, 0);
  let prev = 0;
  for (let t = 2.6; t <= 8; t += 0.1) { const k = beatAt(t).ink; assert.ok(k >= prev); assert.ok(k >= 0 && k <= 1); prev = k; }
  assert.equal(beatAt(8).ink, 1);
});

test('beat: steady state after the opening, for hours', () => {
  assert.deepEqual(beatAt(3600), beatAt(8));
  assert.deepEqual(beatAt(4 * 3600), beatAt(8));
  assert.deepEqual(beatAt(-5), beatAt(0));
});
