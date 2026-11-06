/* Reactions module (casting scene): plays the D · Chronicle reactions fired from the dock.
   No frames while idle; one effect at a time (replace rule in core/reactionlogic.js).
   mount(layer, { bus, settings }) -> { unmount(), debug } */
import { makeReaction, replaces, createTally, playersFromMatch, seeded, ease, PLAY, DURATION, caKeepOut } from '../core/reactionlogic.js';
import { EFFECTS, punch } from './reactions-fx.js';
const W = 1920, H = 1080, FADE = 0.15;
const NEUTRAL = { name: '', color: '#d6c6a6' };

export function mountWith(layer, { bus, settings }, opts = {}) {
  const effects = opts.effects || EFFECTS;
  const raf = opts.raf || ((f) => requestAnimationFrame(f));
  const now = opts.now || (() => performance.now());
  const doc = layer.ownerDocument || globalThis.document;
  const canvas = opts.makeCanvas ? opts.makeCanvas() : Object.assign(doc.createElement('canvas'), { width: W, height: H });
  canvas.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none`;
  layer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let off = null; // offscreen canvas for the outgoing effect, created lazily once
  const offCtx = () => {
    if (!off) { off = opts.makeCanvas ? opts.makeCanvas() : Object.assign(doc.createElement('canvas'), { width: W, height: H }); off.ctx = off.getContext('2d'); }
    return off.ctx;
  };
  const makeDom = opts.makeDom || (() => { const d = doc.createElement('div'); d.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; layer.appendChild(d); return d; });
  const cset = () => (settings && settings.get && settings.get().casting) || {};
  let AC = null;
  const audio = opts.audio || (() => {
    if (!cset().sound) return null;
    try { AC = AC || new AudioContext(); if (AC.state === 'suspended') AC.resume(); } catch { return null; }
    return AC;
  });
  const tally = createTally();
  const seen = new Set();
  const seenReset = new Set();
  let cur = null, outgoing = null, looping = false, dead = false, players = 2;
  let pinned = null; // the replay-detected match (watcher or dock "Load replay…"); shown while casting.auto is on
  const auto = () => cset().auto !== false;
  function showPinned() {
    players = pinned.teams.reduce((a, t) => a + ((t && t.players) || []).length, 0) || 2;
    tally.forMatch(pinned.id); publishTally();
    bus.emit('casting-match', { matchId: pinned.id, map: '', teams: pinned.teams, source: 'replay', startedAt: pinned.startedAt || null });
  }

  const publishTally = () => bus.emit('casting-tally', { rows: tally.rows(), awards: tally.awards() });
  function start(r) {
    const dom = makeDom();
    let api;
    try {
    const a = audio();
    api = { ctx, dom, W, H, player: r.player || NEUTRAL, x: r.x, y: r.y, rand: seeded(hash(r.id)), audio: a,
      tally: tally.rows(), awards: tally.awards(), keepOut: caKeepOut(players),
      ease, PLAY, volume: cset().volume ?? 0.7 };
    return { r, inst: effects[r.fx](api), dom, api, t0: now() };
    } catch { try { dom.remove && dom.remove(); } catch {} return null; }
  }
  function cut(e) { // an effect becomes outgoing: draw it on the offscreen canvas, fade its sound
    e.api.ctx = offCtx(); e.cut = now();
    try {
      const m = e.api._master, ac = e.api.audio;
      if (m && ac) { m.gain.setValueAtTime(m.gain.value, ac.currentTime); m.gain.linearRampToValueAtTime(0, ac.currentTime + FADE); }
    } catch {}
  }
  function draw(e, t, c) { try { c.save(); e.inst.render(t); c.restore(); return true; } catch { try { c.restore(); } catch {} return false; } }
  function end(e) { if (!e) return; try { e.inst.dispose && e.inst.dispose(); } catch {} e.dom.remove && e.dom.remove(); }
  function frame() {
    looping = false; if (dead) return;
    ctx.clearRect(0, 0, W, H);
    const tNow = now();
    let ok = 0; // alpha of the outgoing composite, 0 = none drawn
    const comp = () => { ctx.save(); ctx.globalAlpha = ok; ctx.drawImage(off, 0, 0); ctx.restore(); };
    if (outgoing) {
      const k = (tNow - outgoing.cut) / 1000 / FADE;
      if (k >= 1) { end(outgoing); outgoing = null; }
      else {
        const oc = outgoing.api.ctx; oc.clearRect(0, 0, W, H);
        if (!draw(outgoing, (tNow - outgoing.t0) / 1000, oc)) { end(outgoing); outgoing = null; }
        else { ok = 1 - k; comp(); }
      }
    }
    if (cur) {
      const t = (tNow - cur.t0) / 1000;
      if (t > cur.inst.duration) { end(cur); cur = null; }
      else if (!draw(cur, t, ctx)) { // partial pixels of a failed render must not stay on the canvas
        end(cur); cur = null; ctx.clearRect(0, 0, W, H); if (ok) comp();
      }
    }
    if (cur || outgoing) { try { punch(ctx, caKeepOut(players), 0, 0); } catch {} } // never cover the CaptureAge score rows
    if (cur || outgoing) { looping = true; raf(frame); }
  }
  const kick = () => { if (!looping) { looping = true; raf(frame); } };

  function fire(o) {
    const r = makeReaction(o);
    if (!r || seen.has(r.id)) return;
    seen.add(r.id); if (seen.size > 200) seen.delete(seen.values().next().value);
    if (cur && !replaces(cur.r, r)) return;
    if (r.fx !== 'gg') { tally.record(r.fx, r.player); publishTally(); }
    const next = start(r); if (!next) return; // a failing factory leaves the current effect alone
    if (cur) { end(outgoing); outgoing = cur; cut(outgoing); }
    cur = next; kick();
  }
  const offs = [
    bus.on('reaction', fire),
    bus.on('match-running', (p) => {
      const m = p && p.match; if (!m) return;
      if (typeof m.id === 'string' && m.id.startsWith('test-')) return; // the dock's banner test buttons
      if (pinned && auto()) { showPinned(); return; } // the replay names the cast game; the poller follows someone else
      const n = (m.myTeam || []).length + (m.enemies || []).reduce((a, t) => a + t.length, 0);
      players = n || 2;
      tally.forMatch(m.id); publishTally();
      bus.emit('casting-match', { matchId: m.id, map: m.map || '', teams: playersFromMatch(m) });
    }),
    bus.on('replay-match', (p) => {
      if (!p || !p.id || !Array.isArray(p.teams) || !p.teams.length) return;
      if (pinned && pinned.id === p.id) return; // arrives from the room, from the other overlay, and from the cache
      pinned = p;
      if (auto()) showPinned();
    }),
    bus.on('casting-reset', (p) => { // arrives locally and again via the room: the second copy must not wipe later reactions
      const id = p && p.id;
      if (id != null) { if (seenReset.has(id)) return; seenReset.add(id); if (seenReset.size > 50) seenReset.delete(seenReset.values().next().value); }
      tally.reset(); publishTally();
    }),
  ];
  return {
    unmount() { dead = true; offs.forEach((f) => f && f()); end(cur); end(outgoing); canvas.remove && canvas.remove(); if (AC) AC.close().catch(() => {}); },
    busy: () => !!(cur || outgoing),
    debug: { fire, activeFx: () => (cur ? cur.r.fx : null), tally },
  };
}
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
// every face reactions-fx.js draws on canvas (weight/style/family); kept in step with it by a test
export const FONT_FACES = [
  '600 64px Cinzel', '900 64px Cinzel',
  'italic 600 64px "Cormorant Garamond"', 'italic 700 64px "Cormorant Garamond"',
];
function ensureCss(layer) {
  const doc = layer.ownerDocument || globalThis.document;
  if (!doc || !doc.head || doc.getElementById('reactions-css')) return;
  const l = doc.createElement('link');
  l.id = 'reactions-css'; l.rel = 'stylesheet'; l.href = new URL('./reactions.css', import.meta.url).href;
  doc.head.appendChild(l);
}
export function mount(layer, deps) {
  // the effects draw canvas text in these faces; warm them up once (fire-and-forget)
  ensureCss(layer);
  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
      for (const f of FONT_FACES) document.fonts.load(f).catch(() => {});
    }
  } catch {}
  return mountWith(layer, deps);
}
