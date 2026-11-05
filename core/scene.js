// Render lifecycle: a WebGL scene exists only while it is visible.
// createScene({ canvasHost, build, onFrame, maxFps = 60, tableOpts, createTable }) -> { start, stop, dispose, running, wt }
//  - start(): creates the war table (once; stop() keeps it, dispose() drops it), calls build(wt) once per creation,
//    drives rAF itself (wt.step(dt) + composer render), throttled to maxFps.
//  - stop(): cancels rAF (the GPU context stays alive for a quick resume).
//  - dispose(): stop + free geometries, materials, textures, render targets, composer, renderer (forceContextLoss),
//    and remove the canvas. start() after dispose() builds a fresh scene.
//  - auto-stop on document hidden; resume on visible if start() was the last call.
// createTable is injectable for node tests; the default lazily imports shared/war-table.js (needs the browser importmap),
// in which case start() finishes asynchronously (running turns true once the table exists).

let defaultFactory = null;
async function loadDefault() {
  if (!defaultFactory) { const m = await import('../shared/war-table.js'); defaultFactory = m.createWarTable; }
  return defaultFactory;
}

function freeObject3D(root, seen) {
  root.traverse((o) => {
    if (o.geometry?.dispose) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      m.dispose?.();
    }
  });
}

export function createScene({ canvasHost, build, onFrame, maxFps = 60, tableOpts = {}, createTable } = {}) {
  let wt = null, raf = 0, wanted = false, active = false, last = 0, gen = 0, listening = false;
  const minGap = 1000 / maxFps - 1;
  const hidden = () => !!globalThis.document?.hidden;

  function frame(now) {
    raf = 0;
    if (!active) return;
    raf = globalThis.requestAnimationFrame(frame);
    if (now - last < minGap) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    wt.step(dt);
    if (onFrame) onFrame(dt, wt);
    wt.composer.render();
  }
  function run() {
    if (active || !wt || !wanted || hidden()) return;
    active = true;
    last = globalThis.performance.now();
    raf = globalThis.requestAnimationFrame(frame);
  }
  function halt() {
    active = false;
    if (raf) { globalThis.cancelAnimationFrame(raf); raf = 0; }
  }
  function onVis() { if (hidden()) halt(); else run(); }
  function listen(on) {
    if (on === listening) return;
    listening = on;
    const d = globalThis.document;
    if (on) d?.addEventListener('visibilitychange', onVis); else d?.removeEventListener('visibilitychange', onVis);
  }
  function make(factory) {
    wt = factory(canvasHost, { ...tableOpts, autoStart: false });
    if (build) build(wt);
    run();
  }

  const api = {
    get running() { return active; },
    get wt() { return wt; },
    start() {
      wanted = true;
      listen(true);
      if (wt) { run(); return api; }
      const my = ++gen;
      if (createTable || defaultFactory) { make(createTable || defaultFactory); return api; }
      loadDefault().then((f) => { if (my === gen && wanted && !wt) make(f); });
      return api;
    },
    stop() {
      wanted = false;
      halt();
      return api;
    },
    dispose() {
      wanted = false; gen++;
      halt(); listen(false);
      if (!wt) return api;
      const t = wt; wt = null;
      t.dispose?.();
      const seen = new Set();
      if (t.scene) {
        freeObject3D(t.scene, seen);
        for (const k of ['environment', 'background']) { const v = t.scene[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      }
      const c = t.composer;
      if (c) {
        for (const rt of [c.renderTarget1, c.renderTarget2]) rt?.dispose?.();
        for (const p of c.passes || []) p.dispose?.();
        c.dispose?.();
      }
      const r = t.renderer;
      if (r) {
        const el = r.domElement;
        r.dispose?.();
        r.forceContextLoss?.();
        el?.remove?.();
      }
      return api;
    },
  };
  return api;
}
