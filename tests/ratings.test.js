import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMatch } from '../core/aoe2.js';
import { introFromMatch } from '../core/intrologic.js';
import { rm1v1, createRatings } from '../core/ratings.js';

const profiles = JSON.parse(fs.readFileSync(new URL('./fixtures/profiles-rm1v1.json', import.meta.url), 'utf8'));
const byId = new Map(profiles.map((p) => [p.profileId, p]));
const okFetch = (calls = []) => async (url) => {
  calls.push(url);
  const id = Number(String(url).split('/').pop());
  return byId.has(id) ? { ok: true, json: async () => byId.get(id) } : { ok: false, status: 404, json: async () => ({}) };
};

test('rm1v1: exact numbers for all 8 fixture profiles', () => {
  const want = { 551021: 1505, 20186100: 1257, 1517548: 1131, 392423: 1955, 9894577: 1725, 1078238: 1655, 17750263: 1306, 1978798: 1579 };
  assert.equal(profiles.length, 8);
  for (const p of profiles) assert.equal(rm1v1(p), want[p.profileId], p.name);
});

test('rm1v1: no rm_1v1 entry / junk -> null', () => {
  assert.equal(rm1v1({ profileId: 1, leaderboards: [{ leaderboardId: 'rm_team', rating: 1400 }] }), null);
  assert.equal(rm1v1({ profileId: 1 }), null);
  assert.equal(rm1v1(null), null);
});

test('get: parallel fetch, cache hit within TTL calls fetch once, expires after TTL', async () => {
  const calls = []; let t = 1000;
  const r = createRatings({ fetchFn: okFetch(calls), ttlMs: 600000, now: () => t });
  const a = await r.get([551021, 392423]);
  assert.equal(a.get(551021), 1505); assert.equal(a.get(392423), 1955);
  assert.equal(calls.length, 2);
  t += 1000;
  const b = await r.get([551021]);
  assert.equal(b.get(551021), 1505); assert.equal(calls.length, 2);
  t += 600001;
  await r.get([551021]);
  assert.equal(calls.length, 3);
});

test('get: failures (404, throw, bad json) -> null, never throws', async () => {
  const r = createRatings({ fetchFn: async (u) => { if (/999$/.test(u)) throw new Error('net'); return { ok: false }; } });
  const m = await r.get([1, 999]);
  assert.equal(m.get(1), null); assert.equal(m.get(999), null);
});

test('get: overall timeout 2500 ms -> unresolved ids null, resolved ones kept', async () => {
  const slow = (url) => (/392423$/.test(url) ? new Promise(() => {}) : okFetch()(url));
  const r = createRatings({ fetchFn: slow, timeoutMs: 40 });
  const m = await r.get([551021, 392423]);
  assert.equal(m.get(551021), 1505); assert.equal(m.get(392423), null);
});

test('introFromMatch with ratings on pdbull-tg 3v3: elos aligned with names', () => {
  const data = JSON.parse(fs.readFileSync(new URL('./fixtures/pdbull-tg.json', import.meta.url), 'utf8'));
  const m = normalizeMatch(data[0], 551021);
  const map = new Map(profiles.map((p) => [p.profileId, rm1v1(p)]));
  const i = introFromMatch(m, map);
  assert.deepEqual(i.left.names, ['PDBull', 'SwedishGoblinTwitch', 'Havsutsikt']);
  assert.deepEqual(i.left.elos, [1505, 1257, 1131]);
  assert.deepEqual(i.right.elos, [1955, 1725, 1655]);
  const j = introFromMatch(m, new Map([[551021, 1505]]));
  assert.deepEqual(j.left.elos, [1505, null, null]);
});
