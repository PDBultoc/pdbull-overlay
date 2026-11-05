import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, createSettings } from '../core/settings.js';

function mem(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('defaults when storage is empty', () => {
  const s = createSettings(mem());
  assert.deepEqual(s.get(), DEFAULTS);
  assert.equal(s.get().modules.intro.minSeconds, 6);
});

test('set/get by path persists', () => {
  const st = mem();
  const s = createSettings(st);
  s.set('modules.intro.minSeconds', 42);
  assert.equal(s.get().modules.intro.minSeconds, 42);
  assert.equal(createSettings(st).get().modules.intro.minSeconds, 42);
});

test('get() does not leak mutation into DEFAULTS', () => {
  const s = createSettings(mem());
  s.set('modules.intro.minSeconds', 7);
  assert.equal(DEFAULTS.modules.intro.minSeconds, 6);
});

test('deep-merge keeps new default keys', () => {
  const st = mem({ 'pdbull.v1': JSON.stringify({ glass: 0.3, modules: { intro: { minSeconds: 9 } } }) });
  const g = createSettings(st).get();
  assert.equal(g.glass, 0.3);
  assert.equal(g.modules.intro.minSeconds, 9);
  assert.equal(g.modules.intro.enabled, true);
  assert.equal(g.modules.camchat.lines, 7);
});

test('round-3 defaults merge into an old stored object without losing keys', () => {
  const st = mem({ 'pdbull.v1': JSON.stringify({ profileId: 1, scenes: { brbText: 'Back soon' }, modules: { camchat: { channel: 'x' } } }) });
  const g = createSettings(st).get();
  assert.deepEqual(g.ambience, { enabled: true, volume: 0.6 });
  assert.deepEqual(g.modules.matchbar, { enabled: true });
  assert.equal(g.scenes.brbText, 'Back soon');
  assert.equal(g.scenes.countdownMin, 5);
  assert.equal(g.modules.camchat.channel, 'x');
  assert.equal(g.modules.camchat.lines, 7);
  assert.equal(g.modules.alerts.enabled, true);
  assert.equal(g.profileId, 1);
});

test('bad JSON gives defaults', () => {
  const s = createSettings(mem({ 'pdbull.v1': '{nope' }));
  assert.deepEqual(s.get(), DEFAULTS);
});

test('onChange fires with path; patch and reset', () => {
  const s = createSettings(mem());
  const calls = [];
  const off = s.onChange((path, settings) => calls.push([path, settings.glass]));
  s.set('glass', 0.8);
  assert.deepEqual(calls, [['glass', 0.8]]);
  s.patch({ pollSec: 30, _rev: s.get()._rev + 1 });
  assert.equal(s.get().pollSec, 30);
  assert.equal(calls.length, 2);
  s.reset();
  assert.deepEqual(s.get(), DEFAULTS);
  off();
  s.set('glass', 0.1);
  assert.equal(calls.length, 3);
});

test('custom key is respected', () => {
  const st = mem();
  createSettings(st, 'k2').set('glass', 0.2);
  assert.equal(JSON.parse(st.getItem('k2')).glass, 0.2);
});
