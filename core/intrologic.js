// Pure logic for the match intro (modules/intro.js). Browser + node safe: no DOM, no three.
// Colour names mirror shared/campaign.js PLAYER_COLOURS (that file imports three, so node tests cannot load it).
export const COLOUR_NAMES = ['red', 'blue', 'green', 'yellow', 'teal', 'purple', 'grey', 'orange'];
// Hue anchors of the AoE2 DE player palette (#FF0000, #405BFF, #00FF00, #FFFF00, #00FFFF, #FF57B3/#FF00FF, #FF9600) -> pigment name.
const HUES = [['red', 0], ['orange', 35], ['yellow', 60], ['green', 120], ['teal', 180], ['blue', 230], ['purple', 300]];

export const MAX_PER_SIDE = 4;

function rgbOf(c) {
  if (typeof c === 'number' && Number.isFinite(c)) return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? '').trim()) || /^#?([0-9a-f]{3})$/i.exec(String(c ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nearest PLAYER_COLOURS name for an aoe2companion colorHex (hex string or number). Unknown input -> 'red'. */
export function colourName(c) {
  const rgb = rgbOf(c);
  if (!rgb) return 'red';
  const [r, g, b] = rgb.map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.2 * Math.max(mx, 0.001) || mx < 0.1) return 'grey';
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let best = 'red', bd = 1e9;
  for (const [n, a] of HUES) {
    const dist = Math.min(Math.abs(h - a), 360 - Math.abs(h - a));
    if (dist < bd) { bd = dist; best = n; }
  }
  return best;
}

const nm = (p) => (p && typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Player');

function sides(m) {
  const me = m.me || (m.myTeam || [])[0];
  const mine = [me, ...(m.myTeam || []).filter((p) => p && p !== me && (!me || p.profileId !== me.profileId))].filter(Boolean);
  const foes = (m.enemies || []).flat().filter(Boolean);
  return [mine.slice(0, MAX_PER_SIDE), foes.slice(0, MAX_PER_SIDE)];
}

/** normalized match (core/aoe2.js) -> { left:{names,colour}, right:{names,colour}, map, mode:'1v1'|'team' }; left = Paul's team. */
export function introFromMatch(m) {
  if (!m) return null;
  const [l, r] = sides(m);
  const has = (p) => !!(p && rgbOf(p.colorHex));
  // a side without a usable colorHex gets the prototype pair (blue vs green); equal sides never share a banner colour
  const lc = has(l[0]) ? colourName(l[0].colorHex) : 'blue';
  let rcol = has(r[0]) ? colourName(r[0].colorHex) : 'green';
  if (rcol === lc) rcol = ['green', 'red', 'yellow', 'teal'].find((c) => c !== lc);
  return {
    left: { names: l.map(nm), colour: lc },
    right: { names: r.map(nm), colour: rcol },
    map: (typeof m.map === 'string' && m.map.trim()) || 'Unknown map',
    mode: m.mode === '1v1' ? '1v1' : 'team',
  };
}

/** civ names in the same order as introFromMatch names; '' when the lobby hides civs */
export function introCivs(m) {
  if (!m) return { left: [], right: [] };
  const [l, r] = sides(m);
  const c = (p) => (m.hideCivs ? '' : (p && p.civ) || '');
  return { left: l.map(c), right: r.map(c) };
}

/** font px so that widthAt(px) <= maxW: shrink from base, floor at min, never grow. widthAt must be ~linear in px. */
export function fitSize(widthAt, maxW, base, min) {
  const w = widthAt(base);
  if (!(w > maxW)) return base;
  return Math.max(min, Math.floor((base * maxW) / w));
}

const KEY = 'pdbull-intro-played';
/** once per match id (sessionStorage-like store). Panel test ids ('test-...') always play. Records the id when it returns true. */
export function shouldPlay(storage, match) {
  if (!match || match.id == null) return false;
  const id = String(match.id);
  if (/^test-/.test(id)) return true;
  let seen = [];
  try { seen = JSON.parse((storage && storage.getItem(KEY)) || '[]'); if (!Array.isArray(seen)) seen = []; } catch { seen = []; }
  if (seen.includes(id)) return false;
  try { if (storage) storage.setItem(KEY, JSON.stringify([...seen, id].slice(-20))); } catch { /* storage unavailable: still play */ }
  return true;
}

/** 'play' (id recorded now), 'queue' (an intro is running: keep the match pending, nothing recorded) or 'skip' (already played / invalid). */
export function nextAction(storage, match, busy) {
  if (!match || match.id == null) return 'skip';
  const test = /^test-/.test(String(match.id));
  if (busy) {
    if (test) return 'queue';
    let seen = [];
    try { seen = JSON.parse((storage && storage.getItem(KEY)) || '[]'); if (!Array.isArray(seen)) seen = []; } catch { seen = []; }
    return seen.includes(String(match.id)) ? 'skip' : 'queue';
  }
  return shouldPlay(storage, match) ? 'play' : 'skip';
}

export const HOLD_AT = 3.9;
/** timeline time for wall time t when the intro should last `total` s instead of the base `base` s: the stamped state is held at HOLD_AT. */
export function stretchTime(t, total, base) {
  const extra = Math.max(0, total - base);
  if (t < HOLD_AT) return t;
  if (t < HOLD_AT + extra) return HOLD_AT;
  return t - extra;
}
