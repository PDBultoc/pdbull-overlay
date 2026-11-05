import test from 'node:test';
import assert from 'node:assert/strict';
import { createRawLog } from '../core/panelcore.js';
import { connectStreamlabs } from '../core/streamlabs.js';

test('rawlog keeps raw copies with timestamps, caps at max, clears', () => {
  const log = createRawLog(3);
  const raw = { type: 'donation', message: [{ name: 'a' }] };
  log.push(raw);
  raw.type = 'changed';
  assert.equal(log.list()[0].raw.type, 'donation');
  assert.equal(typeof log.list()[0].t, 'number');
  for (let i = 0; i < 5; i++) log.push({ i });
  assert.equal(log.list().length, 3);
  assert.equal(log.list()[2].raw.i, 4);
  log.clear();
  assert.equal(log.list().length, 0);
});

test('rawlog drops token keys at any depth', () => {
  const log = createRawLog();
  log.push({ type: 'x', token: 't1', streamlabsToken: 't2', message: [{ token: 't3', name: 'n' }] });
  const s = JSON.stringify(log.list());
  assert.ok(!/token/i.test(s.replace(/"type"/g, '')));
  assert.equal(log.list()[0].raw.message[0].name, 'n');
});

test('rawlog default max is 50; non-serialisable input is ignored', () => {
  const log = createRawLog();
  for (let i = 0; i < 60; i++) log.push({ i });
  assert.equal(log.list().length, 50);
  const c = {}; c.self = c;
  log.push(c);
  assert.equal(log.list().length, 50);
});

test('connectStreamlabs calls onRaw with the raw message before mapping', () => {
  const handlers = {};
  const io = () => ({ on: (k, f) => { handlers[k] = f; }, close() {} });
  const raws = [], evs = [];
  connectStreamlabs({ token: 'T', io, onRaw: (r) => raws.push(r), onEvent: (e) => evs.push(e) });
  const raw = { type: 'follow', message: [{ _id: 'f', name: 'Bob' }] };
  handlers.event(raw);
  assert.equal(raws[0], raw);
  assert.equal(evs.length, 1);
});
