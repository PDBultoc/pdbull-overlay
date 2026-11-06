// Casting reactions: pure rules shared by the dock, the reactions module and the tests. Browser module, no node imports.
export const FX = ['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg'];
export const DURATION = { blunder: 2.8, funny: 3.6, wow: 3.2, wololo: 2.6, spotlight: 4.5, gg: 8 };
export const PLAY = { x: 0, y: 150, w: 1920, h: 700 }; // CaptureAge play area at 1920x1080
const FALLBACK_COLOR = '#d6c6a6';
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => clamp(v, 0, 1);

export const ease = {
  out: (x) => 1 - Math.pow(1 - clamp01(x), 3), in: (x) => clamp01(x) ** 2,
  inOut: (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  back: (x) => { x = clamp01(x); const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  elastic: (x) => { x = clamp01(x); if (x === 0 || x === 1) return x; return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1; },
  win: (t, a, b) => clamp01((t - a) / (b - a)),
};
export function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

export function clampPoint(x, y) {
  return { x: Number.isFinite(x) ? clamp(x, 60, 1860) : 960, y: Number.isFinite(y) ? clamp(y, 190, 810) : 500 };
}
function cleanPlayer(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim()) return null;
  return { name: p.name.trim().slice(0, 25), color: HEX.test(p.color) ? p.color : FALLBACK_COLOR };
}
let n = 0;
export function makeReaction(o = {}) {
  if (!FX.includes(o.fx)) return null;
  const pt = clampPoint(o.x, o.y);
  return { fx: o.fx, player: cleanPlayer(o.player), x: pt.x, y: pt.y, id: typeof o.id === 'string' && o.id ? o.id : 'r-' + Date.now().toString(36) + '-' + (n++) };
}
export function replaces(current, incoming) {
  if (!current) return true;
  return current.fx !== 'gg' || incoming.fx === 'gg';
}

export function createTally() {
  let match = null, rows = [], seq = 0;
  const KEY = { blunder: 'blunders', wow: 'wows', funny: 'funnies' };
  const pick = (key, last) => rows.filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key] || b[last] - a[last])[0] || null;
  return {
    forMatch(id) { if (id !== match) { match = id; rows = []; } },
    reset() { rows = []; },
    record(fx, player) {
      const key = KEY[fx]; const p = cleanPlayer(player);
      if (!key || !p) return;
      let r = rows.find((x) => x.name === p.name);
      if (!r) { r = { name: p.name, color: p.color, blunders: 0, wows: 0, funnies: 0, lastBlunder: 0, lastWow: 0 }; rows.push(r); }
      r[key]++; seq++;
      if (fx === 'wow') r.lastWow = seq; if (fx === 'blunder') r.lastBlunder = seq;
    },
    rows: () => rows.map(({ name, color, blunders, wows, funnies }) => ({ name, color, blunders, wows, funnies })),
    awards() {
      const strip = (r) => r && { name: r.name, color: r.color, blunders: r.blunders, wows: r.wows, funnies: r.funnies };
      return { play: strip(pick('wows', 'lastWow')), blunder: strip(pick('blunders', 'lastBlunder')) };
    },
  };
}

export function playersFromMatch(match) {
  if (!match || !Array.isArray(match.myTeam)) return [];
  const teams = [match.myTeam, ...(match.enemies || [])];
  return teams.map((t, i) => ({ team: i + 1, players: t.map((p) => ({ name: p.name, color: HEX.test(p.colorHex) ? p.colorHex : FALLBACK_COLOR })) }))
    .filter((t) => t.players.length);
}
// CaptureAge score rows (measured on Paul's captures 2026-11-06, 1920x1080): top y per player count.
const CA_ROWS_TOP = { 2: 894, 4: 826, 6: 719, 8: 612 };
const CA_ROWS_X = { 2: 1690, 4: 1640, 6: 1575, 8: 1540 };
function caAt(table, n) {
  n = Math.min(8, Math.max(2, Math.round(Number(n)) || 2));
  if (table[n] != null) return table[n];
  return Math.round((table[n - 1] + table[n + 1]) / 2);
}
export const castingChatBottom = (n) => 1080 - caAt(CA_ROWS_TOP, n) + 12;
export const caKeepOut = (n) => { const top = caAt(CA_ROWS_TOP, n) - 12, x = caAt(CA_ROWS_X, n) - 20; return { x, y: top, w: 1920 - x, h: 970 - top }; };
export function parseManual(text) {
  const players = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => {
    const m = l.match(/^(.*\S)\s+(#[0-9a-f]{6})$/i);
    return m ? { name: m[1].slice(0, 25), color: m[2] } : { name: l.slice(0, 25), color: FALLBACK_COLOR };
  });
  return players.length ? [{ team: 1, players }] : [];
}
export const searchUrl = (name) => `https://data.aoe2companion.com/api/profiles?search=${encodeURIComponent(name)}&page=1`;
export function searchEntries(json) {
  const l = json && Array.isArray(json.profiles) ? json.profiles : [];
  return l.filter((p) => Number.isFinite(p.profileId)).slice(0, 8)
    .map((p) => ({ profileId: p.profileId, name: p.name, country: p.country || '', games: Number(p.games) || 0 }));
}
