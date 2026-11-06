# Replay detect (casting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Casting scene learns which game Paul casts from the replay file AoE2 DE writes live, with no typing in the dock.

**Architecture:** A pure parser (`core/recheader.js`) reads players from the replay header in Node and in the browser. A local Node watcher (`tools/replay-watch.mjs`, started from the Windows Startup folder) sends one `replay-match` event per game to the ntfy room. The casting overlay pins it (`modules/reactions.js`) and emits the existing `casting-match` to the dock; the dock gets an "Auto from replay" checkbox and a "Load replay…" button for recordings loaded in CaptureAge.

**Tech Stack:** plain ES modules, Node 24 (`node --test`, `zlib`-free: `Blob` + `DecompressionStream`), ntfy.sh room (`core/remote.js`), Windows Script Host for a hidden start.

**Spec:** `docs/specs/2026-11-06-replay-detect-design.md`

## Global Constraints
- No new dependencies; Node 24 built-ins only; browser code runs in OBS 33.0.1 (Chromium 150).
- `timeout 120 npm test` green after every task.
- Commits are path-limited (`git commit -- <paths>`); other sessions share the tree. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push, the Startup-folder install, and anything in OBS only on Paul's explicit yes.
- The room code never goes on a command line or into the repo; it lives in `%APPDATA%\pdbull-overlay\replay-watch.json`.
- Dock labels stay English like the rest of the dock ("Auto from replay", "Load replay…").
- Python (if any) runs with `-X utf8`; never `taskkill /IM msedge.exe`; never re-run a hang.

## Real-data gates
| Heuristic / selector | Real sample | Expected |
|---|---|---|
| Slot anchor + field offsets (`playersFromHeader`) | 6 fixtures cut from Paul's replays (`tests/fixtures/rec/*.bin`, first 8192 inflated bytes; cut 2026-11-06 by `mkfix.mjs`) | exact rows in Task 1 tests |
| Same, whole population (G1) | every `.aoe2record` in `C:\Users\pdbul\Games\Age of Empires 2 DE\76561199003836454\savegame` (620 on 2026-11-06) | `tools/replay-sweep.mjs`: `empty 0`, `noTeams 0` |
| Colour table + team mapping (G2) | ≥ 5 replays whose players match an aoe2companion match of profile 551021 or 1947956 | `tools/replay-vs-companion.mjs`: every compared match `OK` |
| Live-file window 2 min + 5 s tick (G3) | one live or spectated game with the watcher running | log line `sent <file>` ≤ 15 s after the file appears |
| Parameters shared by probe and implementation | HEAD_BYTES 65536 raw bytes, SCAN_BYTES 8192 inflated bytes, custom-civ count search 0–63, field validity civ ≤ 100, team 0–5, colour 0–7 | same constants in `core/recheader.js` |

## Dependency map
- T1 parser — depends: none
- T2 watcher + installer — depends: T1
- T3 remote cache delivery — depends: none
- T4 overlay pin + `casting.auto` default — depends: none
- T5 dock — depends: T1, T4
- T6 gate scripts G1/G2 — depends: T1
- T7 live gates, install, push — depends: T2, T3, T4, T5, T6 and Paul's yes

READY at start: T1, T3, T4 (no shared files). After T1: T2, T6 (and T5 once T4 is in).

---

### Task 1: Replay header parser

**Files:**
- Create: `core/recheader.js`
- Create: `tests/recheader.test.js`
- Fixtures (already on disk, commit them in this task): `tests/fixtures/rec/{poo-dobby,4v4-cc,cc-trap,coop,team0,ffa}.bin`, `tests/fixtures/rec/poo-dobby.head`

**Interfaces:**
- Produces: `HEAD_BYTES = 65536`, `SCAN_BYTES = 8192`, `COLOR_HEX: string[8]`, `playersFromHeader(bytes: Uint8Array) → [{ name, profileId, number, color, team }]`, `teamsFromPlayers(players) → [{ team: number|'?', players: [{ name, color, profileId }] }]`, `startedAtFromName(name) → 'YYYY-MM-DDTHH:MM:SS'|null`, `replayMatch(name, players) → { id, startedAt, source:'replay', teams }`, `inflateHead(blob: Blob) → Promise<Uint8Array|null>`, `replayFromFile(file: File) → Promise<match|null>`.

- [ ] **Step 1: Write the failing tests** — `tests/recheader.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playersFromHeader, teamsFromPlayers, startedAtFromName, replayMatch, inflateHead, replayFromFile } from '../core/recheader.js';

const fx = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/rec/${n}`, import.meta.url)));
const rows = (b) => playersFromHeader(b).map((p) => [p.name, p.profileId, p.number, p.color, p.team]);
const LIVE = 'MP Replay v101.103.57257.0 @2026.11.06 142338 (1).aoe2record';

test('1v1 from a live replay (save 68.9): name, profile id, number, colour id, team byte', () => {
  assert.deepEqual(rows(fx('poo-dobby.bin')), [['PolishedPoo', 10440776, 1, 1, 2], ['Dobby', 1947956, 2, 0, 3]]);
});
test('4v4 with custom-civ lists before the names', () => {
  assert.deepEqual(rows(fx('4v4-cc.bin')), [['PolishedPoo', 10440776, 1, 5, 2], ['MaxPain', 5897473, 2, 0, 3], ['Lukasso', 968628, 3, 3, 2],
    ['极致的数值', 11966470, 4, 4, 3], ['PDBull', 551021, 5, 7, 2], ['DearBanana', 17402278, 6, 2, 3], ['奶糖小团子', 18432299, 7, 1, 2], ['咔咔', 12386146, 8, 6, 3]]);
});
test('a custom-civ count that only looks valid is rejected by the field checks', () => {
  assert.deepEqual(rows(fx('cc-trap.bin')), [['The Potato King', 3974891, 1, 1, 2], ['Tenacious_Lee', 730927, 2, 0, 3], ['wh_halcon', 3831060, 3, 3, 2], ['PDBull', 551021, 4, 2, 3]]);
});
test('co-op: two players share a number and a colour', () => {
  assert.deepEqual(rows(fx('coop.bin')), [['JAM_Josim', 1627260, 1, 0, 2], ['OIDA | Thorb0203', 4527022, 1, 0, 2], ['NO MAMES', 24374627, 2, 6, 3], ['Fer_amicus', 3215548, 2, 6, 3]]);
});
test('team byte 0 and FFA (team byte 1) are read as stored', () => {
  assert.deepEqual(rows(fx('team0.bin'))[2], ['Mike', 23021957, 3, 0, 0]);
  assert.equal(rows(fx('team0.bin')).length, 8);
  assert.deepEqual(rows(fx('ffa.bin')), [['Tramonta', 6312420, 1, 1, 1], ['l1ttl3', 2370053, 2, 0, 1]]);
});
test('empty or junk bytes give no players', () => {
  assert.deepEqual(playersFromHeader(new Uint8Array(0)), []);
  assert.deepEqual(playersFromHeader(new Uint8Array(4096)), []);
});
test('teamsFromPlayers: teams in order, colours as aoe2companion colorHex', () => {
  assert.deepEqual(teamsFromPlayers(playersFromHeader(fx('poo-dobby.bin'))), [
    { team: 1, players: [{ name: 'PolishedPoo', color: '#FF0000', profileId: 10440776 }] },
    { team: 2, players: [{ name: 'Dobby', color: '#405BFF', profileId: 1947956 }] },
  ]);
});
test('teamsFromPlayers: FFA = one group per player; team byte 0 goes to a last "?" group', () => {
  assert.deepEqual(teamsFromPlayers(playersFromHeader(fx('ffa.bin'))).map((t) => [t.team, t.players.map((p) => p.name)]), [[1, ['Tramonta']], [2, ['l1ttl3']]]);
  const t0 = teamsFromPlayers(playersFromHeader(fx('team0.bin')));
  assert.deepEqual(t0.map((t) => [t.team, t.players.length]), [[1, 3], [2, 4], ['?', 1]]);
  assert.equal(t0[2].players[0].name, 'Mike');
});
test('startedAtFromName / replayMatch', () => {
  assert.equal(startedAtFromName(LIVE), '2026-11-06T14:23:38');
  assert.equal(startedAtFromName('[DD3] OIDA JAM vs LOS PRIMOS G1.aoe2record'), null);
  const m = replayMatch(LIVE, playersFromHeader(fx('poo-dobby.bin')));
  assert.equal(m.id, LIVE); assert.equal(m.source, 'replay'); assert.equal(m.startedAt, '2026-11-06T14:23:38'); assert.equal(m.teams.length, 2);
});
test('inflateHead: the raw file head inflates to the same bytes as the fixture', async () => {
  const h = await inflateHead(new Blob([fx('poo-dobby.head')]));
  assert.deepEqual(Buffer.from(h), Buffer.from(fx('poo-dobby.bin')));
});
test('inflateHead: not a replay → null (bad length, bad deflate)', async () => {
  assert.equal(await inflateHead(new Blob([new Uint8Array(100)])), null);
  const bad = new Uint8Array(200); bad.set([200, 0, 0, 0]); bad.fill(255, 8);
  assert.equal(await inflateHead(new Blob([bad])), null);
});
test('replayFromFile: a File becomes a replay-match payload; junk → null', async () => {
  const m = await replayFromFile(new File([fx('poo-dobby.head')], LIVE));
  assert.deepEqual(m.teams.map((t) => t.players.map((p) => p.name)), [['PolishedPoo'], ['Dobby']]);
  assert.equal(await replayFromFile(new File([new Uint8Array(50)], 'x.aoe2record')), null);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/recheader.test.js` → fails with `Cannot find module ... core/recheader.js`.

- [ ] **Step 3: Implement** — `core/recheader.js`:

```js
// Players from an AoE2 DE replay header (.aoe2record). Checked 2026-11-06 on save 68.9, 620 real replays.
// Layout: uint32 header length, uint32, then raw deflate. Each player slot holds 4 DE strings
// (60 0A + uint16 length): "", 1 byte, ai name, censored name, name; then uint32 type, uint32 profile id,
// 4 bytes, int32 number. Before the first string: int32 colour, 2 bytes, team byte, 9 bytes, uint32 civ,
// uint32 custom-civ count c and c uint32 civ ids. Pure ESM: runs in Node and in the browser.
export const HEAD_BYTES = 65536; // raw bytes read from the file
export const SCAN_BYTES = 8192;  // inflated bytes searched for player slots
// aoe2companion colorHex by 0-based replay colour id (aoe2companion's own `color` is 1-based)
export const COLOR_HEX = ['#405BFF', '#FF0000', '#00FF00', '#FFFF00', '#00FFFF', '#FF57B3', '#797979', '#FF9600'];

const dec = new TextDecoder();
function str(b, dv, i) {
  if (i < 0 || i + 4 > b.length || b[i] !== 0x60 || b[i + 1] !== 0x0a) return null;
  const end = i + 4 + dv.getUint16(i + 2, true);
  return end > b.length ? null : { s: dec.decode(b.subarray(i + 4, end)), end };
}
function slotAt(b, dv, g) {
  const a = str(b, dv, g); if (!a || a.s !== '') return null;
  const ai = str(b, dv, a.end + 1); if (!ai) return null;
  const cen = str(b, dv, ai.end); if (!cen) return null;
  const nm = str(b, dv, cen.end); if (!nm || !nm.s) return null;
  const t = nm.end; if (t + 16 > b.length) return null;
  for (let c = 0; c < 64; c++) { // the custom-civ count c sits 4 bytes before the strings, after c civ ids
    const base = g - 4 - 4 * c; if (base - 20 < 0) break;
    if (dv.getUint32(base, true) !== c) continue;
    let ok = true;
    for (let k = 0; k < c; k++) if (dv.getUint32(base + 4 + 4 * k, true) > 100) { ok = false; break; }
    const civ = dv.getUint32(base - 4, true), team = dv.getInt8(base - 14), color = dv.getInt32(base - 20, true);
    if (ok && civ <= 100 && team >= 0 && team <= 5 && color >= 0 && color <= 7) {
      return { name: nm.s, profileId: dv.getUint32(t + 4, true), number: dv.getInt32(t + 12, true), color, team, end: t + 16 };
    }
  }
  return null;
}

/** Inflated header bytes → [{ name, profileId, number, color (0-7), team (raw byte: 0 ?, 1 none, 2.. team 1..) }]. */
export function playersFromHeader(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  const lim = Math.min(b.length - 20, SCAN_BYTES);
  for (let g = 24; g < lim; g++) {
    const p = slotAt(b, dv, g);
    if (p) { const { end, ...row } = p; out.push(row); g = end - 1; }
  }
  return out;
}

/** Players → casting teams: real teams first (1..4), FFA one group per player (team = number), team byte 0 last as '?'. */
export function teamsFromPlayers(players) {
  const groups = new Map();
  for (const p of players || []) {
    const key = p.team === 0 ? '?' : p.team === 1 ? 'f' + p.number : 't' + (p.team - 1);
    if (!groups.has(key)) groups.set(key, { team: p.team === 0 ? '?' : p.team === 1 ? p.number : p.team - 1, players: [] });
    groups.get(key).players.push({ name: p.name, color: COLOR_HEX[p.color], profileId: p.profileId });
  }
  const rank = (g) => (g.team === '?' ? Infinity : g.team);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}

/** 'MP Replay v… @2026.11.06 142338 (1).aoe2record' → '2026-11-06T14:23:38' (local time), else null. */
export function startedAtFromName(name) {
  const m = /@(\d{4})\.(\d{2})\.(\d{2}) (\d{2})(\d{2})(\d{2})/.exec(String(name || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

/** The replay-match payload sent to the room. `name` is the file's base name. */
export function replayMatch(name, players) {
  return { id: String(name), startedAt: startedAtFromName(name), source: 'replay', teams: teamsFromPlayers(players) };
}

/** Blob/File → the first SCAN_BYTES inflated header bytes, or null when it is not a replay. */
export async function inflateHead(blob) {
  const raw = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  if (raw.length < 12) return null;
  const hl = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0, true);
  if (hl < 12) return null;
  const rd = new Blob([raw.subarray(8, Math.min(hl, raw.length))]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = []; let n = 0;
  try {
    while (n < SCAN_BYTES) { const { value, done } = await rd.read(); if (done) break; parts.push(value); n += value.length; }
  } catch { if (!n) return null; } // a cut-off stream errors at its end; what we already have is enough
  rd.cancel().catch(() => {});
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.subarray(0, SCAN_BYTES);
}

/** File (dock picker) → replay-match payload, or null. */
export async function replayFromFile(file) {
  try {
    const h = await inflateHead(file);
    const ps = h ? playersFromHeader(h) : [];
    return ps.length ? replayMatch(file.name, ps) : null;
  } catch { return null; }
}
```

- [ ] **Step 4: Run, expect PASS** — `node --test tests/recheader.test.js` → all pass. If the bad-deflate case leaks an unhandled rejection, wrap the `pipeThrough` chain so the reader is the only consumer (≤ 2 attempts, then report blocked with the output).
- [ ] **Step 5: Full suite** — `timeout 120 npm test` → green.
- [ ] **Step 6: Commit**

```bash
git add core/recheader.js tests/recheader.test.js tests/fixtures/rec
git commit -m "feat(casting): replay header parser for AoE2 DE save 68.9" -- core/recheader.js tests/recheader.test.js tests/fixtures/rec
```

---

### Task 2: Replay watcher + Startup installer

**Files:**
- Create: `core/replaywatch.js` (pure decisions)
- Create: `tools/replay-watch.mjs` (IO: folder, file, ntfy, log, lock)
- Create: `tools/replay-watch-install.mjs` (config + Startup `.vbs`)
- Create: `tests/replaywatch.test.js`

**Interfaces:**
- Consumes: `inflateHead`, `playersFromHeader`, `replayMatch`, `HEAD_BYTES` from `core/recheader.js`; `topicFor(room)` from `core/remote.js`.
- Produces: `LIVE_MS = 120000`, `MAX_TRIES = 6`, `pickLive(files:[{name, mtimeMs}], now, liveMs?) → file|null`, `nextStep(state:{announced, tries:Map}, live) → 'read'|'idle'`, `roomEvent(payload, t) → { kind:'event', type:'replay-match', payload, t }`; CLI `node tools/replay-watch.mjs [--once] [--dry] [--dir <path>]`; `startupVbs(nodeExe, script) → string`, CLI `node tools/replay-watch-install.mjs --room <code> | --uninstall`.

- [ ] **Step 1: Write the failing tests** — `tests/replaywatch.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pickLive, nextStep, roomEvent, LIVE_MS, MAX_TRIES } from '../core/replaywatch.js';
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
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/replaywatch.test.js` → module not found.

- [ ] **Step 3: Implement `core/replaywatch.js`**

```js
// Replay watcher decisions (pure; the IO lives in tools/replay-watch.mjs).
export const LIVE_MS = 120000; // a replay counts as live while written in the last 2 min
export const MAX_TRIES = 6;    // failed header reads before a file is skipped

/** Newest .aoe2record whose mtime is within liveMs of now, or null. */
export function pickLive(files, now, liveMs = LIVE_MS) {
  let best = null;
  for (const f of files || []) {
    if (!/\.aoe2record$/i.test(f.name) || now - f.mtimeMs > liveMs) continue;
    if (!best || f.mtimeMs > best.mtimeMs) best = f;
  }
  return best;
}

/** 'read' when the live file is new and not given up on; else 'idle'. */
export function nextStep(state, live) {
  if (!live || live.name === state.announced) return 'idle';
  return (state.tries.get(live.name) || 0) >= MAX_TRIES ? 'idle' : 'read';
}

/** Same body shape as core/remote.js publishEvent. */
export const roomEvent = (payload, t) => ({ kind: 'event', type: 'replay-match', payload, t });
```

- [ ] **Step 4: Implement `tools/replay-watch.mjs`**

```js
// Watches AoE2 DE's savegame folder. When a replay starts being written (a game played or spectated),
// it reads the players from the header and sends one replay-match event to the overlay room.
// node tools/replay-watch.mjs [--once] [--dry] [--dir <savegame folder>]
//   config: %APPDATA%\pdbull-overlay\replay-watch.json  { "room": "...", "dir": "optional" }
//   log:    %LOCALAPPDATA%\pdbull-overlay\replay-watch.log
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inflateHead, playersFromHeader, replayMatch, HEAD_BYTES } from '../core/recheader.js';
import { pickLive, nextStep, roomEvent, MAX_TRIES } from '../core/replaywatch.js';
import { topicFor } from '../core/remote.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const once = flag('--once'), dry = flag('--dry');
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const CONFIG = path.join(APPDATA, 'pdbull-overlay', 'replay-watch.json');
const LOGDIR = path.join(LOCAL, 'pdbull-overlay');
const LOG = path.join(LOGDIR, 'replay-watch.log');
const PID = path.join(LOGDIR, 'replay-watch.pid');
const TICK_MS = 5000;

fs.mkdirSync(LOGDIR, { recursive: true });
function log(msg) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 262144) fs.renameSync(LOG, LOG + '.1');
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* logging must never stop the watcher */ }
}
function findSavegameDir() {
  const base = path.join(os.homedir(), 'Games', 'Age of Empires 2 DE');
  const ids = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^\d+$/.test(d)) : [];
  for (const id of ids) { const d = path.join(base, id, 'savegame'); if (fs.existsSync(d)) return d; }
  return null;
}

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { /* no config yet */ }
const dir = opt('--dir') || cfg.dir || findSavegameDir();
if (!dir) { log('no savegame folder found'); process.exit(1); }
if (!dry && !cfg.room) { log(`no room in ${CONFIG}`); process.exit(1); }

if (!once) { // one watcher per user: a second start (logon + manual) exits quietly
  try {
    const old = Number(fs.readFileSync(PID, 'utf8'));
    if (old && old !== process.pid) { process.kill(old, 0); log(`already running (pid ${old})`); process.exit(0); }
  } catch { /* no pid file, or that process is gone */ }
  fs.writeFileSync(PID, String(process.pid));
}

const state = { announced: null, tries: new Map() };
let pausedUntil = 0, busy = false;

function readHead(file) { // plain read, so a file the game is still writing is fine
  const fd = fs.openSync(file, 'r');
  try { const buf = Buffer.alloc(HEAD_BYTES); const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0); return new Blob([buf.subarray(0, n)]); }
  finally { fs.closeSync(fd); }
}

async function tick() {
  if (busy) return; busy = true;
  try {
    let files;
    try {
      files = fs.readdirSync(dir).filter((n) => /\.aoe2record$/i.test(n))
        .map((name) => ({ name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs }));
    } catch (e) { log('list failed: ' + e.message); return; }
    const live = pickLive(files, Date.now());
    if (nextStep(state, live) !== 'read') return;
    let players = [];
    try { const h = await inflateHead(readHead(path.join(dir, live.name))); players = h ? playersFromHeader(h) : []; }
    catch (e) { log(`read failed ${live.name}: ${e.message}`); }
    if (!players.length) {
      const n = (state.tries.get(live.name) || 0) + 1; state.tries.set(live.name, n);
      if (n >= MAX_TRIES) log(`skipped ${live.name}: no players after ${n} reads`);
      return;
    }
    const body = roomEvent(replayMatch(live.name, players), Date.now());
    if (dry) { process.stdout.write(JSON.stringify(body) + '\n'); state.announced = live.name; return; }
    if (Date.now() < pausedUntil) return;
    try {
      const r = await fetch('https://ntfy.sh/' + topicFor(cfg.room), { method: 'POST', body: JSON.stringify(body) });
      if (r.ok) { state.announced = live.name; log(`sent ${live.name}: ${players.map((p) => p.name).join(', ')}`); }
      else { if (r.status === 429) pausedUntil = Date.now() + 60000; log(`send failed: http ${r.status}`); }
    } catch (e) { log('send failed: ' + e.message); }
  } finally { busy = false; }
}

log(`start pid=${process.pid} dir=${dir}${dry ? ' (dry)' : ''}${once ? ' (once)' : ''}`);
await tick();
if (!once) setInterval(() => { tick().catch((e) => log('tick: ' + e.message)); }, TICK_MS);
```

- [ ] **Step 5: Implement `tools/replay-watch-install.mjs`**

```js
// Starts the replay watcher at logon from the user's Startup folder (no admin rights, no window).
// node tools/replay-watch-install.mjs --room <code>   writes the config, the Startup .vbs, and starts it once
// node tools/replay-watch-install.mjs --uninstall     removes the Startup .vbs (the config stays)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** VBScript that runs `node script` with a hidden window (style 0) and does not wait. */
export function startupVbs(nodeExe, script) {
  return [
    "' pdbull-overlay replay watcher. Remove: node tools/replay-watch-install.mjs --uninstall",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${nodeExe}"" ""${script}""", 0, False`,
    '',
  ].join('\r\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const VBS = path.join(APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'pdbull-replay-watch.vbs');
  const CONFIG = path.join(APPDATA, 'pdbull-overlay', 'replay-watch.json');
  const args = process.argv.slice(2);
  if (args.includes('--uninstall')) {
    fs.rmSync(VBS, { force: true });
    console.log('removed ' + VBS + ' (a running watcher stops at logoff, or: taskkill /PID <pid in %LOCALAPPDATA%\\pdbull-overlay\\replay-watch.pid> /T /F)');
  } else {
    const i = args.indexOf('--room'); const room = i >= 0 ? args[i + 1] : '';
    if (!/^[a-z0-9]{8,64}$/.test(room || '')) { console.error('usage: --room <room code from the overlay URL>'); process.exit(2); }
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { /* new */ }
    fs.writeFileSync(CONFIG, JSON.stringify({ ...cfg, room }, null, 2));
    const script = fileURLToPath(new URL('./replay-watch.mjs', import.meta.url));
    fs.writeFileSync(VBS, startupVbs(process.execPath, script));
    spawn('wscript.exe', ['//B', VBS], { detached: true, stdio: 'ignore' }).unref();
    console.log('installed ' + VBS + ' and started the watcher; config ' + CONFIG);
  }
}
```

- [ ] **Step 6: Run, expect PASS** — `node --test tests/replaywatch.test.js`, then `timeout 120 npm test` → green. The two spawn tests set `APPDATA`/`LOCALAPPDATA` to the temp folder, so Paul's real log is untouched.
- [ ] **Step 7: Commit**

```bash
git add core/replaywatch.js tools/replay-watch.mjs tools/replay-watch-install.mjs tests/replaywatch.test.js
git commit -m "feat(casting): replay watcher sends the cast game's players to the room" -- core/replaywatch.js tools/replay-watch.mjs tools/replay-watch-install.mjs tests/replaywatch.test.js
```

---

### Task 3: Overlay recovers the current replay from the room cache

**Files:**
- Modify: `core/remote.js` (`start()`, plus one export)
- Test: `tests/remote.test.js` (append)

**Interfaces:**
- Produces: `REPLAY_MAX_AGE_MS = 3 * 3600 * 1000`; `start()` calls `onEvent('replay-match', payload)` once for the newest cached `replay-match` with `now() - t <= REPLAY_MAX_AGE_MS`. Other cached events stay un-replayed.

- [ ] **Step 1: Write the failing tests** — append to `tests/remote.test.js` (it already defines `FakeES` and imports `createRemote`; add `REPLAY_MAX_AGE_MS` to that import line):

```js
const NOW = 10 * 3600e3;
const cached = (b) => JSON.stringify({ event: 'message', message: JSON.stringify(b) });
const rm = (id, t) => cached({ kind: 'event', type: 'replay-match', payload: { id }, t });

test('start() delivers the newest cached replay-match younger than 3 h, once', async () => {
  const fetchFn = async () => ({ ok: true, text: async () => [
    rm('old', NOW - REPLAY_MAX_AGE_MS - 1), rm('a', NOW - 7200e3), rm('b', NOW - 60e3),
    cached({ kind: 'event', type: 'donation', payload: { amount: 5 }, t: NOW }),
  ].join('\n') });
  const events = [];
  const r = createRemote({ room: 'r9', fetchFn, ES: FakeES, now: () => NOW, onSettings: () => {}, onEvent: (t, p) => events.push([t, p.id ?? p.amount]) });
  await r.start();
  assert.deepEqual(events, [['replay-match', 'b']]);
  r.stop();
});
test('a cached replay-match older than 3 h, or without t, is not delivered', async () => {
  const fetchFn = async () => ({ ok: true, text: async () => [rm('old', NOW - REPLAY_MAX_AGE_MS - 1), cached({ kind: 'event', type: 'replay-match', payload: { id: 'x' } })].join('\n') });
  const events = [];
  const r = createRemote({ room: 'r10', fetchFn, ES: FakeES, now: () => NOW, onSettings: () => {}, onEvent: (t) => events.push(t) });
  await r.start();
  assert.deepEqual(events, []);
  r.stop();
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/remote.test.js` → `REPLAY_MAX_AGE_MS` is not exported / events empty.
- [ ] **Step 3: Implement** — in `core/remote.js` add after `const settingsOf = …`:

```js
// The watcher's replay-match is the one event a restarted overlay must recover from the cache:
// the current cast game, if it started less than 3 h ago.
export const REPLAY_MAX_AGE_MS = 3 * 3600 * 1000;
```

and in `start()` replace

```js
        const all = (await r.text()).split('\n').map(parse).map(settingsOf).filter(Boolean);
        if (all.length) deliver(all[all.length - 1]);
```

with

```js
        const lines = (await r.text()).split('\n').map(parse);
        const all = lines.map(settingsOf).filter(Boolean);
        if (all.length) deliver(all[all.length - 1]);
        const rm = lines.map(bodyOf).filter((b) => isEvent(b) && b.type === 'replay-match' && now() - Number(b.t) <= REPLAY_MAX_AGE_MS).pop();
        if (rm) { try { onEvent(rm.type, rm.payload); } catch { /* ignore */ } }
```

- [ ] **Step 4: Run, expect PASS** — `node --test tests/remote.test.js` (the existing "never replayed from the cache" test must still pass), then `timeout 120 npm test`.
- [ ] **Step 5: Commit**

```bash
git add core/remote.js tests/remote.test.js
git commit -m "feat(casting): a restarted overlay recovers the current replay-match from the room cache" -- core/remote.js tests/remote.test.js
```

---

### Task 4: Casting overlay pins the replay match

**Files:**
- Modify: `core/settings.js:7` (`casting` defaults gain `auto: true`)
- Modify: `tests/settings.test.js:85` (expected defaults)
- Modify: `modules/reactions.js` (the `offs` handlers, ~line 96–103)
- Test: `tests/reactions.test.js` (rig option + new tests)

**Interfaces:**
- Consumes: bus event `replay-match` with payload `{ id, startedAt, source:'replay', teams:[{ team, players:[{ name, color, profileId }] }] }` (Task 1's `replayMatch`).
- Produces: `casting-match { matchId, map:'', teams, source:'replay', startedAt }` while a replay is pinned and `settings.casting.auto !== false`; `match-running` from the poller then re-emits the pinned match instead of its own.

- [ ] **Step 1: Tests first**
  - `tests/settings.test.js:85` becomes `assert.deepEqual(s.get().casting, { followProfileId: null, followName: '', manual: '', sound: true, volume: 0.7, auto: true });`
  - In `tests/reactions.test.js` `rig()`, replace `settings: { get: () => ({ casting: { sound: false, volume: 0.5 } }) }` with `settings: { get: () => ({ casting: { sound: false, volume: 0.5, ...(over.casting || {}) } }) }` (the object passed as `over.casting` may be mutated by a test to flip `auto`).
  - Append:

```js
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
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/reactions.test.js tests/settings.test.js`.
- [ ] **Step 3: Implement**
  - `core/settings.js:7`: `casting: { followProfileId: null, followName: '', manual: '', sound: true, volume: 0.7, auto: true },`
  - `modules/reactions.js`: after `let cur = null, outgoing = null, looping = false, dead = false, players = 2;` add

```js
  let pinned = null; // the replay-detected match (watcher or dock "Load replay…"); shown while casting.auto is on
  const auto = () => cset().auto !== false;
  function showPinned() {
    players = pinned.teams.reduce((a, t) => a + ((t && t.players) || []).length, 0) || 2;
    tally.forMatch(pinned.id); publishTally();
    bus.emit('casting-match', { matchId: pinned.id, map: '', teams: pinned.teams, source: 'replay', startedAt: pinned.startedAt || null });
  }
```

  and in `offs`, the `match-running` handler gains one line after the `test-` check, plus a new handler:

```js
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
```

- [ ] **Step 4: Run, expect PASS** — the two test files, then `timeout 120 npm test`.
- [ ] **Step 5: Commit**

```bash
git add core/settings.js tests/settings.test.js modules/reactions.js tests/reactions.test.js
git commit -m "feat(casting): the casting overlay pins the replay-detected match (casting.auto)" -- core/settings.js tests/settings.test.js modules/reactions.js tests/reactions.test.js
```

---

### Task 5: Dock — Auto checkbox, source line, Load replay…

**Files:**
- Modify: `core/reactionlogic.js` (add `castSourceLine`)
- Test: `tests/reactionlogic.test.js` (append)
- Modify: `panel.js` (Casting card, lines ~160–208)

**Interfaces:**
- Consumes: `replayFromFile(file)` (Task 1); `casting-match` with `source`/`startedAt` (Task 4); setting `casting.auto` (Task 4).
- Produces: `castSourceLine(m) → string`; dock sends `replay-match` (local bus + room) from a picked file.

- [ ] **Step 1: Failing test** — append to `tests/reactionlogic.test.js` (add `castSourceLine` to its import from `../core/reactionlogic.js`):

```js
test('castSourceLine: where the dock players come from', () => {
  const teams = [{ team: 1, players: [{ name: 'A' }, { name: 'B' }] }, { team: 2, players: [{ name: 'C' }] }];
  assert.equal(castSourceLine({ source: 'replay', startedAt: '2026-11-06T14:23:38', teams }), 'From replay 14:23 · 3 players');
  assert.equal(castSourceLine({ source: 'replay', startedAt: null, teams }), 'From replay · 3 players');
  assert.equal(castSourceLine({ matchId: 'm1', teams }), 'From aoe2companion · 3 players');
  assert.equal(castSourceLine({ teams: [] }), 'No match yet: manual list below');
  assert.equal(castSourceLine(null), 'No match yet: manual list below');
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/reactionlogic.test.js`.
- [ ] **Step 3: Implement** — append to `core/reactionlogic.js`:

```js
/** Dock line under the Casting players: where the current list comes from. */
export function castSourceLine(m) {
  const n = ((m && m.teams) || []).reduce((a, t) => a + ((t && t.players) || []).length, 0);
  if (!n) return 'No match yet: manual list below';
  if (m.source === 'replay') {
    const hm = /T(\d{2}:\d{2})/.exec(m.startedAt || '');
    return `From replay${hm ? ' ' + hm[1] : ''} · ${n} players`;
  }
  return `From aoe2companion · ${n} players`;
}
```

- [ ] **Step 4: Wire the dock** — in `panel.js`:
  1. Imports: add `castSourceLine` to the `./core/reactionlogic.js` import; add `import { replayFromFile } from './core/recheader.js';`.
  2. Before `const castingCard = card('Casting', [`, add:

```js
  const sourceLine = el('div', { class: 'dim', text: castSourceLine(null) });
  bus.on('casting-match', (m) => { sourceLine.textContent = castSourceLine(m); });
  // Recordings loaded in CaptureAge write no new file: pick the file here instead.
  const pickInput = el('input', { type: 'file', accept: '.aoe2record', style: 'display:none' });
  const pickMsg = el('span', { class: 'dim' });
  pickInput.addEventListener('change', async () => {
    const f = pickInput.files && pickInput.files[0];
    if (!f) return;
    pickMsg.textContent = '…';
    const m = await replayFromFile(f);
    pickInput.value = '';
    if (!m) { pickMsg.textContent = 'Not a readable replay'; return; }
    pickMsg.textContent = '';
    write('casting.auto', true);
    send('replay-match', m);
  });
```

  3. Follow-player result buttons: the `onclick` becomes `() => { write('casting.followProfileId', p.profileId); write('casting.followName', p.name); write('casting.auto', false); results.replaceChildren(); showFollowed(); }`; the "Follow my own games" button's `onclick` becomes `() => { write('casting.followProfileId', null); write('casting.followName', ''); write('casting.auto', false); showFollowed(); }`.
  4. The card list starts with the new controls: `check('Auto from replay', 'casting.auto'), sourceLine, el('div', { class: 'btns' }, [el('button', { type: 'button', text: 'Load replay…', onclick: () => pickInput.click() }), pickMsg, pickInput]), followed, …` (rest unchanged).

- [ ] **Step 5: Run** — `timeout 120 npm test` → green.
- [ ] **Step 6: Browser smoke test (in-app browser, pane shown)** — `preview_start {name: "pdbull-site"}`, open `http://127.0.0.1:8797/panel.html`, check: the Casting card shows "Auto from replay" (ticked), the source line, and "Load replay…"; no console errors (`read_console_messages onlyErrors`). Then, in the panel tab, run `javascript_tool`: `(await import('./core/recheader.js')).replayFromFile(new File([await (await fetch('tests/fixtures/rec/poo-dobby.head')).arrayBuffer()], 'MP Replay v101.103.57257.0 @2026.11.06 142338 (1).aoe2record')).then((m) => JSON.stringify(m.teams))` → both names. Stop the preview server at the end (`preview_stop`) and check port 8797 is free (`netstat -ano | findstr :8797` prints nothing).
- [ ] **Step 7: Commit**

```bash
git add core/reactionlogic.js tests/reactionlogic.test.js panel.js
git commit -m "feat(casting): dock Auto-from-replay checkbox, source line and Load replay button" -- core/reactionlogic.js tests/reactionlogic.test.js panel.js
```

---

### Task 6: Real-data gate scripts G1 and G2

**Files:**
- Create: `tools/replay-sweep.mjs`
- Create: `tools/replay-vs-companion.mjs`

**Interfaces:**
- Consumes: `inflateHead`, `playersFromHeader`, `teamsFromPlayers` (Task 1).
- Produces: CLI reports used by Task 7 and after every AoE2 patch.

- [ ] **Step 1: `tools/replay-sweep.mjs`**

```js
// G1: parse every replay in a folder; prints counts and the files that fail.
// node tools/replay-sweep.mjs "<savegame folder>"   (after an AoE2 patch too: a changed header shows here first)
import fs from 'node:fs';
import path from 'node:path';
import { inflateHead, playersFromHeader, teamsFromPlayers, HEAD_BYTES } from '../core/recheader.js';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => /\.aoe2record$/i.test(f));
const hist = {}; const empty = []; const noTeams = []; const ms = [];
for (const f of files) {
  const t0 = performance.now();
  const fd = fs.openSync(path.join(dir, f), 'r'); const buf = Buffer.alloc(HEAD_BYTES); const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0); fs.closeSync(fd);
  const h = await inflateHead(new Blob([buf.subarray(0, n)]));
  const ps = h ? playersFromHeader(h) : [];
  ms.push(performance.now() - t0);
  hist[ps.length] = (hist[ps.length] || 0) + 1;
  if (!ps.length) empty.push(f);
  else if (ps.length >= 2 && teamsFromPlayers(ps).length < 2) noTeams.push(f);
}
ms.sort((a, b) => a - b);
console.log(`files ${files.length}  players-per-file ${JSON.stringify(hist)}  empty ${empty.length}  noTeams ${noTeams.length}  median ${ms[ms.length >> 1].toFixed(1)} ms  max ${ms.at(-1).toFixed(1)} ms`);
for (const f of [...empty.map((x) => 'EMPTY ' + x), ...noTeams.map((x) => 'NOTEAMS ' + x)].slice(0, 30)) console.log(f);
```

Note: a co-op game whose 4 players are all on one side would be `noTeams`; none exist on disk today (the sweep in the spec found 0 problems), so any hit is printed for a look.

- [ ] **Step 2: Run G1** — `node tools/replay-sweep.mjs "C:/Users/pdbul/Games/Age of Empires 2 DE/76561199003836454/savegame" > .superpowers/replay-g1.log 2>&1; echo exit=$?` then read the log. Expected: `files 6xx … empty 0  noTeams 0`.

- [ ] **Step 3: `tools/replay-vs-companion.mjs`**

```js
// G2: compare replay colours/teams with aoe2companion for the same games (matched by the set of profile ids).
// node tools/replay-vs-companion.mjs "<savegame folder>" <profileId> [<profileId> …]
import fs from 'node:fs';
import path from 'node:path';
import { inflateHead, playersFromHeader, teamsFromPlayers, startedAtFromName, HEAD_BYTES } from '../core/recheader.js';
const [dir, ...ids] = process.argv.slice(2);
const key = (pids) => [...pids].map(Number).sort((a, b) => a - b).join(',');
const byKey = new Map(); // same lineup → several replays (rematches): pick the one closest in time
for (const f of fs.readdirSync(dir).filter((x) => /\.aoe2record$/i.test(x))) {
  const at = startedAtFromName(f); if (!at) continue;
  const fd = fs.openSync(path.join(dir, f), 'r'); const buf = Buffer.alloc(HEAD_BYTES); const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0); fs.closeSync(fd);
  const h = await inflateHead(new Blob([buf.subarray(0, n)])); const ps = h ? playersFromHeader(h) : [];
  if (ps.length < 2) continue;
  const k = key(ps.map((p) => p.profileId));
  (byKey.get(k) || byKey.set(k, []).get(k)).push({ f, ps, t: new Date(at).getTime() }); // file name time is local
}
const closest = (k, startedIso) => {
  const t = Date.parse(startedIso); let best = null;
  for (const r of byKey.get(k) || []) if (Math.abs(r.t - t) <= 30 * 60000 && (!best || Math.abs(r.t - t) < Math.abs(best.t - t))) best = r;
  return best;
};
let ok = 0, diff = 0;
for (const id of ids) {
  for (const page of [1, 2]) {
    const r = await fetch(`https://data.aoe2companion.com/api/matches?profile_ids=${id}&page=${page}`, { headers: { 'user-agent': 'pdbull-overlay replay gate' } });
    if (!r.ok) { console.log(`aoe2companion http ${r.status} for ${id} page ${page}`); continue; }
    for (const m of (await r.json()).matches || []) {
      const cps = m.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.teamId })));
      const rep = closest(key(cps.map((p) => p.profileId)), m.started);
      if (!rep) continue;
      const teams = teamsFromPlayers(rep.ps);
      const repColor = new Map(teams.flatMap((t) => t.players.map((p) => [p.profileId, p.color.toUpperCase()])));
      const split = (groups) => groups.map((g) => key(g)).sort().join(' | ');
      const colourOk = cps.every((p) => repColor.get(p.profileId) === String(p.colorHex).toUpperCase());
      const teamOk = split(teams.map((t) => t.players.map((p) => p.profileId))) === split(m.teams.map((t) => t.players.map((p) => p.profileId)));
      if (colourOk && teamOk) ok++; else diff++;
      console.log(`${colourOk && teamOk ? 'OK  ' : 'DIFF'} ${m.matchId} ${m.mapName} ↔ ${rep.f}${colourOk ? '' : ' colours'}${teamOk ? '' : ' teams'}`);
    }
  }
}
console.log(`compared ${ok + diff}: OK ${ok}, DIFF ${diff}`);
```

- [ ] **Step 4: Run G2** — `node tools/replay-vs-companion.mjs "C:/Users/pdbul/Games/Age of Empires 2 DE/76561199003836454/savegame" 551021 1947956 > .superpowers/replay-g2.log 2>&1; echo exit=$?`, read the log. Expected: `compared ≥ 5`, `DIFF 0`. A DIFF stops Task 7 and goes back to Task 1 with the file name (FFA games: aoe2companion may list each player as its own team; if only FFA lines differ on teams, report them, do not change the mapping without a look).
- [ ] **Step 5: Commit**

```bash
git add tools/replay-sweep.mjs tools/replay-vs-companion.mjs
git commit -m "chore(casting): replay gate scripts (sweep, compare with aoe2companion)" -- tools/replay-sweep.mjs tools/replay-vs-companion.mjs
```

---

### Task 7: Live gates, install, push (controller; Paul's yes for each external step)

- [ ] **Step 1: G3 dry run without installing** — while Paul plays or spectates one game: `node tools/replay-watch.mjs --dry` in a Terminal tab (`run_in_terminal`, so Paul sees it). Expected: within 15 s of the game's file appearing, one JSON line with the right players. Then stop the tab (`stop_terminal_tab`). If the read fails while AoE writes (`read failed … EBUSY`), report it to Paul with the log line; fallback: none planned, it changes the design.
- [ ] **Step 2: Room code** — read it from OBS's casting browser source URL without printing it: `grep -o 'room=[a-z0-9]*' "$APPDATA/obs-studio/basic/scenes/"*.json | sort -u | wc -l` must be 1; then pass it to the installer through a shell variable (never echoed into the transcript).
- [ ] **Step 3: Install (Paul's yes)** — `PDBULL_ROOM="$ROOM" node tools/replay-watch-install.mjs` (fix round 1 of Task 2: the room comes from the environment, never from a flag). Check: the `.vbs` exists in the Startup folder; `%LOCALAPPDATA%\pdbull-overlay\replay-watch.log` has a `start pid=` line; the pid in `replay-watch.pid` is a running `node.exe` (`tasklist /FI "PID eq <pid>"`).
- [ ] **Step 4: Push (Paul's yes)** — bump `version.json` to the next free `2026-11-06.N` (it reads `2026-11-06.3` today; the unpushed black-frame fix c8eb4bb goes out with this push, so tell Paul both), `timeout 120 npm test` green, `git push`. Wait until Pages serves the new version (`curl -s https://pdbultoc.github.io/pdbull-overlay/version.json`).
- [ ] **Step 5: G4 end to end** — with OBS on the Casting scene, Paul starts spectating a game: the dock's Casting card shows the players with the right colours and "From replay HH:MM · N players" without typing; one reaction uses a detected player. Then the OBS dock picker: "Load replay…" on a DD3 file (≤ 2 attempts; if the dialog does not open in the OBS dock, remove the button in a follow-up and record the gap in NEXT.md).
- [ ] **Step 6: Handoff** — update `.claude/NEXT.md` (≤ 10 lines: hash, what is installed, how to uninstall, G1–G4 results) and the casting spec §3 with one line pointing to this design.
