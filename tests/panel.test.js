import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSettings } from '../core/settings.js';
import { stripSecrets } from '../core/remote.js';
import { normalizeMatch } from '../core/aoe2.js';
import { countdownEnd, roomLinks, testEvent, TEST_ALERTS, fakeMatch4v4, latestUpdate, MAX_NAME } from '../core/panelcore.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const PA = JSON.parse(readFileSync(new URL('./fixtures/pa100.json', import.meta.url)));

test('Streamlabs token never survives stripSecrets', () => {
  const s = createSettings(mem(), 't');
  s.set('modules.alerts.streamlabsToken', 'SECRET-TOKEN-123');
  assert.equal(s.get().modules.alerts.streamlabsToken, 'SECRET-TOKEN-123');
  assert.ok(!JSON.stringify(stripSecrets(s.get())).includes('SECRET-TOKEN-123'));
});

test('countdown end = now + minutes', () => {
  assert.equal(countdownEnd(5, 1000), 1000 + 300000);
  assert.equal(countdownEnd(0.5, 0), 30000);
  assert.equal(countdownEnd('abc', 1000), null);
  assert.equal(countdownEnd(-3, 1000), null);
});

test('room links are relative to the panel url', () => {
  const l = roomLinks('abc123', 'https://x.github.io/pdbull-overlay/panel.html');
  assert.equal(l.overlay, 'https://x.github.io/pdbull-overlay/overlay.html?room=abc123');
  assert.equal(l.starting, 'https://x.github.io/pdbull-overlay/scenes/starting.html?room=abc123');
  assert.equal(l.brb, 'https://x.github.io/pdbull-overlay/scenes/brb.html?room=abc123');
});

test('test buttons emit the documented alert payloads', () => {
  assert.deepEqual(TEST_ALERTS.map((t) => t.key), ['follow', 'sub', 'gift5', 'bits50', 'bits500', 'bits1500', 'donShort', 'donLong', 'longName']);
  const ev = (k) => testEvent(k, 42);
  assert.deepEqual(ev('follow'), { name: 'follow', payload: { type: 'follow', id: 'test-follow-42', name: 'PDBull_Fan' } });
  const sub = ev('sub').payload;
  assert.equal(sub.type, 'sub'); assert.equal(sub.gift, false); assert.ok(sub.months >= 1); assert.ok(sub.tier);
  const gift = ev('gift5').payload;
  assert.equal(gift.type, 'sub'); assert.equal(gift.gift, true); assert.equal(gift.amount, 5);
  assert.deepEqual([50, 500, 1500].map((a, i) => ev(['bits50', 'bits500', 'bits1500'][i]).payload.amount), [50, 500, 1500]);
  assert.equal(ev('bits50').name, 'bits');
  const d = ev('donShort').payload;
  assert.equal(d.type, 'donation'); assert.equal(d.currency, 'USD'); assert.ok(d.amount > 0); assert.ok(d.message.length > 0);
  assert.ok(ev('donLong').payload.message.length > 100);
  const ln = ev('longName').payload;
  assert.equal(ln.name, 'Extremely_Long_Name_25chr'); assert.equal(ln.name.length, MAX_NAME);
  for (const t of TEST_ALERTS) { const p = ev(t.key).payload; assert.ok(p.id && p.name && ['follow', 'sub', 'bits', 'donation'].includes(p.type)); assert.equal(ev(t.key).name, p.type); }
  assert.notEqual(testEvent('follow', 1).payload.id, testEvent('follow', 2).payload.id);
});

test('intro 1v1 payload wraps the real match', () => {
  const m = normalizeMatch(PA[0], 551021);
  const e = testEvent('intro1v1', 1, { match1v1: m });
  assert.equal(e.name, 'match-start');
  assert.deepEqual(e.payload, { type: 'match-start', match: m });
  assert.equal(e.payload.match.me.name, 'PDBull');
});

test('intro 1v1 without a fetched fixture still yields a 1v1 match', () => {
  const e = testEvent('intro1v1', 1);
  assert.equal(e.payload.match.mode, '1v1');
  assert.equal(e.payload.match.me.name, 'PDBull');
});

test('fake 4v4 match shape', () => {
  const m = testEvent('intro4v4', 1).payload.match;
  assert.deepEqual(m, fakeMatch4v4());
  assert.equal(m.mode, 'tg'); assert.equal(m.map, 'Arabia');
  assert.equal(m.myTeam.length, 4); assert.equal(m.enemies.length, 1); assert.equal(m.enemies[0].length, 4);
  assert.deepEqual([...m.myTeam, ...m.enemies[0]].map((p) => p.name), ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6', 'Player7', 'Player8']);
  assert.deepEqual([...m.myTeam, ...m.enemies[0]].map((p) => p.colorHex.length), Array(8).fill(7));
  assert.equal(m.me, m.myTeam[0]);
  assert.equal(m.running, true);
});

test('real events update latest.* only for follow/sub/donation', () => {
  assert.deepEqual(latestUpdate({ type: 'follow', name: 'a' }), ['latest.follower', 'a']);
  assert.deepEqual(latestUpdate({ type: 'sub', name: 'b' }), ['latest.subscriber', 'b']);
  assert.deepEqual(latestUpdate({ type: 'donation', name: 'c', amount: 5 }), ['latest.donation', 'c']);
  assert.equal(latestUpdate({ type: 'bits', name: 'd' }), null);
  assert.equal(latestUpdate(null), null);
});
