import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatusRelay } from '../core/camchatlogic.js';

test('relays only when a source ok/reason changes', () => {
  const sent = [];
  const r = createStatusRelay((p) => sent.push(p));
  r({ source: 'aoe2', ok: true });
  r({ source: 'aoe2', ok: true });
  r({ source: 'aoe2', ok: true });
  assert.equal(sent.length, 1);
  r({ source: 'aoe2', ok: false, reason: 'http 500' });
  r({ source: 'aoe2', ok: false, reason: 'http 500' });
  assert.equal(sent.length, 2);
  r({ source: 'aoe2', ok: false, reason: 'rate-limited' });
  assert.equal(sent.length, 3);
  r({ source: 'chat', ok: true, reason: 'connected' });
  assert.equal(sent.length, 4);
  assert.deepEqual(sent[3], { source: 'chat', ok: true, reason: 'connected' });
});

test('ignores sources other than aoe2 and chat (no sync/streamlabs relay)', () => {
  const sent = [];
  const r = createStatusRelay((p) => sent.push(p));
  r({ source: 'sync', ok: true });
  r({ source: 'streamlabs', ok: false });
  r(null);
  assert.equal(sent.length, 0);
});
