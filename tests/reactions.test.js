import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWith } from '../modules/reactions.js';
import { caKeepOut } from '../core/reactionlogic.js';

function fakeBus() { const h = new Map(), out = []; return { out,
  on: (t, f) => { (h.get(t) || h.set(t, new Set()).get(t)).add(f); return () => h.get(t).delete(f); },
  emit: (t, p) => { out.push([t, p]); (h.get(t) || []).forEach((f) => f(p)); } }; }
function rig(over = {}) {
  let t = 0; const frames = []; const log = []; const apis = []; const ctxs = []; const doms = [];
  const effects = Object.fromEntries(['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg'].map((k) =>
    [k, over[k] || ((api) => { apis.push(api); return { duration: 1, render: (tt) => log.push([k, +tt.toFixed(2), api.player && api.player.name, api.ctx]), dispose: () => log.push([k, 'end']) }; })]));
  const layer = { appendChild() {}, ownerDocument: null };
  const bus = fakeBus();
  const h = mountWith(layer, { bus, cfg: {}, replay: over.replay, settings: { get: () => ({ casting: { sound: false, volume: 0.5, ...(over.casting || {}) } }) } },
    { effects, raf: (f) => frames.push(f), now: () => t, makeCanvas: () => { const ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over', draws: [], fills: [], stack: [], ops: [], clearRect() { this.ops.push('clear'); },
      save() { this.stack.push([this.globalAlpha, this.globalCompositeOperation]); },
      restore() { [this.globalAlpha, this.globalCompositeOperation] = this.stack.pop() || [1, 'source-over']; },
      fillRect(x, y, w, h) { this.ops.push('fill'); this.fills.push({ x, y, w, h, op: this.globalCompositeOperation, a: this.globalAlpha }); },
      drawImage() { this.draws.push(this.globalAlpha); } }; ctxs.push(ctx); return { getContext: () => ctx, style: {} }; },
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

test('after a frame the engine erases the keep-out rect (destination-out, feathered) and restores the ctx state', () => {
  const r = rig();
  r.bus.emit('match-running', { match: { id: 'm1', myTeam: [{ name: 'A' }, { name: 'B' }], enemies: [[{ name: 'C' }, { name: 'D' }]] } });
  r.bus.emit('reaction', { fx: 'wow', player: { name: 'A', color: '#111111' }, id: 'k1' });
  r.step(16);
  const ko = caKeepOut(4), main = r.ctxs[0];
  const outs = main.fills.filter((f) => f.op === 'destination-out');
  assert.ok(outs.some((f) => f.x === ko.x && f.y === ko.y && f.w === ko.w && f.h === ko.h && f.a === 1), 'full erase of the rect');
  assert.ok(outs.some((f) => f.x === ko.x - 30 && f.w === ko.w + 60 && f.a === 0.25), 'feather ring out to 30 px');
  assert.equal(main.globalCompositeOperation, 'source-over');
  assert.equal(main.globalAlpha, 1);
});
test('a render that draws then throws leaves the canvas cleared and the loop idles', () => {
  const r = rig({ wow: (api) => ({ duration: 5, render() { api.ctx.fillRect(1, 1, 5, 5); throw new Error('bad'); }, dispose() {} }) });
  r.bus.emit('reaction', { fx: 'wow', id: 'a' });
  r.step(16);
  const ops = r.ctxs[0].ops;
  assert.equal(ops[ops.length - 1], 'clear', 'cleared after the throw');
  assert.equal(r.frames.length, 0);
});
test('an outgoing-only frame (current effect failed) still gets the keep-out erase', () => {
  const r = rig({ blunder: () => ({ duration: 5, render() { throw new Error('bad'); }, dispose() {} }) });
  r.bus.emit('reaction', { fx: 'wow', id: 'a' }); r.step(16);
  r.bus.emit('reaction', { fx: 'blunder', id: 'b' });
  r.ctxs[0].fills.length = 0;
  r.step(16);
  assert.equal(r.h.debug.activeFx(), null);
  assert.ok(r.ctxs[0].fills.some((f) => f.op === 'destination-out' && f.a === 1), 'erase ran');
  assert.equal(r.frames.length, 1);
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

test('casting-reset with a seen id is ignored (the room copy must not wipe later reactions)', () => {
  const r = rig();
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'A', color: '#111111' }, id: 'b1' });
  r.bus.emit('casting-reset', { id: 'reset-1' });
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'A', color: '#111111' }, id: 'b2' });
  r.bus.emit('casting-reset', { id: 'reset-1' });
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows[0].blunders, 1);
  r.bus.emit('casting-reset', { id: 'reset-2' });
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows.length, 0);
});
test('match-running with a test- match id changes nothing', () => {
  const r = rig();
  r.bus.emit('match-running', { match: { id: 'm1', myTeam: [{ name: 'A' }], enemies: [] } });
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'A', color: '#111111' }, id: 'b1' });
  const n = r.bus.out.length;
  r.bus.emit('match-running', { match: { id: 'test-banner-1v1', myTeam: [{ name: 'Z' }], enemies: [] } });
  assert.equal(r.bus.out.length, n + 1); // only the test event itself, no tally / casting-match
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows[0].blunders, 1);
});
test('busy() is true while a reaction plays', () => {
  const r = rig();
  assert.equal(r.h.busy(), false);
  r.bus.emit('reaction', { fx: 'wow', id: 'x1' });
  assert.equal(r.h.busy(), true);
  r.step(500); r.step(600); r.step(16);
  assert.equal(r.h.busy(), false);
});
test('every font face reactions-fx.js draws is warmed up and imported by tokens.css', async () => {
  const { readFileSync } = await import('node:fs');
  const { FONT_FACES } = await import('../modules/reactions.js');
  const src = readFileSync(new URL('../modules/reactions-fx.js', import.meta.url), 'utf8');
  const used = new Set([...src.matchAll(/(italic )?(\d{3}) \d+px \$\{(FT|FS)\}/g)].map((m) => `${m[1] ? 'italic ' : ''}${m[2]} ${m[3] === 'FT' ? 'Cinzel' : 'Cormorant Garamond'}`));
  const warmed = new Set(FONT_FACES.map((f) => f.replace(/ \d+px /, ' ').replace(/"/g, '')));
  for (const u of used) assert.ok(warmed.has(u), 'not warmed: ' + u);
  assert.equal(warmed.size, used.size);
  const css = readFileSync(new URL('../shared/tokens.css', import.meta.url), 'utf8');
  assert.match(css, /Cinzel:wght@[^&"]*900/);
  assert.match(css, /Cormorant\+Garamond:[^"]*1,600/);
  assert.match(css, /Cormorant\+Garamond:[^"]*1,700/);
});

const RM = (id, names = ['A', 'B']) => ({ id, startedAt: '2026-11-06T14:23:38', source: 'replay',
  teams: names.map((n, i) => ({ team: i + 1, players: [{ name: n, color: '#405BFF', profileId: i }] })) });
const POLL = { match: { id: 'm1', map: 'Arabia', myTeam: [{ name: 'X', colorHex: '#111111' }], enemies: [[{ name: 'Y', colorHex: '#222222' }]] } };
const castMatches = (r) => r.bus.out.filter(([t]) => t === 'casting-match').map(([, p]) => p);

test('replay-match: pinned, shown as the casting match, and wins over later poller matches', () => {
  const r = rig();
  r.bus.emit('replay-match', RM('rep1'));
  assert.deepEqual(castMatches(r).at(-1), { matchId: 'rep1', map: '', teams: RM('rep1').teams, source: 'replay', startedAt: '2026-11-06T14:23:38' });
  r.bus.emit('match-running', POLL);
  assert.equal(castMatches(r).at(-1).matchId, 'rep1');
});
test('a replay cached before mount is replayed from deps.replay; the later live copy is ignored', () => {
  const r = rig({ replay: () => RM('rep0') });
  assert.equal(castMatches(r).length, 1);
  assert.equal(castMatches(r)[0].matchId, 'rep0'); assert.equal(castMatches(r)[0].source, 'replay');
  r.bus.emit('replay-match', RM('rep0'));
  assert.equal(castMatches(r).length, 1);
});
test('the same replay twice (room + the other overlay) is shown once', () => {
  const r = rig();
  r.bus.emit('replay-match', RM('rep1')); r.bus.emit('replay-match', RM('rep1'));
  assert.equal(castMatches(r).length, 1);
});
test('auto off: replay kept but not shown, poller drives; auto back on: next poll shows the replay', () => {
  const cas = { auto: false };
  const r = rig({ casting: cas });
  r.bus.emit('replay-match', RM('rep1'));
  assert.equal(castMatches(r).length, 0);
  r.bus.emit('match-running', POLL);
  assert.equal(castMatches(r).at(-1).matchId, 'm1');
  cas.auto = true;
  r.bus.emit('match-running', POLL);
  assert.equal(castMatches(r).at(-1).matchId, 'rep1');
});
test('a new replay id resets the tally; invalid payloads are ignored', () => {
  const r = rig();
  r.bus.emit('replay-match', RM('rep1'));
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'A', color: '#405BFF' }, id: 'b1' });
  r.bus.emit('replay-match', RM('rep2', ['C', 'D']));
  const last = r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1];
  assert.deepEqual(last.rows, []);
  const n = castMatches(r).length;
  r.bus.emit('replay-match', null); r.bus.emit('replay-match', { id: 'x', teams: [] });
  assert.equal(castMatches(r).length, n);
});
