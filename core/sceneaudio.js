// Glue between a full-screen scene and the generated ambience (core/ambience.js).
// on  <=> settings.ambience.enabled && document is visible
// master = PRESETS[preset].master * settings.ambience.volume
// A context left 'suspended' by CEF autoplay policy is resumed on the next settings message and on visible.
import { createAmbience, PRESETS } from './ambience.js';

const DEFAULT = { enabled: true, volume: 0.6 };

function read(s) {
  const raw = s && typeof s.get === 'function' ? s.get() : s;
  const a = raw && typeof raw === 'object' && raw.ambience && typeof raw.ambience === 'object' ? raw.ambience : {};
  const v = Number(a.volume);
  return {
    enabled: a.enabled === undefined || a.enabled === null ? DEFAULT.enabled : !!a.enabled,
    volume: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT.volume,
  };
}

export function createSceneAudio({ preset, settings = null, AudioCtx = globalThis.AudioContext, doc = globalThis.document } = {}) {
  const p = PRESETS[preset] || PRESETS.starting;
  let cfg = read(settings);
  let ac = null;
  let amb = null;
  let running = false;
  let disposed = false;

  const master = () => p.master * cfg.volume;

  function ensure() {
    if (amb) return true;
    if (typeof AudioCtx !== 'function') return false;
    try {
      ac = new AudioCtx();
      amb = createAmbience(ac, { layers: p.layers, master: master() });
      amb.output.connect(ac.destination);
      return true;
    } catch (e) {
      ac = null; amb = null;
      return false;
    }
  }

  function resumeIfSuspended() {
    if (ac && ac.state === 'suspended' && typeof ac.resume === 'function') {
      try { const r = ac.resume(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { /* ignore */ }
    }
  }

  function evaluate() {
    if (disposed) return;
    const hidden = !!(doc && doc.hidden);
    const should = cfg.enabled && !hidden;
    if (should && !running) {
      if (!ensure()) return;
      amb.setMaster(master());
      amb.start();
      running = true;
    } else if (!should && running) {
      amb.stop(800);
      running = false;
    }
    if (running) resumeIfSuspended();
  }

  const onVis = () => evaluate();
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVis);

  function apply(s) {
    cfg = read(s);
    if (amb) amb.setMaster(master());
    evaluate();
    resumeIfSuspended();
  }

  function dispose() {
    if (disposed) return;
    if (running) { amb.stop(800); running = false; }
    disposed = true;
    if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVis);
    const c = ac; ac = null; amb = null;
    if (c && typeof c.close === 'function') { // dispose = page unload: no fade to wait for
      try { const r = c.close(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
    }
  }

  evaluate();
  return { apply, dispose };
}
