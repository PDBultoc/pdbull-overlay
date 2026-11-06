// Render lifecycle: a WebGL scene exists only while it is visible.
// createScene({ canvasHost, build, onFrame, maxFps = 60, tableOpts, createTable }) -> { start, stop, dispose, running, wt }
//  - start(): creates the war table (once; stop() keeps it, dispose() drops it), calls build(wt) once per creation,
//    drives rAF itself (wt.step(dt) + composer render), throttled to maxFps.
//  - stop(): cancels rAF (the GPU context stays alive for a quick resume).
//  - dispose(): stop + free geometries, materials, textures, render targets, composer, renderer (forceContextLoss),
//    and remove the canvas. start() after dispose() builds a fresh scene.
//  - auto-stop on document hidden or OBS obsSourceVisibleChanged {visible:false}; resume on visible if start() was the last call.
//  - created while hidden (OBS source in an inactive scene): one warm-up render after build (after its promise, if
//    build returns one) so the first show does not stall on shader compiles.
// createTable is injectable for node tests; the default lazily imports shared/war-table.js (needs the browser importmap),
// in which case start() finishes asynchronously (running turns true once the table exists).

let defaultFactory = null;
async function loadDefault() {
  if (!defaultFactory) { const m = await import('../shared/war-table.js'); defaultFactory = m.createWarTable; }
  return defaultFactory;
}

function freeObject3D(root, seen) {
  root.traverse((o) => {
    if (o.isLight && o.shadow?.map?.dispose) o.shadow.map.dispose();
    if ((o.isInstancedMesh || o.isSkinnedMesh) && o.dispose) o.dispose();
    if (o.geometry?.dispose) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      m.dispose?.();
    }
  });
}

function teardown(t) {
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
}

export function createScene({ canvasHost, build, onFrame, maxFps = 60, tableOpts = {}, createTable, loadTable = loadDefault } = {}) {
  let wt = null, raf = 0, wanted = false, active = false, last = 0, gen = 0, listening = false, obsHidden = false;
  const minGap = 1000 / maxFps - 1;
  // OBS 33.0.1 (measured 2026-11-06): a source shown once and hidden again keeps document.hidden false and kept
  // rendering its war table (~43 % GPU, BRB). obsSourceVisibleChanged {visible} is the reliable signal.
  const hidden = () => obsHidden || !!globalThis.document?.hidden;

  function frame(now) {
    raf = 0;
    if (!active) return;
    raf = globalThis.requestAnimationFrame(frame);
    if (now - last < minGap) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = wt;
    t.step(dt);
    if (onFrame) onFrame(dt, t);
    if (!active || wt !== t) return; // onFrame may have called stop() or dispose()
    t.composer.render();
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
  function onObsVisible(e) { obsHidden = !(e && e.detail && e.detail.visible); onVis(); }
  function listen(on) {
    if (on === listening) return;
    listening = on;
    const d = globalThis.document;
    if (on) d?.addEventListener('visibilitychange', onVis); else d?.removeEventListener('visibilitychange', onVis);
    if (on) globalThis.addEventListener?.('obsSourceVisibleChanged', onObsVisible);
    else globalThis.removeEventListener?.('obsSourceVisibleChanged', onObsVisible);
  }
  function make(factory) {
    let t;
    try { t = factory(canvasHost, { ...tableOpts, autoStart: false }); } catch (e) {
      // WebGL context creation can throw (GPU reset, context limit): log it, stay startable
      console.error('createScene: factory failed', e);
      wt = null; wanted = false; halt();
      return;
    }
    wt = t;
    let built;
    try { if (build) built = build(t); } catch (e) {
      console.error('createScene: build() failed', e);
      wt = null; wanted = false; halt();
      try { teardown(t); } catch (e2) { console.error('createScene: teardown failed', e2); }
      return;
    }
    if (built && typeof built.then === 'function') built.then(() => warm(t), () => {}); else warm(t);
    run();
  }
  // OBS keeps a hidden browser source alive (shutdown off) but never gives it a rAF frame: render ONE frame while
  // hidden so shaders, shadow maps and post passes compile now, not as seconds of black on the first show.
  function warm(t) {
    if (wt !== t || !wanted || active || !hidden()) return;
    try { t.composer.render(); } catch (e) { console.error('createScene: warm-up render failed', e); }
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
      loadTable().then((f) => {
        if (my !== gen || wt) return;
        make(f);
      }, (e) => { if (my === gen) { wanted = false; console.error('createScene: load failed', e); } });
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
      teardown(t);
      return api;
    },
  };
  return api;
}
