// Remote sync through ntfy.sh (free public relay, no account; probed 2026-11-01:
// CORS *, 3.5 KB messages intact, cached 12 h). In Streamlabs Desktop the
// Layout Editor panel and the browser source share neither storage nor
// BroadcastChannel, so settings travel panel → ntfy → overlay instead.
// The room code is the secret: whoever knows it can read and change the settings.
const BASE = 'https://ntfy.sh/';

export const topicFor = (room) => 'pdbull-' + room;

export function newRoom() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

// The Streamlabs token stays on the machine it was typed on.
export function stripSecrets(s) {
  const out = JSON.parse(JSON.stringify(s || {}));
  if (out.modules && out.modules.alerts) delete out.modules.alerts.streamlabsToken;
  return out;
}

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const bodyOf = (evt) => (evt && evt.event === 'message' ? parse(evt.message) : null);
// A room carries two kinds of messages: settings snapshots and live events
// (Streamlabs donations etc., wrapped as {kind:'event'}).
const isEvent = (b) => Boolean(b && b.kind === 'event');
const settingsOf = (evt) => { const b = bodyOf(evt); return b && !isEvent(b) ? b : null; };

// The watcher's replay-match is the one event a restarted overlay must recover from the cache:
// the current cast game, if it started less than 3 h ago.
export const REPLAY_MAX_AGE_MS = 3 * 3600 * 1000;

export function createRemote({
  room,
  onSettings,
  onEvent = () => {},
  onStatus = () => {},
  fetchFn = globalThis.fetch,
  ES = globalThis.EventSource,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  debounceMs = 700,
  now = Date.now,
} = {}) {
  const live = Boolean(room);
  const url = BASE + topicFor(room);
  let es = null, pending = null, timer = null, blockedUntil = 0;
  const status = (ok, reason) => { try { onStatus({ source: 'room', ok, reason }); } catch { /* ignore */ } };
  // ntfy.sh answers 429 past its daily limit: say so once and pause, never retry in a storm.
  const blocked = () => now() < blockedUntil;
  function failed(r) {
    const code = r && r.status;
    let wait = code === 429 ? 60000 : 10000;
    const ra = Number(r && r.headers && r.headers.get && r.headers.get('retry-after'));
    if (Number.isFinite(ra) && ra > 0) wait = Math.min(ra * 1000, 600000);
    blockedUntil = now() + wait;
    status(false, 'http ' + code);
  }
  const deliver = (s) => { if (s && typeof s === 'object') onSettings(s); };

  async function start() {
    if (!live) return;
    // Newest cached snapshot first (the overlay may start long after the last change).
    try {
      const r = await fetchFn(url + '/json?poll=1&since=all');
      if (r.ok) {
        const lines = (await r.text()).split('\n').map(parse);
        const all = lines.map(settingsOf).filter(Boolean);
        if (all.length) deliver(all[all.length - 1]);
        const rm = lines.map(bodyOf).filter((b) => isEvent(b) && b.type === 'replay-match' && now() - Number(b.t) <= REPLAY_MAX_AGE_MS).pop();
        if (rm) { try { onEvent(rm.type, rm.payload); } catch { /* ignore */ } }
      }
      status(true);
    } catch (e) { status(false, 'sync offline'); }
    // Then live updates; EventSource reconnects by itself.
    if (typeof ES === 'function') {
      es = new ES(url + '/sse');
      es.onmessage = (ev) => {
        const b = bodyOf(parse(ev && ev.data));
        if (isEvent(b)) { try { onEvent(b.type, b.payload); } catch { /* ignore */ } } else deliver(b);
      };
      es.onerror = () => status(false, 'sync reconnecting');
      es.onopen = () => status(true);
    }
  }

  async function flush() {
    timer = null;
    if (blocked()) { pending = null; return; }
    const body = JSON.stringify(stripSecrets(pending));
    pending = null;
    try {
      const r = await fetchFn(url, { method: 'POST', body });
      if (r && r.ok) status(true); else failed(r);
    } catch (e) { status(false, 'sync offline'); }
  }

  function publish(settings) {
    if (!live) return;
    pending = settings;
    if (timer) clearTimer(timer);
    timer = setTimer(flush, debounceMs);
  }

  // Live events go out at once (no debounce); old ones are never replayed from the cache.
  async function publishEvent(type, payload) {
    if (!live || blocked()) return;
    try {
      const r = await fetchFn(url, { method: 'POST', body: JSON.stringify({ kind: 'event', type, payload, t: Date.now() }) });
      if (r && !r.ok) failed(r);
    } catch { status(false, 'sync offline'); }
  }

  function stop() {
    if (timer) clearTimer(timer);
    if (es) es.close();
  }

  return { start, publish, publishEvent, stop };
}
