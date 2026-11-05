import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbience, PRESETS } from '../core/ambience.js';

export function makeFakeAudioCtx() {
  const log = { gains: [], sources: [], oscs: [], resumed: 0, closed: 0, instances: [] };
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x) { this.value = x; },
    ramps: [],
    linearRampToValueAtTime(x, t) { this.ramps.push([x, t]); },
    cancelScheduledValues() {},
    setTargetAtTime(x) { this.value = x; },
  });
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = { connect() {} };
      log.instances.push(this);
    }
    createGain() { const n = { gain: param(1), connect() {} }; log.gains.push(n); return n; }
    createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {} }; }
    createBiquadFilter() { return { type: '', frequency: param(), Q: param(), connect() {} }; }
    createBuffer(ch, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
    createBufferSource() {
      const s = { buffer: null, loop: false, started: [], stopped: [], connect() {}, start(...a) { s.started.push(a); }, stop(...a) { s.stopped.push(a); } };
      log.sources.push(s); return s;
    }
    createOscillator() { const o = { frequency: param(), connect() {}, start() {}, stop() {} }; log.oscs.push(o); return o; }
    resume() { log.resumed++; this.state = 'running'; return Promise.resolve(); }
    close() { log.closed++; return Promise.resolve(); }
  }
  return { FakeAudioContext, log };
}

test('PRESETS has the three scenes with layers and master', () => {
  for (const k of ['starting', 'brb', 'ending']) {
    assert.equal(typeof PRESETS[k].master, 'number');
    for (const l of ['candle', 'hearth', 'quill']) assert.equal(typeof PRESETS[k].layers[l], 'number');
  }
});

test('createAmbience applies layer calibration and master, and start/stop drive sources', () => {
  const { FakeAudioContext, log } = makeFakeAudioCtx();
  const ac = new FakeAudioContext();
  const a = createAmbience(ac, { layers: { candle: 1, hearth: 1, quill: 1 }, master: 0.5 });
  assert.equal(typeof a.output.connect, 'function');
  const vals = log.gains.map((g) => +g.gain.value.toFixed(3));
  assert.ok(vals.includes(0.33) && vals.includes(0.55) && vals.includes(0.6), `CAL gains missing: ${vals}`);
  a.start();
  const started = log.sources.filter((s) => s.started.length).length;
  assert.ok(started >= 3, 'long-lived noise sources started');
  a.start();
  assert.equal(log.sources.filter((s) => s.started.length).length, started, 'double start is a no-op');
  const loops = () => log.sources.filter((s) => s.loop && s.started.length);
  assert.ok(loops().length >= 3);
  assert.ok(loops().every((s) => s.stopped.length === 0), 'looped sources run before stop()');
  const fade = log.gains[2]; // createAmbience order: output, master, fadeGain, layers
  assert.deepEqual(fade.gain.ramps.at(-1)[0], 1, 'fade-in ramp to 1 on start');
  a.stop(800);
  assert.ok(loops().every((s) => s.stopped.length === 1), 'stop stops every looped source');
  assert.equal(fade.gain.ramps.at(-1)[0], 0, 'stop ramps the fade gain to 0');
});

test('master node (not any gain) carries master; setMaster changes it', () => {
  const { FakeAudioContext, log } = makeFakeAudioCtx();
  const ac = new FakeAudioContext();
  const a = createAmbience(ac, { layers: { candle: 1, hearth: 1, quill: 1 }, master: 0.5 });
  assert.equal(log.gains[1].gain.value, 0.5);
  a.setMaster(0.25);
  assert.equal(log.gains[1].gain.value, 0.25);
});
