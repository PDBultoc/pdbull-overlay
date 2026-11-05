import test from 'node:test';
import assert from 'node:assert/strict';
import { bitsTier, durationOf, createQueue, toAlert, amountText } from '../core/alertlogic.js';

test('bitsTier boundaries', () => {
  const got = [49, 50, 99, 100, 999, 1000, 1500].map(bitsTier);
  assert.deepEqual(got, ['coins', 'coins', 'coins', 'pile', 'pile', 'chest', 'chest']);
});

test('durationOf per type', () => {
  assert.equal(durationOf({ type: 'follow' }), 4);
  assert.equal(durationOf({ type: 'sub' }), 6);
  assert.equal(durationOf({ type: 'bits', amount: 50 }), 5);
  assert.equal(durationOf({ type: 'bits', amount: 500 }), 6.5);
  assert.equal(durationOf({ type: 'bits', amount: 1500 }), 8);
  assert.equal(durationOf({ type: 'donation' }), 8);
  assert.equal(durationOf({ type: 'donation', message: 'x'.repeat(61) }), 10);
  assert.equal(durationOf({ type: 'donation', message: 'x'.repeat(600) }), 12);
  assert.equal(durationOf({ type: 'donation', message: 'x'.repeat(5000) }), 12);
});

test('amountText: symbol + amount, unknown currency -> code', () => {
  assert.equal(amountText(10, 'USD'), '$10');
  assert.equal(amountText(5, 'EUR'), '€5');
  assert.equal(amountText(7, 'GBP'), '£7');
  assert.equal(amountText(10, 'XYZ'), 'XYZ 10');
  assert.equal(amountText('12.50', 'usd'), '$12.50');
  assert.equal(amountText(3, undefined), '$3');
});

test('toAlert maps bus payload to trigger fields (R3)', () => {
  const f = toAlert({ type: 'follow', id: 'f1', name: 'Ann' });
  assert.equal(f.type, 'follow'); assert.equal(f.name, 'Ann'); assert.equal(f.id, 'f1');
  const s = toAlert({ type: 'sub', id: 's1', name: 'Bo', tier: 'Prime', months: 3 });
  assert.equal(s.tier, 'prime'); assert.equal(s.months, 3); assert.equal(s.gift, 0);
  assert.equal(toAlert({ type: 'sub', name: 'Bo', tier: '2000' }).tier, '2');
  assert.equal(toAlert({ type: 'sub', name: 'Bo', tier: 3 }).tier, '3');
  assert.equal(toAlert({ type: 'sub', name: 'Bo' }).tier, '1');
  assert.equal(toAlert({ type: 'sub', name: 'Bo', gift: 5 }).gift, 5);
  const b = toAlert({ type: 'bits', name: 'Cy', amount: '500' });
  assert.equal(b.amount, 500);
  const d = toAlert({ type: 'donation', name: 'Di', amount: 10, currency: 'EUR', message: 'hi' });
  assert.equal(d.amountText, '€10'); assert.equal(d.msg, 'hi'); assert.equal(d.message, 'hi');
  assert.equal(toAlert({ type: 'donation', name: '', amount: 1 }).name, 'Anonymous');
  assert.equal(toAlert({ type: 'nope', name: 'x' }), null);
  assert.equal(toAlert(null), null);
  // names over 25 chars are cut (twitch limit), control chars removed
  assert.equal(toAlert({ type: 'follow', name: 'a'.repeat(40) }).name.length, 25);
});

test('toAlert caps a runaway message at 800 chars', () => {
  const d = toAlert({ type: 'donation', name: 'Di', amount: 1, message: 'y'.repeat(5000) });
  assert.equal(d.msg.length, 800);
  assert.ok(d.msg.endsWith('…'));
  assert.equal(toAlert({ type: 'donation', name: 'Di', amount: 1, message: 'z'.repeat(600) }).msg.length, 600);
});

function deferred() { let res; const p = new Promise((r) => { res = r; }); return { p, res }; }

test('queue: FIFO, one at a time, dedup by id', async () => {
  const order = []; let active = 0, maxActive = 0; const gates = [];
  const q = createQueue({ play: (a) => { order.push(a.id); active++; maxActive = Math.max(maxActive, active); const d = deferred(); gates.push(d); return d.p.then(() => { active--; }); } });
  assert.equal(q.push({ id: 'a' }), true);
  assert.equal(q.push({ id: 'b' }), true);
  assert.equal(q.push({ id: 'a' }), false);   // repeated id dropped (even while playing)
  assert.equal(q.push({ id: 'c' }), true);
  assert.deepEqual(order, ['a']);
  gates[0].res(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, ['a', 'b']);
  gates[1].res(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, ['a', 'b', 'c']);
  gates[2].res(); await new Promise((r) => setImmediate(r));
  assert.equal(maxActive, 1);
  assert.equal(q.push({ id: 'b' }), false);   // still remembered after playing
  assert.equal(q.busy, false);
  assert.equal(q.size, 0);
});

test('queue: a failing play does not stall; onIdle fires when empty', async () => {
  const order = []; let idle = 0;
  const q = createQueue({ play: (a) => { order.push(a.id); return a.id === 'x' ? Promise.reject(new Error('boom')) : Promise.resolve(); }, onIdle: () => idle++ });
  q.push({ id: 'x' }); q.push({ id: 'y' });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(order, ['x', 'y']);
  assert.equal(idle, 1);
});

test('queue: remembers only the last 200 ids; id-less alerts always play', async () => {
  const q = createQueue({ play: () => Promise.resolve() });
  for (let i = 0; i < 205; i++) q.push({ id: 'i' + i });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(q.push({ id: 'i0' }), true);     // evicted
  assert.equal(q.push({ id: 'i204' }), false);  // recent
  assert.equal(q.push({ name: 'noid' }), true);
  assert.equal(q.push({ name: 'noid' }), true);
});
