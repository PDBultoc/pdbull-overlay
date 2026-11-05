import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbience, PRESETS } from '../core/ambience.js';

export function makeFakeAudioCtx() {
  const log = { gains: [], sources: [], oscs: [], resumed: 0, closed: 0, instances: [] };
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x) { this.value = x; },
    linearRampToValueAtTime() {},
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
  a.stop(800);
  assert.ok(log.sources.some((s) => s.stopped.length), 'stop stops long-lived sources');
});
