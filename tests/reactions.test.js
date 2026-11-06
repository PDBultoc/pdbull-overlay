import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWith } from '../modules/reactions.js';

function fakeBus() { const h = new Map(), out = []; return { out,
  on: (t, f) => { (h.get(t) || h.set(t, new Set()).get(t)).add(f); return () => h.get(t).delete(f); },
  emit: (t, p) => { out.push([t, p]); (h.get(t) || []).forEach((f) => f(p)); } }; }
function rig() {
  let t = 0; const frames = []; const log = []; const apis = [];
  const effects = Object.fromEntries(['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg'].map((k) =>
    [k, (api) => { apis.push(api); return { duration: 1, render: (tt) => log.push([k, +tt.toFixed(2), api.player && api.player.name]), dispose: () => log.push([k, 'end']) }; }]));
  const ctx = { clearRect() {}, save() {}, restore() {} };
  const layer = { appendChild() {}, ownerDocument: null };
  const bus = fakeBus();
  const h = mountWith(layer, { bus, cfg: {}, settings: { get: () => ({ casting: { sound: false, volume: 0.5 } }) } },
    { effects, raf: (f) => frames.push(f), now: () => t, makeCanvas: () => ({ getContext: () => ctx, style: {} }), makeDom: () => ({ remove() {}, style: {} }), audio: () => null });
  const step = (ms) => { t += ms; const f = frames.splice(0); f.forEach((fn) => fn()); };
  return { h, bus, log, step, frames, apis };
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
