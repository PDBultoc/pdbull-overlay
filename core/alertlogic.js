// Pure alert logic (no DOM, no WebGL): tiers, durations, payload mapping, one-at-a-time queue.
export function bitsTier(n) { return n >= 1000 ? 'chest' : n >= 100 ? 'pile' : 'coins'; }

export function durationOf(a) { // seconds, design.md ROUND 2 section 7
  if (a.type === 'follow') return 4;
  if (a.type === 'sub') return 6;
  if (a.type === 'bits') return { coins: 5, pile: 6.5, chest: 8 }[bitsTier(a.amount)];
  const len = (a.message || '').length;
  return Math.min(12, 8 + Math.ceil(len / 60));
}

const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥', RON: 'RON ' };
// R3: currency symbol + amount; unknown currency -> 'XXX 10'
export function amountText(amount, currency) {
  const n = String(amount ?? '').trim();
  const c = String(currency || 'USD').toUpperCase();
  const s = SYMBOLS[c];
  if (s === undefined) return `${c} ${n}`;
  return s + n;
}

export const NAME_MAX = 25;
export const MSG_MAX = 800;
const TYPES = new Set(['follow', 'sub', 'bits', 'donation']);

function cleanName(v) {
  // eslint-disable-next-line no-control-regex
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(s || 'Anonymous').slice(0, NAME_MAX).join('');
}
function tierOf(t) {
  const s = String(t ?? '').toLowerCase();
  if (s === 'prime') return 'prime';
  if (/^[123]$/.test(s)) return s;
  const m = /^([123])000$/.exec(s);
  return m ? m[1] : '1';
}

// Bus payload -> the prototype's trigger fields (plus the original ones). null for anything unusable.
export function toAlert(p) {
  if (!p || typeof p !== 'object' || !TYPES.has(p.type)) return null;
  let message = typeof p.message === 'string' ? p.message : '';
  if (message.length > MSG_MAX) message = message.slice(0, MSG_MAX - 1) + '…';
  return {
    type: p.type, id: p.id, name: cleanName(p.name),
    amount: Math.max(0, Math.floor(Number(p.amount) || 0)),
    tier: tierOf(p.tier), months: Math.max(1, Math.floor(Number(p.months) || 1)),
    gift: Math.max(0, Math.floor(Number(p.gift) || 0)),
    amountText: amountText(p.amount, p.currency),
    message, msg: message,
  };
}

// FIFO, one at a time, dedup by id (last 200). play(a) returns a Promise. onIdle() fires when the queue runs dry.
// Safety: an alert still unfinished after timeoutOf(a) ms (default durationOf + 4 s) is ended via
// onTimeout(a) and the queue moves on. isHidden() true = the page is not drawing (OBS hid the source):
// the alert is dropped instead of stalling the queue and replaying as a backlog later.
export function createQueue({
  play, onIdle, onTimeout,
  timeoutOf = (a) => (durationOf(a) + 4) * 1000,
  isHidden = () => false,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const pending = [], seen = new Set(), order = [];
  let busy = false;
  function remember(id) {
    seen.add(id); order.push(id);
    if (order.length > 200) seen.delete(order.shift());
  }
  async function playOne(a) {
    let timer = 0;
    const guard = new Promise((resolve) => {
      timer = setTimer(() => {
        if (onTimeout) { try { onTimeout(a); } catch (e) { console.warn('alert timeout hook failed', e && e.message); } }
        resolve();
      }, timeoutOf(a));
    });
    try { await Promise.race([play(a), guard]); } finally { clearTimer(timer); }
  }
  async function pump() {
    if (busy) return;
    busy = true;
    while (pending.length) {
      const a = pending.shift();
      if (isHidden()) continue;
      try { await playOne(a); } catch (e) { console.warn('alert play failed', e && e.message); }
    }
    busy = false;
    if (onIdle) { try { onIdle(); } catch (e) { console.warn('alert idle failed', e && e.message); } }
  }
  return {
    push(a) {
      if (!a) return false;
      if (a.id != null && a.id !== '') { if (seen.has(a.id)) return false; remember(a.id); }
      pending.push(a);
      pump();
      return true;
    },
    get busy() { return busy; },
    get size() { return pending.length; },
  };
}
