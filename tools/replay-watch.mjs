// Watches AoE2 DE's savegame folder. When a replay starts being written (a game played or spectated),
// it reads the players from the header and sends one replay-match event to the overlay room.
// node tools/replay-watch.mjs [--once] [--dry] [--dir <savegame folder>]
//   config: %APPDATA%\pdbull-overlay\replay-watch.json  { "room": "...", "dir": "optional" }
//   log:    %LOCALAPPDATA%\pdbull-overlay\replay-watch.log
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inflateHead, playersFromHeader, replayMatch, HEAD_BYTES } from '../core/recheader.js';
import { pickLive, nextStep, roomEvent, lockIsStale, MAX_TRIES } from '../core/replaywatch.js';
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
const ROOM_RE = /^[a-z0-9]{8,64}$/;

fs.mkdirSync(LOGDIR, { recursive: true });
function log(msg) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 262144) fs.renameSync(LOG, LOG + '.1');
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* logging must never stop the watcher */ }
}
function findSavegameDirs() { // every account folder has its own savegame folder; only one holds the live replays
  const base = path.join(os.homedir(), 'Games', 'Age of Empires 2 DE');
  const ids = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^\d+$/.test(d)) : [];
  return ids.map((id) => path.join(base, id, 'savegame')).filter((d) => fs.existsSync(d));
}

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { /* no config yet */ }
const explicit = opt('--dir') || cfg.dir;
const dirs = explicit ? [explicit] : findSavegameDirs();
if (!dirs.length) { log('no savegame folder found'); process.exit(1); }
if (!dry && !cfg.room) { log(`no room in ${CONFIG}`); process.exit(1); }
if (!dry && !ROOM_RE.test(cfg.room)) { log('room in config is invalid'); process.exit(1); }

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const writeLock = () => fs.writeFileSync(PID, JSON.stringify({ pid: process.pid, t: Date.now() }));
if (!once) { // one watcher per user: a second start (logon + manual) exits quietly
  let text = ''; try { text = fs.readFileSync(PID, 'utf8'); } catch { /* no pid file */ }
  const lock = (() => { try { return JSON.parse(text); } catch { return null; } })();
  if (!lockIsStale(text, Date.now(), alive) && lock.pid !== process.pid) { log(`already running (pid ${lock.pid})`); process.exit(0); }
  writeLock();
  process.on('exit', () => { // leave no stale lock behind: remove it only if it still holds our pid
    try { const cur = JSON.parse(fs.readFileSync(PID, 'utf8')); if (cur.pid === process.pid) fs.rmSync(PID, { force: true }); } catch { /* none */ }
  });
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
    if (!once) writeLock(); // heartbeat: a fresh t tells a second start this watcher is alive
    const files = [];
    for (const dir of dirs) {
      try {
        for (const name of fs.readdirSync(dir).filter((n) => /\.aoe2record$/i.test(n))) {
          const full = path.join(dir, name);
          files.push({ name, mtimeMs: fs.statSync(full).mtimeMs, full });
        }
      } catch (e) { log(`list failed ${dir}: ${e.message}`); }
    }
    const live = pickLive(files, Date.now());
    if (nextStep(state, live) !== 'read') return;
    let players = [];
    try { const h = await inflateHead(readHead(live.full)); players = h ? playersFromHeader(h) : []; }
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
      const r = await fetch('https://ntfy.sh/' + topicFor(cfg.room), { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      if (r.ok) { state.announced = live.name; log(`sent ${live.name}: ${players.map((p) => p.name).join(', ')}`); }
      else { if (r.status === 429) pausedUntil = Date.now() + 60000; log(`send failed: http ${r.status}`); }
    } catch (e) { log('send failed: ' + e.message); }
  } finally { busy = false; }
}

log(`start pid=${process.pid} dir=${dirs.join(';')}${dry ? ' (dry)' : ''}${once ? ' (once)' : ''}`);
await tick().catch((e) => log('tick: ' + e.message));
if (!once) setInterval(() => { tick().catch((e) => log('tick: ' + e.message)); }, TICK_MS);
