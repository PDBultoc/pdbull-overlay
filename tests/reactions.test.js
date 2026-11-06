import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWith } from '../modules/reactions.js';

function fakeBus() { const h = new Map(), out = []; return { out,
  on: (t, f) => { (h.get(t) || h.set(t, new Set()).get(t)).add(f); return () => h.get(t).delete(f); },
  emit: (t, p) => { out.push([t, p]); (h.get(t) || []).forEach((f) => f(p)); } }; }
function rig(over = {}) {
  let t = 0; const frames = []; const log = []; const apis = []; const ctxs = []; const doms = [];
  const effects = Object.fromEntries(['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg'].map((k) =>
    [k, over[k] || ((api) => { apis.push(api); return { duration: 1, render: (tt) => log.push([k, +tt.toFixed(2), api.player && api.player.name, api.ctx]), dispose: () => log.push([k, 'end']) }; })]));
  const layer = { appendChild() {}, ownerDocument: null };
  const bus = fakeBus();
  const h = mountWith(layer, { bus, cfg: {}, settings: { get: () => ({ casting: { sound: false, volume: 0.5 } }) } },
    { effects, raf: (f) => frames.push(f), now: () => t, makeCanvas: () => { const ctx = { globalAlpha: 1, draws: [], clearRect() {}, save() {}, restore() {}, drawImage() { this.draws.push(this.globalAlpha); } }; ctxs.push(ctx); return { getContext: () => ctx, style: {} }; },
      makeDom: () => { const d = { removed: false, remove() { d.removed = true; }, style: {} }; doms.push(d); return d; }, audio: () => (over.audio ? over.audio() : null) });
  const step = (ms) => { t += ms; const f = frames.splice(0); f.forEach((fn) => fn()); };
  return { h, bus, log, step, frames, apis, ctxs, doms };
}
test('a reaction plays for its duration, then the loop stops (idle = no frames)', () => {
  const r = rig();
  r.bus.emit('reaction', { fx: 'wow', player: { name: 'A', color: '#111111' }, id: 'x1' });
  r.step(500); r.step(400); r.step(200);
  assert.ok(r.log.some((l) => l[0] === 'wow' && l[2] === 'A'));
  assert.ok(r.log.some((l) => l[0] === 'wow' && l[1] === 'end'));
  r.step(16); assert.equal(r.frames.length, 0);
});
test('duplicate ids are ignored, GG is not replaced by other reactions', () => {
  const r = rig();
  r.bus.emit('reaction', { fx: 'gg', id: 'g' }); r.bus.emit('reaction', { fx: 'gg', id: 'g' });
  r.step(16);
  r.bus.emit('reaction', { fx: 'wow', id: 'w' }); r.step(16);
  assert.equal(r.h.debug.activeFx(), 'gg');
});
test('tally: counted per player, reset on a new match id, published on the bus', () => {
  const r = rig();
  r.bus.emit('match-running', { match: { id: 'm1', map: 'Arabia', myTeam: [{ name: 'A', colorHex: '#111111' }], enemies: [[{ name: 'B', colorHex: '#222222' }]] } });
  assert.ok(r.bus.out.some(([t, p]) => t === 'casting-match' && p.matchId === 'm1' && p.teams.length === 2));
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'A', color: '#111111' }, id: 'b1' });
  const last = r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1];
  assert.equal(last.rows[0].blunders, 1);
  r.bus.emit('match-running', { match: { id: 'm2', myTeam: [], enemies: [] } });
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows.length, 0);
  r.bus.emit('casting-reset', {});
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows.length, 0);
});
test('null player gets a neutral one; api carries awards (latest wins ties) and keepOut by player count', () => {
  const r = rig();
  r.bus.emit('match-running', { match: { id: 'm1', myTeam: [{ name: 'A' }, { name: 'B' }], enemies: [[{ name: 'C' }, { name: 'D' }]] } });
  r.bus.emit('reaction', { fx: 'wow', player: { name: 'A', color: '#111111' }, id: 'w1' });
  r.step(1100);
  r.bus.emit('reaction', { fx: 'wow', player: { name: 'B', color: '#222222' }, id: 'w2' });
  r.step(1100);
  r.bus.emit('reaction', { fx: 'gg', id: 'g1' });
  const api = r.apis[r.apis.length - 1];
  assert.equal(api.player.name, '');
  assert.equal(api.player.color, '#d6c6a6');
  assert.equal(api.awards.play.name, 'B');
  assert.equal(api.awards.blunder, null);
  assert.equal(api.keepOut.x, 1640 - 20); // 4 players
  assert.ok(Array.isArray(api.tally));
});

test('a replaced effect keeps rendering (offscreen, faded) for <=150 ms, then is disposed', () => {
  const r = rig();
  r.bus.emit('reaction', { fx: 'wow', player: { name: 'A', color: '#111111' }, id: 'a' });
  r.step(100);
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'B', color: '#222222' }, id: 'b' });
  r.step(100); // outgoing k = 0.67
  const wowRenders = r.log.filter((l) => l[0] === 'wow' && l[1] !== 'end');
  assert.equal(wowRenders.length, 2);
  assert.equal(wowRenders[1][3], r.ctxs[1], 'outgoing draws into the offscreen ctx');
  assert.ok(r.ctxs[0].draws.length >= 1 && r.ctxs[0].draws[0] < 1, 'faded drawImage on the main ctx');
  assert.ok(!r.log.some((l) => l[0] === 'wow' && l[1] === 'end'));
  r.step(100); // k > 1
  assert.ok(r.log.some((l) => l[0] === 'wow' && l[1] === 'end'));
  assert.equal(r.h.debug.activeFx(), 'blunder');
});
test('a replaced effect has its sound ramped to 0 over 0.15 s', () => {
  const ramps = [];
  const master = { gain: { setValueAtTime: () => {}, linearRampToValueAtTime: (v, at) => ramps.push([v, at]) } };
  const mk = (api) => { api._master = master; return { duration: 1, render() {}, dispose() {} }; };
  const r = rig({ wow: mk, blunder: mk, audio: () => ({ currentTime: 2 }) });
  r.bus.emit('reaction', { fx: 'wow', id: 'a' }); r.step(50);
  r.bus.emit('reaction', { fx: 'blunder', id: 'b' });
  assert.equal(ramps.length, 1);
  assert.equal(ramps[0][0], 0);
  assert.ok(Math.abs(ramps[0][1] - 2.15) < 1e-9);
});
test('a throwing factory leaks nothing and keeps the current effect; a throwing render ends only that effect', () => {
  const r = rig({ funny: () => { throw new Error('boom'); }, wololo: () => ({ duration: 5, render() { throw new Error('bad'); }, dispose() {} }) });
  r.bus.emit('reaction', { fx: 'wow', id: 'a' });
  const before = r.doms.length;
  r.bus.emit('reaction', { fx: 'funny', id: 'f' });
  assert.equal(r.h.debug.activeFx(), 'wow');
  assert.ok(r.doms[before].removed, 'dom of the failed factory removed');
  r.bus.emit('reaction', { fx: 'wololo', id: 'w' });
  r.step(16); // wololo render throws -> ended; wow (outgoing) keeps going
  assert.equal(r.h.debug.activeFx(), null);
  assert.ok(r.frames.length === 1, 'loop alive for the outgoing effect');
  r.step(16); r.step(300);
  assert.ok(r.log.some((l) => l[0] === 'wow' && l[1] === 'end'));
  assert.equal(r.frames.length, 0);
});
