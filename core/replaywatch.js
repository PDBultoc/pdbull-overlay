// Replay watcher decisions (pure; the IO lives in tools/replay-watch.mjs).
export const LIVE_MS = 120000; // a replay counts as live while written in the last 2 min
export const MAX_TRIES = 6;    // failed header reads before a file is skipped
export const LOCK_STALE_MS = 30000; // a watcher lock not refreshed in 30 s belongs to a dead watcher

/** Pid lock text ({pid, t}) is stale when junk, old, or its pid is no longer alive. */
export function lockIsStale(text, now, alive) {
  let lock;
  try { lock = JSON.parse(text); } catch { return true; }
  if (!lock || typeof lock.pid !== 'number' || typeof lock.t !== 'number') return true;
  return now - lock.t > LOCK_STALE_MS || !alive(lock.pid);
}

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
