import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneAudio } from '../core/sceneaudio.js';
import { PRESETS } from '../core/ambience.js';
import { makeFakeAudioCtx } from './ambience.test.js';

function fakeDoc(hidden = false) {
  const l = new Map();
  return {
    hidden,
    addEventListener(t, f) { l.set(t, f); },
    removeEventListener(t, f) { if (l.get(t) === f) l.delete(t); },
    fire(t) { const f = l.get(t); if (f) f(); },
    listeners: l,
  };
}
const startedCount = (log) => log.sources.filter((s) => s.started.length).length;
// createAmbience creates gains in this order: output, master, fadeGain, then the layers
const master = (log) => log.gains[1];
const fade = (log) => log.gains[2];
const loops = (log) => log.sources.filter((s) => s.loop && s.started.length);
const mk = (opts = {}) => {
  const { FakeAudioContext, log } = makeFakeAudioCtx();
  const doc = opts.doc || fakeDoc(false);
  const sa = createSceneAudio({ preset: opts.preset || 'starting', settings: opts.settings || {}, AudioCtx: FakeAudioContext, doc });
  return { sa, log, doc };
};

test('enabled=false -> no context, no source started', () => {
  const { sa, log } = mk({ settings: { ambience: { enabled: false, volume: 0.6 } } });
  sa.apply({ ambience: { enabled: false, volume: 0.6 } });
  assert.equal(startedCount(log), 0);
  sa.dispose();
});

test('missing settings.ambience defaults to enabled, volume 0.6', () => {
  const { sa, log } = mk();
  sa.apply({});
  assert.ok(startedCount(log) >= 3);
  assert.ok(Math.abs(master(log).gain.value - PRESETS.starting.master * 0.6) < 1e-9);
  sa.dispose();
});

test('volume 0.5 -> master gain = preset master x 0.5', () => {
  const { sa, log } = mk({ preset: 'brb' });
  sa.apply({ ambience: { enabled: true, volume: 0.5 } });
  assert.ok(Math.abs(master(log).gain.value - PRESETS.brb.master * 0.5) < 1e-9);
  sa.dispose();
});

test('toggling enabled off->on and changing volume while running', () => {
  const { sa, log } = mk({ preset: 'starting' });
  sa.apply({ ambience: { enabled: true, volume: 0.6 } });
  const n1 = startedCount(log);
  assert.ok(n1 >= 3);
  sa.apply({ ambience: { enabled: true, volume: 1 } });
  assert.ok(Math.abs(master(log).gain.value - PRESETS.starting.master) < 1e-9, 'volume change reaches master');
  assert.equal(startedCount(log), n1, 'volume change does not restart');
  sa.apply({ ambience: { enabled: false, volume: 1 } });
  assert.ok(loops(log).every((s) => s.stopped.length > 0), 'off stops looped sources');
  assert.equal(fade(log).gain.ramps.at(-1)[0], 0, 'off ramps fade to 0');
  sa.apply({ ambience: { enabled: true, volume: 0.5 } });
  assert.ok(startedCount(log) > n1, 'on restarts');
  assert.equal(fade(log).gain.ramps.at(-1)[0], 1, 'on ramps fade back to 1');
  assert.ok(Math.abs(master(log).gain.value - PRESETS.starting.master * 0.5) < 1e-9);
  const n2 = startedCount(log);
  sa.apply({ ambience: { enabled: true, volume: 0.5 } });
  assert.equal(startedCount(log), n2);
  sa.dispose();
});

test('hidden -> stop; visible again -> started once, no double start', () => {
  const { sa, log, doc } = mk();
  sa.apply({ ambience: { enabled: true, volume: 0.6 } });
  const n1 = startedCount(log);
  assert.ok(n1 >= 3);
  doc.fire('visibilitychange'); // still visible: nothing new
  sa.apply({ ambience: { enabled: true, volume: 0.6 } });
  assert.equal(startedCount(log), n1);
  doc.hidden = true; doc.fire('visibilitychange');
  assert.ok(loops(log).length >= 3 && loops(log).every((s) => s.stopped.length > 0), 'looped sources stopped when hidden');
  assert.equal(fade(log).gain.ramps.at(-1)[0], 0, 'fade ramps to 0 when hidden');
  doc.hidden = false; doc.fire('visibilitychange');
  const n2 = startedCount(log);
  assert.ok(n2 > n1);
  doc.fire('visibilitychange'); sa.apply({ ambience: { enabled: true, volume: 0.6 } });
  assert.equal(startedCount(log), n2, 'no double start');
  sa.dispose();
});

test('suspended context is resumed on the next settings message and on visible', () => {
  const { sa, log, doc } = mk();
  sa.apply({ ambience: { enabled: true, volume: 0.6 } });
  const ac = log.instances[0];
  ac.state = 'suspended';
  sa.apply({ ambience: { enabled: true, volume: 0.6 } });
  assert.equal(log.resumed, 1);
  ac.state = 'suspended';
  doc.fire('visibilitychange');
  assert.equal(log.resumed, 2);
  sa.dispose();
});

test('dispose stops, removes the listener and closes the context', () => {
  const { sa, log, doc } = mk();
  sa.apply({});
  sa.dispose();
  assert.equal(doc.listeners.size, 0);
  assert.equal(log.closed, 1);
  assert.ok(loops(log).length >= 3 && loops(log).every((s) => s.stopped.length > 0), 'dispose stops looped sources');
  assert.equal(fade(log).gain.ramps.at(-1)[0], 0);
});

test('null AudioCtx / doc (absent globals) never throws', () => {
  const sa = createSceneAudio({ preset: 'starting', settings: {}, AudioCtx: null, doc: null });
  sa.apply({});
  sa.dispose();
});
