// Final whole-branch review fix wave (C1, I1-I4, M10). Node only: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRemote } from '../core/remote.js';
import { createBus } from '../core/bus.js';
import { normalizeMatch } from '../core/aoe2.js';
import { createSender, testEvent } from '../core/panelcore.js';
import { shouldPlay, createEventDedup } from '../core/intrologic.js';
import { createQueue } from '../core/alertlogic.js';
import { mapEvent } from '../core/streamlabs.js';
import { createScene } from '../core/scene.js';

const PA = JSON.parse(readFileSync(new URL('./fixtures/pa100.json', import.meta.url)));
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const tick = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------- C1: remote status + backoff
function clock() { const c = { t: 1000, now: () => c.t }; return c; }
class FakeES { constructor() { FakeES.last = this; } close() {} }

test('C1 publishEvent: HTTP 429 reports room status and backs off (no retry storm)', async () => {
  const posts = [], st = []; const c = clock();
  const fetchFn = async (url, opt) => { posts.push(opt.body); return { ok: false, status: 429, headers: { get: () => null } }; };
  const r = createRemote({ room: 'r9', fetchFn, ES: FakeES, onSettings() {}, onStatus: (s) => st.push(s), now: c.now });
  await r.publishEvent('follow', { id: 'a' });
  assert.deepEqual(st.at(-1), { source: 'room', ok: false, reason: 'http 429' });
  await r.publishEvent('follow', { id: 'b' });
  await r.publishEvent('follow', { id: 'c' });
  assert.equal(posts.length, 1);
  c.t += 120000;
  await r.publishEvent('follow', { id: 'd' });
  assert.equal(posts.length, 2);
});

test('C1 publish (settings): HTTP error reports room status and backs off', async () => {
  const posts = [], st = []; const c = clock(); const timers = [];
  const fetchFn = async (url, opt) => { posts.push(opt.body); return { ok: false, status: 429, headers: { get: () => null } }; };
  const r = createRemote({ room: 'r10', fetchFn, ES: FakeES, onSettings() {}, onStatus: (s) => st.push(s), now: c.now,
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {} });
  r.publish({ _rev: 1 }); await timers.at(-1)();
  assert.deepEqual(st.at(-1), { source: 'room', ok: false, reason: 'http 429' });
  r.publish({ _rev: 2 }); await timers.at(-1)();
  assert.equal(posts.length, 1);
});

test('C1 publishEvent: ok responses keep flowing', async () => {
  const st = []; let n = 0;
  const r = createRemote({ room: 'r11', fetchFn: async () => { n++; return { ok: true, status: 200 }; }, ES: FakeES, onSettings() {}, onStatus: (s) => st.push(s) });
  await r.publishEvent('follow', { id: 'a' }); await r.publishEvent('follow', { id: 'b' });
  assert.equal(n, 2);
  assert.ok(st.every((s) => s.ok));
});

// ---------------------------------------------------------------- C1: local bus first
test('C1 a dock event reaches the local bus first, even when the room is down', async () => {
  const bus = createBus({ BC: null, win: {} });
  const got = [];
  bus.on('follow', (p) => got.push(p.id));
  const posts = [];
  const remote = createRemote({ room: 'r', fetchFn: async (u, o) => { posts.push(o.body); throw new Error('offline'); }, ES: null, onSettings() {} });
  const send = createSender({ bus, remote });
  await send('follow', { type: 'follow', id: 'x1', name: 'A' });
  assert.deepEqual(got, ['x1']);
  assert.equal(posts.length, 1); // and the room got it as backup
});

test('C1 latest-snapshot frames never go to the room', async () => {
  const bus = createBus({ BC: null, win: {} });
  const ev = []; bus.on('latest-snapshot', (p) => ev.push(p));
  const sent = [];
  const send = createSender({ bus, remote: { publishEvent: async (n) => { sent.push(n); } } });
  await send('latest-snapshot', { type: 'latest-snapshot', latest: {} });
  await send('sub', { type: 'sub', id: 's' });
  assert.deepEqual(sent, ['sub']);
  assert.equal(ev.length, 1);
});

// ---------------------------------------------------------------- I2: intro test ids
test('I2 intro tests get a fresh test-<timestamp> id every click and never poison storage', () => {
  const a = testEvent('intro1v1', 111, { match1v1: normalizeMatch(PA[0], 551021) });
  const b = testEvent('intro1v1', 222, { match1v1: normalizeMatch(PA[0], 551021) });
  assert.equal(a.payload.match.id, 'test-1v1-111');
  assert.equal(b.payload.match.id, 'test-1v1-222');
  assert.equal(testEvent('intro4v4', 333).payload.match.id, 'test-4v4-333');
  assert.equal(a.payload.id, 'test-intro1v1-111'); // event id, receivers dedup on it
  assert.notEqual(a.payload.id, b.payload.id);
  const st = mem();
  assert.equal(shouldPlay(st, a.payload.match), true);
  assert.equal(st.getItem('pdbull-intro-played'), null);
  assert.equal(shouldPlay(st, b.payload.match), true);
  // a real match id is untouched
  const real = normalizeMatch(PA[0], 551021);
  assert.equal(testEvent('intro1v1', 5, { match1v1: real }).payload.match.me.name, 'PDBull');
});

// ---------------------------------------------------------------- I1: duplicate intro events
test('I1 createEventDedup: same event id twice is a duplicate; no id never is; capped', () => {
  const d = createEventDedup(3);
  assert.equal(d('test-intro4v4-1'), false);
  assert.equal(d('test-intro4v4-1'), true);
  assert.equal(d(undefined), false);
  assert.equal(d(undefined), false);
  d('a'); d('b'); d('c');
  assert.equal(d('test-intro4v4-1'), false);
});

test('I1 starting.js and brb.js consume no room events (no re-emit onto the local bus)', () => {
  for (const f of ['../scenes/starting.js', '../scenes/brb.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/onEvent:\s*\(type, payload\)\s*=>\s*bus\.emit/.test(src), f);
  }
});

test('C1 overlay.html: no settings re-publish, no status relay, no room event onto status of the dock', () => {
  const src = readFileSync(new URL('../overlay.html', import.meta.url), 'utf8');
  assert.ok(!/remote\.publish\(/.test(src));
  assert.ok(!/publishEvent\('status'/.test(src));
});

// ---------------------------------------------------------------- I3: alert queue safety
function fakeTimers() {
  const list = []; let id = 0;
  return {
    set: (fn, ms) => { list.push({ id: ++id, fn, ms }); return id; },
    clear: (i) => { const k = list.findIndex((x) => x.id === i); if (k >= 0) list.splice(k, 1); },
    list,
  };
}

test('I3 an alert that never finishes is ended after durationOf + 4 s and the next one plays', async () => {
  const tm = fakeTimers(); const order = [], timedOut = [];
  const q = createQueue({
    play: (a) => { order.push(a.id); return new Promise(() => {}); },
    onTimeout: (a) => timedOut.push(a.id), setTimer: tm.set, clearTimer: tm.clear,
  });
  q.push({ id: 'f1', type: 'follow' });
  q.push({ id: 'f2', type: 'follow' });
  await tick();
  assert.deepEqual(order, ['f1']);
  assert.equal(tm.list.length, 1);
  assert.equal(tm.list[0].ms, (4 + 4) * 1000);
  tm.list[0].fn(); await tick();
  assert.deepEqual(timedOut, ['f1']);
  assert.deepEqual(order, ['f1', 'f2']);
  assert.equal(tm.list.at(-1).ms, 8000);
});

test('I3 a normal alert clears its timer', async () => {
  const tm = fakeTimers();
  const q = createQueue({ play: async () => {}, setTimer: tm.set, clearTimer: tm.clear });
  q.push({ id: 's', type: 'sub' }); await tick(); await tick();
  assert.equal(tm.list.length, 0);
  assert.equal(q.busy, false);
});

test('I3 while the document is hidden alerts are dropped, never stalled', async () => {
  let hidden = true; const order = [];
  const q = createQueue({ play: async (a) => { order.push(a.id); }, isHidden: () => hidden });
  q.push({ id: 'h1', type: 'follow' }); q.push({ id: 'h2', type: 'follow' }); await tick(); await tick();
  assert.deepEqual(order, []);
  assert.equal(q.busy, false);
  hidden = false;
  q.push({ id: 'h3', type: 'follow' }); await tick(); await tick();
  assert.deepEqual(order, ['h3']);
});

// ---------------------------------------------------------------- I4 (UNVERIFIED fields)
test('I4 sub tier from sub_plan; unknown plan keeps the old shape', () => {
  const t = (plan) => mapEvent({ type: 'subscription', message: [{ _id: 'x', name: 'A', months: 1, sub_plan: plan }] })[0].tier;
  assert.equal(t('1000'), '1'); assert.equal(t('2000'), '2'); assert.equal(t('3000'), '3'); assert.equal(t('Prime'), 'Prime');
  assert.equal(t('weird'), undefined);
  assert.equal('tier' in mapEvent({ type: 'subscription', message: [{ _id: 'x', name: 'A' }] })[0], false);
});

test('I4 subgift: gifter becomes the name, gift count 1, recipient kept', () => {
  const [e] = mapEvent({ type: 'subscription', message: [{ _id: 'g', name: 'Recv', gifter: 'Santa', sub_type: 'subgift', sub_plan: '1000', months: 1 }] });
  assert.equal(e.gift, 1); assert.equal(e.name, 'Santa'); assert.equal(e.recipient, 'Recv'); assert.equal(e.tier, '1');
  const [n] = mapEvent({ type: 'subscription', message: [{ _id: 'n', name: 'Plain', sub_type: 'sub' }] });
  assert.equal('gift' in n, false);
});

// ---------------------------------------------------------------- M10
test('M10 a throwing factory is caught and the scene stays startable', () => {
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.performance = { now: () => 0 };
  let n = 0;
  const sc = createScene({ canvasHost: {}, createTable: () => { n++; throw new Error('webgl context lost'); } });
  const err = console.error; console.error = () => {};
  try {
    assert.doesNotThrow(() => sc.start());
    assert.equal(sc.wt, null);
    assert.equal(sc.running, false);
    assert.doesNotThrow(() => sc.start());
    assert.equal(n, 2);
  } finally { console.error = err; }
});
