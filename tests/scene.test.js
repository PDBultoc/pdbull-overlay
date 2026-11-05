import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../core/scene.js';

// ---- fakes: rAF, document, wt (no WebGL, no BroadcastChannel) ----
function setup() {
  const st = { raf: new Map(), nextId: 1, requested: 0, cancelled: 0, now: 0, listeners: new Set(), hidden: false };
  globalThis.requestAnimationFrame = (fn) => { const id = st.nextId++; st.requested++; st.raf.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = (id) => { if (st.raf.delete(id)) st.cancelled++; };
  globalThis.performance = { now: () => st.now };
  const doc = {
    get hidden() { return st.hidden; },
    addEventListener: (t, f) => { if (t === 'visibilitychange') st.listeners.add(f); },
    removeEventListener: (t, f) => { if (t === 'visibilitychange') st.listeners.delete(f); },
  };
  globalThis.document = doc;
  st.pending = () => st.raf.size;
  st.tickFrame = (ms = 16.7) => { st.now += ms; const fns = [...st.raf.values()]; st.raf.clear(); fns.forEach((f) => f(st.now)); };
  st.setHidden = (h) => { st.hidden = h; st.listeners.forEach((f) => f()); };
  st.tables = [];
  st.createTable = (host, opts) => {
    const canvas = { removed: false, remove() { this.removed = true; host.child = null; } };
    host.child = canvas;
    const log = { geo: 0, mat: 0, tex: 0, rt: 0, composerDisposed: false, rendererDisposed: false, ctxLost: false, disposed: 0, steps: [], renders: 0 };
    const geometry = { dispose: () => log.geo++ };
    const map = { isTexture: true, dispose: () => log.tex++ };
    const material = { map, dispose: () => log.mat++ };
    const mesh = { geometry, material };
    const scene = { traverse: (fn) => { fn(scene); fn(mesh); } };
    const wt = {
      opts, scene, log,
      renderer: { domElement: canvas, dispose: () => { log.rendererDisposed = true; }, forceContextLoss: () => { log.ctxLost = true; } },
      composer: { renderTarget1: { dispose: () => log.rt++ }, renderTarget2: { dispose: () => log.rt++ }, render: () => log.renders++, dispose: () => { log.composerDisposed = true; } },
      step: (dt) => log.steps.push(dt),
      dispose: () => log.disposed++,
    };
    st.tables.push(wt);
    return wt;
  };
  return st;
}

test('start builds once, stop cancels rAF, dispose cleans up', () => {
  const st = setup();
  const host = {};
  let builds = 0, frames = 0;
  const sc = createScene({ canvasHost: host, build: () => builds++, onFrame: () => frames++, createTable: st.createTable, tableOpts: { bloom: false } });
  assert.equal(sc.running, false);
  sc.start();
  assert.equal(builds, 1);
  assert.equal(sc.running, true);
  assert.equal(st.tables[0].opts.bloom, false);
  assert.equal(st.tables[0].opts.autoStart, false);
  st.tickFrame(); st.tickFrame();
  assert.equal(frames, 2);
  assert.equal(st.tables[0].log.renders, 2);
  sc.stop();
  assert.equal(sc.running, false);
  assert.equal(st.pending(), 0);
  st.tickFrame();
  assert.equal(frames, 2);
  sc.dispose();
  assert.equal(st.pending(), 0);
  const l = st.tables[0].log;
  assert.equal(l.geo, 1); assert.equal(l.mat, 1); assert.equal(l.tex, 1); assert.equal(l.rt, 2);
  assert.ok(l.composerDisposed && l.rendererDisposed && l.ctxLost);
  assert.equal(l.disposed, 1);
  assert.equal(host.child, null);
  assert.equal(st.listeners.size, 0);
});

test('dispose while running: 0 rAF pending, build called once per start after dispose', () => {
  const st = setup();
  const host = {};
  let builds = 0;
  const sc = createScene({ canvasHost: host, build: () => builds++, createTable: st.createTable });
  sc.start();
  assert.equal(st.pending(), 1);
  sc.dispose();
  assert.equal(st.pending(), 0);
  assert.equal(sc.running, false);
  sc.start();
  assert.equal(builds, 2);
  assert.equal(st.tables.length, 2);
  assert.equal(st.pending(), 1);
  sc.dispose();
  assert.equal(st.pending(), 0);
});

test('start twice is a no-op; stop then start resumes without rebuilding', () => {
  const st = setup();
  let builds = 0;
  const sc = createScene({ canvasHost: {}, build: () => builds++, createTable: st.createTable });
  sc.start(); sc.start();
  assert.equal(builds, 1); assert.equal(st.pending(), 1);
  sc.stop();
  sc.start();
  assert.equal(builds, 1); assert.equal(st.tables.length, 1); assert.equal(st.pending(), 1);
  sc.dispose();
});

test('document hidden stops rAF, visible resumes', () => {
  const st = setup();
  const sc = createScene({ canvasHost: {}, build() {}, createTable: st.createTable });
  sc.start();
  st.setHidden(true);
  assert.equal(st.pending(), 0);
  assert.equal(sc.running, false);
  st.setHidden(false);
  assert.equal(st.pending(), 1);
  assert.equal(sc.running, true);
  sc.stop();
  st.setHidden(true); st.setHidden(false);
  assert.equal(st.pending(), 0, 'stopped scene must not resume');
  sc.dispose();
});

test('maxFps throttles rendering; dt is capped at 0.1', () => {
  const st = setup();
  const sc = createScene({ canvasHost: {}, build() {}, maxFps: 30, createTable: st.createTable });
  sc.start();
  st.tickFrame(16.7); // too early for 30 fps: skipped
  assert.equal(st.tables[0].log.renders, 0);
  st.tickFrame(16.7);
  assert.equal(st.tables[0].log.renders, 1);
  st.tickFrame(500);
  assert.equal(st.tables[0].log.steps.at(-1), 0.1);
  sc.dispose();
});

test('dispose twice and stop before start are safe', () => {
  const st = setup();
  const sc = createScene({ canvasHost: {}, build() {}, createTable: st.createTable });
  sc.stop(); sc.dispose();
  sc.start(); sc.dispose(); sc.dispose();
  assert.equal(st.tables[0].log.rt, 2);
  assert.equal(st.pending(), 0);
});
