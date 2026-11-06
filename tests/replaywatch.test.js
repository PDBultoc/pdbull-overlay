import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pickLive, nextStep, roomEvent, lockIsStale, LIVE_MS, LOCK_STALE_MS, MAX_TRIES } from '../core/replaywatch.js';
import { startupVbs } from '../tools/replay-watch-install.mjs';

const WATCH = fileURLToPath(new URL('../tools/replay-watch.mjs', import.meta.url));
const HEAD = fileURLToPath(new URL('./fixtures/rec/poo-dobby.head', import.meta.url));
const LIVE = 'MP Replay v101.103.57257.0 @2026.11.06 142338 (1).aoe2record';

test('pickLive: newest replay written in the last 2 min; older files and other types ignored', () => {
  const now = 1e12;
  const files = [{ name: 'a.aoe2record', mtimeMs: now - 10000 }, { name: 'b.aoe2record', mtimeMs: now - 5000 },
    { name: 'c.txt', mtimeMs: now }, { name: 'old.aoe2record', mtimeMs: now - LIVE_MS - 1 }];
  assert.equal(pickLive(files, now).name, 'b.aoe2record');
  assert.equal(pickLive([files[3]], now), null);
  assert.equal(pickLive([], now), null);
});
test('nextStep: read a new live file; idle when none, already announced, or after MAX_TRIES', () => {
  const s = { announced: null, tries: new Map() };
  assert.equal(nextStep(s, null), 'idle');
  assert.equal(nextStep(s, { name: 'x' }), 'read');
  s.tries.set('x', MAX_TRIES); assert.equal(nextStep(s, { name: 'x' }), 'idle');
  s.announced = 'y'; assert.equal(nextStep(s, { name: 'y' }), 'idle');
});
test('lockIsStale: junk, old heartbeat or dead pid is stale; a fresh live lock is not', () => {
  const now = 1e12, alive = () => true, dead = () => false;
  const fresh = JSON.stringify({ pid: 42, t: now - 1000 });
  assert.equal(lockIsStale('not json', now, alive), true);
  assert.equal(lockIsStale('{"pid":"x","t":1}', now, alive), true);
  assert.equal(lockIsStale(fresh, now, alive), false);
  assert.equal(lockIsStale(JSON.stringify({ pid: 42, t: now - LOCK_STALE_MS - 1 }), now, alive), true);
  assert.equal(lockIsStale(fresh, now, dead), true);
});
test('roomEvent has the publishEvent body shape', () => {
  assert.deepEqual(roomEvent({ id: 'x' }, 5), { kind: 'event', type: 'replay-match', payload: { id: 'x' }, t: 5 });
});
function runOnce(dir) {
  return spawnSync(process.execPath, [WATCH, '--once', '--dry', '--dir', dir],
    { encoding: 'utf8', timeout: 20000, env: { ...process.env, APPDATA: dir, LOCALAPPDATA: dir } });
}
test('watcher --once --dry prints one replay-match for a live replay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rw-'));
  try {
    copyFileSync(HEAD, join(dir, LIVE));
    const now = Date.now() / 1000; utimesSync(join(dir, LIVE), now, now); // copyFileSync keeps the fixture's old mtime
    const r = runOnce(dir);
    assert.equal(r.status, 0, r.stderr);
    const ev = JSON.parse(r.stdout.trim());
    assert.equal(ev.type, 'replay-match'); assert.equal(ev.payload.id, LIVE);
    assert.deepEqual(ev.payload.teams.map((t) => t.players.map((p) => p.name)), [['PolishedPoo'], ['Dobby']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('watcher --once --dry stays silent for a replay older than 2 min', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rw-'));
  try {
    copyFileSync(HEAD, join(dir, LIVE));
    const old = (Date.now() - LIVE_MS - 60000) / 1000; utimesSync(join(dir, LIVE), old, old);
    const r = runOnce(dir);
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('startupVbs runs node hidden on the watcher script', () => {
  const v = startupVbs('C:\\Program Files\\nodejs\\node.exe', 'C:\\x\\tools\\replay-watch.mjs');
  assert.match(v, /sh\.Run """C:\\Program Files\\nodejs\\node\.exe"" ""C:\\x\\tools\\replay-watch\.mjs""", 0, False/);
  assert.match(v, /\r\n/);
});
