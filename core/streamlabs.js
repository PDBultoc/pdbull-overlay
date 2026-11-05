// Streamlabs Socket API: the panel connects with Paul's socket token and turns
// raw events into the overlay's bus events (donation / follow / sub / bits).
// The token never leaves the panel; only the mapped events travel on.
// Shapes follow the Streamlabs docs; confirm against a recorded log (probes/streamlabs.html).

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v == null ? '' : String(v));
const fallbackId = (type, m) => [type, str(m.name), str(m.amount), str(m.created_at ?? m.months ?? '')].join(':');

// UNVERIFIED (I4, T10 checks these against Paul's real socket log): Streamlabs `sub_plan`
// ('1000' | '2000' | '3000' | 'Prime') carries the tier, `sub_type: 'subgift'` + `gifter` mark a
// gifted sub (believed to arrive once per recipient, `name` = recipient). Unknown or missing
// fields leave the event exactly as before (Tier 1, no gift).
const TIER = { 1000: '1', 2000: '2', 3000: '3' };
function subEvent(id, name, m) {
  const out = { type: 'sub', id, name, months: num(m.months) || 1, message: str(m.message) };
  const plan = str(m.sub_plan).trim();
  const tier = TIER[plan] || (/^prime$/i.test(plan) ? 'Prime' : null);
  if (tier) out.tier = tier;
  if (str(m.sub_type).toLowerCase() === 'subgift' && str(m.gifter).trim()) {
    out.gift = 1; out.name = str(m.gifter).trim(); out.recipient = name;
  }
  return out;
}

export function mapEvent(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.message)) return [];
  const t = raw.type;
  return raw.message.filter((m) => m && typeof m === 'object').map((m) => {
    const id = str(m._id || m.id || m.event_id) || fallbackId(t, m);
    const name = str(m.name || m.from);
    // Real log (T10): `name` is the RECIPIENT channel, the donor is `from`.
    if (t === 'donation') return { type: 'donation', id, name: str(m.from || m.from_display_name || m.name), amount: num(m.amount), currency: str(m.currency || 'USD'), message: str(m.message) };
    if (t === 'follow') return { type: 'follow', id, name };
    if (t === 'subscription' || t === 'resub') return subEvent(id, name, m);
    if (t === 'bits') return { type: 'bits', id, name, amount: num(m.amount), message: str(m.message) };
    return null;
  }).filter(Boolean);
}

// Stream Labels (most recent follower / donator / subscriber) may arrive on the same
// socket as type "streamlabels" / "streamlabels.underlying". The shape is NOT documented
// (checked 2026-11-01), so read it defensively: a value can be a string or {name, amount}.
const pick = (data, keys) => { for (const k of keys) if (data && data[k] != null && data[k] !== '') return data[k]; return null; };
// Stream Labels come formatted with the streamer's own template, e.g.
// "New Follower: drowsyduck", "Donation Nub: $10.00", "New Subscriber: kapten"
// (seen on a Streamlabs stream 2026-11-01; engine origin: goblin-overlay). Keep only the name.
export function cleanLabelName(s) {
  return String(s ?? '')
    .replace(/^\s*(new\s+|latest\s+|recent\s+|most\s+recent\s+)?(follower|follow|subscriber|sub|donation|donator|donor|tip|tipper|cheer|bits)s?\b\s*:?\s*/i, '')
    .replace(/\s*:\s*$/, '')
    .trim();
}

const asPerson = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') return v.name ? { name: cleanLabelName(v.name), amount: v.amount != null ? num(v.amount) : undefined, months: v.months != null ? num(v.months) : undefined } : null;
  const s = str(v).trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*\(?\s*[$€£]?\s*([\d.,]+)\s*\)?$/); // "Name ($10.00)" or "Name 10"
  const out = m && m[1] ? { name: cleanLabelName(m[1]), amount: num(m[2].replace(',', '.')) } : { name: cleanLabelName(s) };
  return out.name ? out : null;
};

export function mapLabels(raw) {
  if (!raw || typeof raw !== 'object' || !String(raw.type || '').startsWith('streamlabels')) return null;
  const d = (raw.message && (raw.message.data || raw.message)) || {};
  const f = asPerson(pick(d, ['most_recent_follower', 'twitch_most_recent_follower']));
  const dn = asPerson(pick(d, ['most_recent_donator', 'most_recent_donation']));
  const sb = asPerson(pick(d, ['most_recent_subscriber', 'twitch_most_recent_subscriber']));
  const out = {};
  if (f) out.follow = { name: f.name };
  if (dn) out.donation = { name: dn.name, amount: dn.amount ?? 0, currency: 'USD' };
  if (sb) out.sub = { name: sb.name, months: sb.months || 1 };
  return Object.keys(out).length ? out : null;
}

// socket.io v2 client (window.io) is loaded by the panel from cdnjs only when a token is set.
export function connectStreamlabs({ token, onEvent, onStatus = () => {}, io = globalThis.io, onRaw = null }) {
  if (!token || typeof io !== 'function') { onStatus({ source: 'streamlabs', ok: false, reason: token ? 'client not loaded' : 'no token' }); return { close() {} }; }
  const s = io('https://sockets.streamlabs.com?token=' + encodeURIComponent(token), { transports: ['websocket'] });
  s.on('connect', () => onStatus({ source: 'streamlabs', ok: true }));
  s.on('connect_error', () => onStatus({ source: 'streamlabs', ok: false, reason: 'cannot connect (token?)' }));
  s.on('disconnect', () => onStatus({ source: 'streamlabs', ok: false, reason: 'disconnected' }));
  s.on('event', (raw) => {
    if (onRaw) { try { onRaw(raw); } catch { /* keep going */ } }
    const labels = mapLabels(raw);
    if (labels) { try { onEvent({ type: 'latest-snapshot', latest: labels }); } catch { /* keep going */ } return; }
    for (const e of mapEvent(raw)) { try { onEvent(e); } catch { /* keep going */ } }
  });
  return { close: () => s.close() };
}
