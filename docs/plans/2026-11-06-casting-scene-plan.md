# PDBull overlay — casting scene plan (CaptureAge + D · Chronicle reactions)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Owner rules in `~/.claude/CLAUDE.md` apply: fan out READY tasks, ≤8 agents, reviewers on sonnet, long jobs owned by the controller, never re-run a hang, headless captures one at a time (timeout 60) and never `taskkill /IM msedge.exe` (it kills Paul's browser — kill only your own PID tree).

**Status 2026-11-06 (execution session):** T1–T7 done and committed locally on main (8b374be … see `git log`), `npm test` green. T4's Paul gate (Funny doodles) and T8 (Paul's verdict on the set, push, OBS scene, live gate) are open. Rulings and gate results: `.superpowers/sdd/2026-11-06-casting-scene-plan/progress.md`.

**Goal:** an OBS "Casting" scene for any AoE2 match cast through CaptureAge. It shows Paul's cam + chat, alerts, and six hand-fired reactions (Blunder, Funny, Wow, Wololo, Spotlight, GG) in the approved D · Chronicle style, driven from a new "Casting" card in the dock.

**Architecture:** the same engine as rounds 2–3. `overlay.html?scene=casting` mounts a different module set (`camchat`, `alerts`, new `reactions`). Pure rules live in `core/reactionlogic.js` (tested). The six effect factories move from `prototypes/casting/d-chronicle.js` into `modules/reactions-fx.js`. `modules/reactions.js` owns the canvas, the clock, sound and the tally. The dock sends `reaction` events over the existing bus/room and reads `casting-match` / `casting-tally` back over the local bus.

**Tech stack:** plain ES modules, no build, Canvas 2D + DOM + WebAudio, `node --test` (Node 24), aoe2companion API.

**Spec:** `docs/specs/2026-11-06-casting-scene-design.md` (approved by Paul 2026-11-06). Visual reference: `prototypes/casting/d-chronicle.html` (approved: "Arată frumos").

## Global constraints
- All on-screen text in English; talk to Paul in Romanian (informal "tu").
- Colours only from `shared/tokens.css`. Amber `#ffb347` only in Wow, oxblood `#6e1a12` / `#8a2418` only in Blunder, the player colour muted ~30 % and only as an accent. No objects (plaques, seals, scrolls, cards).
- Reactions stay in the CA play area y 150–850 (1920×1080). Darkening layers fade to 0 over the last 40 px at y 150 and y 850.
- No `mix-blend-mode`, no `backdrop-filter`: OBS composites the page over the CA capture as a separate source.
- No WebGL in reactions. The canvas runs no frames while idle.
- Module CSS is scoped under `[data-mod=name]`. Node tests never use a real BroadcastChannel, AudioContext or canvas.
- Every push that changes code bumps `version.json` (`"v": "YYYY-MM-DD.N"`) and lists every new file in `core/autoupdate.js` `CODE`.
- Never push, deploy or change OBS without Paul's yes for that action. OBS WebSocket 4455 is read-only for us (probes in `.superpowers/sdd/2026-11-05-round3-production-plan/obs/`).
- Edits whose text contains a backslash go through Edit/Write. Never pipe runs through `| tail`; Python runs with `-X utf8`.

## Facts checked while planning (2026-11-06)
| Fact | How it was checked |
|---|---|
| T1's test + implementation, extracted verbatim from this plan, pass in a scratch copy: `ℹ tests 10`, `ℹ pass 10` | dry run 2026-11-06 |
| Baseline `timeout 120 npm test` → `ℹ tests 191`, `ℹ pass 191`, `ℹ fail 0` | run, log `.superpowers/casting-baseline.log` |
| `GET https://data.aoe2companion.com/api/profiles?search=F1Re&page=1` → `{ profiles: [{ profileId: 196310, name: "F1Re", country: "br", games: "15669", … }], hasMore: true }` | curl, 2026-11-06 |
| `normalizeMatch(raw, profileId)` returns `{ id, running, mode, map, me, myTeam, enemies: [[…]] }`; players carry `{ profileId, name, civ, rating, colorHex, country }` | `core/aoe2.js:1-53` |
| The poller takes `profileId` once at creation (`createPoller({ profileId, … })`), so following another player means recreating it | `core/aoe2.js:101-114`, `overlay.html` |
| Alerts band: `[data-mod=alerts] .band { top: 40px }`. That overlaps CA's top bar (y < 118). | `modules/alerts.css:2` |
| Chat bottom: `chatBottom(n) = 190 + 24*(n-2)`, set as `--chat-bottom` | `core/camchatlogic.js:5-8`, `modules/camchat.js:43` |
| Prototype D imports only `PLAY` from the harness and uses `api.{ctx, rand, ease, player, x, y, tally, audio}` | grep of `prototypes/casting/d-chronicle.js` |
| `roomLinks(room, panelUrl)` returns `{ overlay, starting, brb, ending }`; `LOCAL_ONLY = new Set(['latest-snapshot'])` | `core/panelcore.js:28-31, 117` |
| CA keep-out zones, measured on Paul's captures at 1v1 / 2v2 / 3v3 / 4v4 (`.superpowers/ca/ca-*.webp`, git-ignored, 2000×1125 scaled to 1920×1080) | script over the pixels (saturated name rows in x 1520–1900) + visual check |
| Score rows top (y): 1v1 **894**, 2v2 **826**, 3v3 **719**, 4v4 **612**; x from ~1540 (4v4) / ~1575 (3v3) / ~1690 (1v1) to 1920 | same |
| Top bar incl. the team-game unit icons reaches y ≈ 134 (4v4); the clock sits at y 134 | visual, ca-4v4 |
| Bottom stats panel top: y ≈ 963 at 1v1/2v2; for x ≥ 1190 it rises to ≈ 914 (3v3) and ≈ 869 (4v4); minimap top ≈ 850 | visual |
| CA's own in-game chat appears at the left, x 0–330 × y ≈ 540–655 (3v3); it does not touch our cam (x 8–330, y 755–935) | visual, ca-3v3 |

## Real-data gates
| Heuristic / threshold | Real sample | Expected |
|---|---|---|
| Chat bottom in casting clears CA's score rows | `.superpowers/ca/ca-{1v1,2v2,3v3,4v4}.webp` as the harness background (`?bg=../../.superpowers/ca/ca-4v4.webp`) | `castingChatBottom(2/4/6/8)` = 198 / 266 / 373 / 480 (= 1080 − rows top + 12). The lowest chat line sits above the first CA score row in every capture. |
| Reactions never darken CA's score rows | the same captures, Spotlight + Blunder + GG stills | `caKeepOut(n)` rect stays undimmed (soft 30 px edge) |
| Alerts clear CA's top bar | an alert demo (`?demo=sub`) with `scene=casting` over a CA capture | band top ≥ 150 px; no alert pixel above y 118 |
| Follow-player search | `searchEntries(json)` on the live response for "F1Re" | first entry `{ profileId: 196310, name: 'F1Re' }` |
| Followed player's live match feeds the player buttons | the poller with `profileId` 196310 during one of F1Re's games (or his latest match) | `playersFromMatch` gives ≥ 2 teams, every player with a `#rrggbb` colour |

## Dependency map
| Task | depends | parallel with |
|---|---|---|
| T1 reactionlogic | — | T2 |
| T2 panelcore links + local events | — | T1 |
| T3 reactions module (port + engine) | T1 | T5, T6 |
| T4 Funny doodles redraw (Paul gate) | T3 | T5, T6 |
| T5 overlay `scene=casting` + settings + offsets | T1 | T3, T6 |
| T6 dock Casting card | T1, T2 | T3, T5 |
| T7 integration check + INSTALL.md | T3, T5, T6 | T4 |
| T8 Paul gates, push, OBS scene, live gate | T4, T7 + Paul's yes | — |

---

### Task 1: `core/reactionlogic.js` (pure rules)
depends: none

**Files:** Create `core/reactionlogic.js`, `tests/reactionlogic.test.js`.

**Interfaces — Produces:**
- `FX`, `DURATION`, `PLAY`, `ease`, `seeded(seed)`
- `clampPoint(x, y)`, `makeReaction(o)`, `replaces(current, incoming)`
- `createTally()` → `{ record, forMatch, reset, rows, awards }`
- `playersFromMatch(match)`, `parseManual(text)`, `searchUrl(name)`, `searchEntries(json)`
- `castingChatBottom(n)`, `caKeepOut(n)` → `{ x, y, w, h }` (n = players in the match)

- [ ] **Step 1: write the failing test** `tests/reactionlogic.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FX, DURATION, clampPoint, makeReaction, replaces, createTally, playersFromMatch, parseManual, searchUrl, searchEntries, seeded, castingChatBottom, caKeepOut } from '../core/reactionlogic.js';

test('six reactions with their lengths', () => {
  assert.deepEqual(FX, ['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg']);
  assert.deepEqual(DURATION, { blunder: 2.8, funny: 3.6, wow: 3.2, wololo: 2.6, spotlight: 4.5, gg: 8 });
});
test('clampPoint keeps text on screen and defaults to the play-area centre', () => {
  assert.deepEqual(clampPoint(NaN, undefined), { x: 960, y: 500 });
  assert.deepEqual(clampPoint(-50, 2000), { x: 60, y: 810 });
  assert.deepEqual(clampPoint(700, 400), { x: 700, y: 400 });
});
test('makeReaction validates fx, player and point', () => {
  assert.equal(makeReaction({ fx: 'nope' }), null);
  const r = makeReaction({ fx: 'wow', player: { name: 'F1Re', color: '#e0392e' }, x: 5, y: 5, id: 'a1' });
  assert.deepEqual(r, { fx: 'wow', player: { name: 'F1Re', color: '#e0392e' }, x: 60, y: 190, id: 'a1' });
  const bad = makeReaction({ fx: 'gg', player: { name: 'x'.repeat(40), color: 'red' }, id: 'b' });
  assert.equal(bad.player.name.length, 25);
  assert.equal(bad.player.color, '#d6c6a6');
  assert.equal(makeReaction({ fx: 'funny', id: 'c' }).player, null);
  assert.match(makeReaction({ fx: 'funny' }).id, /^r-/);
});
test('a new reaction replaces the current one, except over GG', () => {
  assert.equal(replaces(null, { fx: 'wow' }), true);
  assert.equal(replaces({ fx: 'blunder' }, { fx: 'wow' }), true);
  assert.equal(replaces({ fx: 'gg' }, { fx: 'wow' }), false);
  assert.equal(replaces({ fx: 'gg' }, { fx: 'gg' }), true);
});
test('tally counts per player, resets on a new match, awards go to the latest on ties', () => {
  const t = createTally();
  const a = { name: 'A', color: '#111111' }, b = { name: 'B', color: '#222222' };
  t.forMatch('m1');
  t.record('wow', a); t.record('wow', b); t.record('blunder', a); t.record('funny', b); t.record('spotlight', a);
  assert.deepEqual(t.rows().map((r) => [r.name, r.wows, r.blunders, r.funnies]), [['A', 1, 1, 0], ['B', 1, 0, 1]]);
  assert.equal(t.awards().play.name, 'B');      // tie 1-1: B was recorded later
  assert.equal(t.awards().blunder.name, 'A');
  t.forMatch('m1'); assert.equal(t.rows().length, 2);   // same match: kept
  t.forMatch('m2'); assert.equal(t.rows().length, 0);   // new match: reset
  assert.deepEqual(t.awards(), { play: null, blunder: null });
  t.record('wow', null); assert.equal(t.rows().length, 0); // no player: not counted
});
test('playersFromMatch lists teams with name and colour', () => {
  const p = (name, colorHex) => ({ name, colorHex });
  const m = { myTeam: [p('A', '#405BFF'), p('B', '#ffd700')], enemies: [[p('C', '#FF0000')], [p('D', 'bad')]] };
  assert.deepEqual(playersFromMatch(m), [
    { team: 1, players: [{ name: 'A', color: '#405BFF' }, { name: 'B', color: '#ffd700' }] },
    { team: 2, players: [{ name: 'C', color: '#FF0000' }] },
    { team: 3, players: [{ name: 'D', color: '#d6c6a6' }] },
  ]);
  assert.deepEqual(playersFromMatch(null), []);
});
test('follow-player search: url and entries', () => {
  assert.equal(searchUrl('F1 Re'), 'https://data.aoe2companion.com/api/profiles?search=F1%20Re&page=1');
  const json = { profiles: [{ profileId: 196310, name: 'F1Re', country: 'br', games: '15669' }, { name: 'no id' }] };
  assert.deepEqual(searchEntries(json), [{ profileId: 196310, name: 'F1Re', country: 'br', games: 15669 }]);
  assert.deepEqual(searchEntries(null), []);
});
test('manual players: one "Name #rrggbb" per line, up to 8, one team', () => {
  assert.deepEqual(parseManual('Hera #2fbf4a\n  TaToH \nbad line #zz\n'), [
    { team: 1, players: [{ name: 'Hera', color: '#2fbf4a' }, { name: 'TaToH', color: '#d6c6a6' }, { name: 'bad line #zz', color: '#d6c6a6' }] }]);
  assert.deepEqual(parseManual(''), []);
  assert.equal(parseManual(Array.from({ length: 12 }, (_, i) => 'P' + i).join('\n'))[0].players.length, 8);
});
test('CA score rows: chat bottom and keep-out grow with the player count (measured 2026-11-06)', () => {
  assert.deepEqual([2, 4, 6, 8].map(castingChatBottom), [198, 266, 373, 480]);
  assert.equal(castingChatBottom(3), 232);          // halfway between 2 and 4
  assert.equal(castingChatBottom(0), 198); assert.equal(castingChatBottom(20), 480);
  assert.deepEqual(caKeepOut(8), { x: 1520, y: 600, w: 400, h: 370 });
  assert.deepEqual(caKeepOut(2), { x: 1670, y: 882, w: 250, h: 88 });
});
test('seeded is deterministic', () => {
  const a = seeded(7), b = seeded(7);
  assert.equal(a(), b()); assert.equal(a(), b());
});
```
- [ ] **Step 2:** run `timeout 120 node --test tests/reactionlogic.test.js`. Expected: FAIL (`Cannot find module` … `reactionlogic.js`).
- [ ] **Step 3: implement** `core/reactionlogic.js`:
```js
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
```
- [ ] **Step 4:** run `timeout 120 node --test tests/reactionlogic.test.js`. Expected: all pass. Then `timeout 120 npm test` → `ℹ fail 0`.
- [ ] **Step 5:** commit `git add core/reactionlogic.js tests/reactionlogic.test.js` + `git commit -m "feat(casting): reaction rules, tally and follow-player search"`.

### Task 2: dock links and local-only events
depends: none

**Files:** Modify `core/panelcore.js:28-31` (roomLinks) and `core/panelcore.js:117` (LOCAL_ONLY); Modify `tests/panel.test.js`.

**Interfaces — Produces:**
- `roomLinks(...).casting` = `<base>/overlay.html?room=<room>&scene=casting`
- `LOCAL_ONLY` also contains `'casting-match'` and `'casting-tally'`, which never go to the room. `reaction` still travels local first, then room.

- [ ] **Step 1: failing test** (append to `tests/panel.test.js`; `createSender` must be added to its import line):
```js
test('casting link and local-only casting events', async () => {
  assert.equal(roomLinks('abc', 'https://pdbultoc.github.io/pdbull-overlay/panel.html').casting,
    'https://pdbultoc.github.io/pdbull-overlay/overlay.html?room=abc&scene=casting');
  const sent = []; const bus = { emit: (n) => sent.push('bus:' + n) };
  const remote = { publishEvent: async (n) => sent.push('room:' + n) };
  const send = createSender({ bus, remote });
  await send('casting-tally', {}); await send('casting-match', {}); await send('reaction', {});
  assert.deepEqual(sent, ['bus:casting-tally', 'bus:casting-match', 'bus:reaction', 'room:reaction']);
});
```
- [ ] **Step 2:** run `timeout 120 node --test tests/panel.test.js`. Expected: FAIL (`casting` undefined).
- [ ] **Step 3: implement:**
  - in `roomLinks`, return `{ overlay: at('overlay.html'), starting: …, brb: …, ending: …, casting: new URL('overlay.html' + q + '&scene=casting', panelUrl).href }`;
  - `const LOCAL_ONLY = new Set(['latest-snapshot', 'casting-match', 'casting-tally']);`
- [ ] **Step 4:** run `timeout 120 npm test`. Expected: `ℹ fail 0`.
- [ ] **Step 5:** commit `feat(casting): casting room link, casting status events stay local`.

### Task 3: `modules/reactions.js` + `modules/reactions-fx.js`
depends: T1

**Files:** Create `modules/reactions-fx.js`, `modules/reactions.js`, `modules/reactions.css`, `tests/reactions.test.js`. Modify `core/autoupdate.js` `CODE` to add the three new module files + `core/reactionlogic.js`.

**Interfaces:**
- Consumes (T1): `FX`, `DURATION`, `PLAY`, `ease`, `seeded`, `makeReaction`, `replaces`, `createTally`, `playersFromMatch`.
- Produces:
  - `EFFECTS` (from `reactions-fx.js`), the six factories `make(api) → { duration, render(t), dispose?() }`, where `api = { ctx, dom, W, H, player, x, y, rand, audio, tally, ease, PLAY }`;
  - `mount(layer, { bus, cfg, settings, latest }) → { unmount(), debug: { fire(o), activeFx(), tally } }`;
  - bus: listens for `reaction`, `match-running`, `casting-reset`; emits `casting-tally` `{ rows, awards }` and `casting-match` `{ teams, matchId, map }`.

- [ ] **Step 1: port the effects.** Copy `prototypes/casting/d-chronicle.js` to `modules/reactions-fx.js` unchanged, except:
  - line 3 becomes `import { PLAY } from '../core/reactionlogic.js';`;
  - each effect's `duration` must equal `DURATION[name]` (import `DURATION` and use it).
  
  Run `node --check modules/reactions-fx.js`.
- [ ] **Step 2: failing engine test** `tests/reactions.test.js`. It drives the module with fakes; no canvas, AudioContext or rAF. `mount` takes the injectables `opts.raf`, `opts.now`, `opts.makeCanvas`, `opts.effects` and `opts.audio`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWith } from '../modules/reactions.js';

function fakeBus() { const h = new Map(), out = []; return { out,
  on: (t, f) => { (h.get(t) || h.set(t, new Set()).get(t)).add(f); return () => h.get(t).delete(f); },
  emit: (t, p) => { out.push([t, p]); (h.get(t) || []).forEach((f) => f(p)); } }; }
function rig() {
  let t = 0; const frames = []; const log = [];
  const effects = Object.fromEntries(['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg'].map((k) =>
    [k, (api) => ({ duration: 1, render: (tt) => log.push([k, +tt.toFixed(2), api.player && api.player.name]), dispose: () => log.push([k, 'end']) })]));
  const ctx = { clearRect() {}, save() {}, restore() {} };
  const layer = { appendChild() {}, ownerDocument: null };
  const bus = fakeBus();
  const h = mountWith(layer, { bus, cfg: {}, settings: { get: () => ({ casting: { sound: false, volume: 0.5 } }) } },
    { effects, raf: (f) => frames.push(f), now: () => t, makeCanvas: () => ({ getContext: () => ctx, style: {} }), makeDom: () => ({ remove() {}, style: {} }), audio: () => null });
  const step = (ms) => { t += ms; const f = frames.splice(0); f.forEach((fn) => fn()); };
  return { h, bus, log, step, frames };
}
test('a reaction plays for its duration, then the loop stops (idle = no frames)', () => {
  const r = rig();
  r.bus.emit('reaction', { fx: 'wow', player: { name: 'A', color: '#111111' }, id: 'x1' });
  r.step(500); r.step(400); r.step(200);
  assert.ok(r.log.some((l) => l[0] === 'wow' && l[2] === 'A'));
  assert.ok(r.log.some((l) => l[0] === 'wow' && l[1] === 'end'));
  r.step(16); assert.equal(r.frames.length, 0);
});
test('duplicate ids are ignored, GG is not replaced by other reactions', () => {
  const r = rig();
  r.bus.emit('reaction', { fx: 'gg', id: 'g' }); r.bus.emit('reaction', { fx: 'gg', id: 'g' });
  r.step(16);
  r.bus.emit('reaction', { fx: 'wow', id: 'w' }); r.step(16);
  assert.equal(r.h.debug.activeFx(), 'gg');
});
test('tally: counted per player, reset on a new match id, published on the bus', () => {
  const r = rig();
  r.bus.emit('match-running', { match: { id: 'm1', map: 'Arabia', myTeam: [{ name: 'A', colorHex: '#111111' }], enemies: [[{ name: 'B', colorHex: '#222222' }]] } });
  assert.ok(r.bus.out.some(([t, p]) => t === 'casting-match' && p.matchId === 'm1' && p.teams.length === 2));
  r.bus.emit('reaction', { fx: 'blunder', player: { name: 'A', color: '#111111' }, id: 'b1' });
  const last = r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1];
  assert.equal(last.rows[0].blunders, 1);
  r.bus.emit('match-running', { match: { id: 'm2', myTeam: [], enemies: [] } });
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows.length, 0);
  r.bus.emit('casting-reset', {});
  assert.equal(r.bus.out.filter(([t]) => t === 'casting-tally').pop()[1].rows.length, 0);
});
```
- [ ] **Step 3:** run `timeout 120 node --test tests/reactions.test.js`. Expected: FAIL (module missing).
- [ ] **Step 4: implement** `modules/reactions.js`:
```js
/* Reactions module (casting scene): plays the D · Chronicle reactions fired from the dock.
   No frames while idle; one effect at a time (replace rule in core/reactionlogic.js).
   mount(layer, { bus, settings }) -> { unmount(), debug } */
import { makeReaction, replaces, createTally, playersFromMatch, seeded, ease, PLAY } from '../core/reactionlogic.js';
import { EFFECTS } from './reactions-fx.js';
const W = 1920, H = 1080, FADE = 0.15;

export function mountWith(layer, { bus, settings }, opts = {}) {
  const effects = opts.effects || EFFECTS;
  const raf = opts.raf || ((f) => requestAnimationFrame(f));
  const now = opts.now || (() => performance.now());
  const doc = layer.ownerDocument || globalThis.document;
  const canvas = opts.makeCanvas ? opts.makeCanvas() : Object.assign(doc.createElement('canvas'), { width: W, height: H });
  canvas.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none`;
  layer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const makeDom = opts.makeDom || (() => { const d = doc.createElement('div'); d.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; layer.appendChild(d); return d; });
  let AC = null;
  const audio = opts.audio || (() => {
    const s = (settings.get().casting) || {};
    if (!s.sound) return null;
    try { AC = AC || new AudioContext(); if (AC.state === 'suspended') AC.resume(); } catch { return null; }
    return AC;
  });
  const tally = createTally();
  const seen = new Set();
  let cur = null, outgoing = null, looping = false, dead = false;

  const publishTally = () => bus.emit('casting-tally', { rows: tally.rows(), awards: tally.awards() });
  function start(r) {
    const dom = makeDom();
    const a = audio();
    const api = { ctx, dom, W, H, player: r.player, x: r.x, y: r.y, rand: seeded(hash(r.id)), audio: a,
      tally: tally.rows(), ease, PLAY, volume: ((settings.get().casting) || {}).volume ?? 0.7 };
    return { r, inst: effects[r.fx](api), dom, t0: now() };
  }
  function end(e) { if (!e) return; try { e.inst.dispose && e.inst.dispose(); } catch {} e.dom.remove && e.dom.remove(); }
  function frame() {
    looping = false; if (dead) return;
    ctx.clearRect(0, 0, W, H);
    const tNow = now();
    if (outgoing) {
      const k = (tNow - outgoing.cut) / 1000 / FADE;
      if (k >= 1) { end(outgoing); outgoing = null; }
      else { ctx.save(); ctx.globalAlpha = 1 - k; outgoing.inst.render((tNow - outgoing.t0) / 1000); ctx.restore(); }
    }
    if (cur) {
      const t = (tNow - cur.t0) / 1000;
      if (t > cur.inst.duration) { end(cur); cur = null; }
      else { ctx.save(); cur.inst.render(t); ctx.restore(); }
    }
    if (cur || outgoing) { looping = true; raf(frame); }
  }
  const kick = () => { if (!looping) { looping = true; raf(frame); } };

  function fire(o) {
    const r = makeReaction(o);
    if (!r || seen.has(r.id)) return;
    seen.add(r.id); if (seen.size > 200) seen.delete(seen.values().next().value);
    if (cur && !replaces(cur.r, r)) return;
    if (r.fx !== 'gg') { tally.record(r.fx, r.player); publishTally(); }
    if (cur) { end(outgoing); outgoing = { ...cur, cut: now() }; }
    cur = start(r); kick();
  }
  const offs = [
    bus.on('reaction', fire),
    bus.on('match-running', (p) => {
      const m = p && p.match; if (!m) return;
      tally.forMatch(m.id); publishTally();
      bus.emit('casting-match', { matchId: m.id, map: m.map || '', teams: playersFromMatch(m) });
    }),
    bus.on('casting-reset', () => { tally.reset(); publishTally(); }),
  ];
  return {
    unmount() { dead = true; offs.forEach((f) => f && f()); end(cur); end(outgoing); canvas.remove && canvas.remove(); if (AC) AC.close().catch(() => {}); },
    debug: { fire, activeFx: () => (cur ? cur.r.fx : null), tally },
  };
}
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function mount(layer, deps) { return mountWith(layer, deps); }
```
  Keep-out: `mountWith` keeps `players` = the player count of the last `match-running` (default 2). It passes `api.keepOut = caKeepOut(players)`. In `reactions-fx.js`, every full-area darkening layer (the Spotlight dim, the Blunder candle-flinch, the GG dark wash) ends with a soft punch-out of that rect on its own canvas pixels: `ctx.globalCompositeOperation = 'destination-out'` with a 30 px feathered rect. That is allowed, because it only erases our own pixels.
  `bus.on` returns an unsubscribe function (`core/bus.js:74-78`), so `offs.forEach((f) => f())` is right. Volume: in `modules/reactions-fx.js` the sound helper builds one master gain (`master.gain.value = 0.65`, prototype line 107). Change it to `0.65 * (api.volume ?? 0.7)`.
  
  `modules/reactions.css`: `[data-mod=reactions] { position: absolute; inset: 0; pointer-events: none; }`
- [ ] **Step 5:** run `timeout 120 node --test tests/reactions.test.js` and then `timeout 120 npm test`. Expected: `ℹ fail 0`.
- [ ] **Step 6:** commit `feat(casting): reactions module (D Chronicle effects, replace rule, tally)`.

### Task 4: redraw the Funny marginalia (visual, Paul gate)
depends: T3

**Files:** Modify `modules/reactions-fx.js` (the `funny` factory and its figure helpers only). Optional review copy: `prototypes/casting/d-chronicle.js`, same change.

- [ ] **Step 1:** redraw the three scenes (villager chasing a chicken, sheep chasing a knight, monk falling off a donkey) as medieval-margin drolleries, not stick figures:
  - figures 170–200 px tall in y 640–840;
  - bodies with volume: an ivory-200 fill at ~0.85, cross-hatching for shade, ivory/brass 3.5 px lines over a 7 px walnut under-stroke;
  - faces with a readable expression (wide eyes, open mouth);
  - 3-pose flip-book at 6 fps.
  
  Keep the timings (3.6 s), the chronicler line and the name.
- [ ] **Step 2:** the controller takes stills at t = 1.2 / 2.4 / 3.2 over the CA mock (in-app browser `prototypes/casting/d-chronicle.html?fx=funny&t=2.4` after the prototype copy is synced). At most 2 rounds of controller fixes.
- [ ] **Step 3:** **Paul's gate**: he gets the link and the stills, and gives a yes or changes. On "no" after 2 rounds, ask Paul which one scene he likes best and keep only that one.
- [ ] **Step 4:** commit `feat(casting): detailed Funny marginalia`.

### Task 5: `overlay.html?scene=casting`, settings, offsets
depends: T1

**Files:**
- Modify `core/settings.js` (DEFAULTS), `core/registry.js`, `overlay.html` (sync + poller), `modules/alerts.css`, `modules/camchat.js:43`.
- Tests: `tests/settings.test.js`, a new `tests/registry.test.js`.

**Interfaces — Produces:**
- `DEFAULTS.casting = { followProfileId: null, followName: '', manual: '', sound: true, volume: 0.7 }` and `DEFAULTS.modules.reactions = { enabled: true }`;
- `modulesFor(scene)` in `core/registry.js`: `'casting'` → `['camchat', 'alerts', 'reactions']`, anything else → `['camchat', 'intro', 'alerts', 'matchbar']`;
- `<body class="scene-casting">` when `scene=casting`.

- [ ] **Step 1: failing tests:**
```js
// tests/registry.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, modulesFor } from '../core/registry.js';
test('casting scene mounts camchat, alerts and reactions only', () => {
  assert.deepEqual(modulesFor('casting'), ['camchat', 'alerts', 'reactions']);
  assert.deepEqual(modulesFor(''), MODULES);
  assert.ok(!MODULES.includes('reactions'));
});
```
```js
// append to tests/settings.test.js
test('casting defaults', () => {
  const s = createSettings(mem());
  assert.deepEqual(s.get().casting, { followProfileId: null, followName: '', manual: '', sound: true, volume: 0.7 });
  assert.equal(s.get().modules.reactions.enabled, true);
});
```
  `mem()` is the in-memory storage helper already defined at the top of `tests/settings.test.js`.
- [ ] **Step 2:** run `timeout 120 npm test`. Expected: the two new tests FAIL.
- [ ] **Step 3: implement:**
  - `core/registry.js`:
    ```js
    export const MODULES = ['camchat', 'intro', 'alerts', 'matchbar'];
    export const modulesFor = (scene) => (scene === 'casting' ? ['camchat', 'alerts', 'reactions'] : MODULES);
    ```
  - `core/settings.js`: add `casting: { followProfileId: null, followName: '', manual: '', sound: true, volume: 0.7 }` at the top level and `reactions: { enabled: true }` in `modules`.
  - `overlay.html`:
    - import `modulesFor`;
    - `const SCENE = q.get('scene') || '';`
    - `if (SCENE === 'casting') document.body.classList.add('scene-casting');`
    - in `sync()` loop over `modulesFor(SCENE)` instead of `MODULES`, and unmount anything live that is not in that list.
    - Poller: wrap the creation in `function makePoller(id)`, using `profileId: id` and the same callbacks as today. Start with `const followId = () => (SCENE === 'casting' && settings.get().casting.followProfileId) || settings.get().profileId;`.
    - In `settings.onChange`: if `followId()` differs from the current poller id, call `poller.stop()`, recreate it and `start()`. `latest: () => poller.latest()` must read the current poller (use a `let`).
  - `modules/alerts.css`: add `body.scene-casting [data-mod=alerts] .band { top: 150px; }`
  - `modules/camchat.js:43`: `const setBottom = (n) => root.style.setProperty('--chat-bottom', (document.body.classList.contains('scene-casting') ? castingChatBottom(n) : chatBottom(n)) + 'px');` Import `castingChatBottom` from `../core/reactionlogic.js`.
- [ ] **Step 4:** run `timeout 120 npm test`. Expected: `ℹ fail 0`.
- [ ] **Step 5:** commit `feat(casting): scene=casting module set, follow-player poller, alert/chat offsets`.

### Task 6: dock "Casting" card
depends: T1, T2

**Files:**
- Modify `panel.js` (new card after `bannerCard`, and the copy button wiring at lines 166–169), `panel.html` (a `copyCasting` button next to `copyEnd`), `panel.css`.
- Test: extend `tests/panel.test.js` only for pure helpers. The DOM is checked by the controller in T7.

**Interfaces:**
- Consumes: `FX`, `makeReaction`, `searchUrl`, `searchEntries`, `clampPoint` (T1); `links.casting`, `send` (T2).
- Produces: the dock emits `reaction` (via `send`) and `casting-reset` (via `send`), and writes `casting.followProfileId`, `casting.followName`, `casting.manual`, `casting.sound` and `casting.volume` through `write()`.

- [ ] **Step 1: implement** inside `boot()` in `panel.js`, after `bannerCard` (use the existing `el`, `card`, `field`, `check`, `write`, `getp`, `send` helpers):
```js
// --- Casting
let castTeams = [], castPick = null, castPoint = { x: 960, y: 500 };
const playersBox = el('div', { class: 'cast-players' });
const tallyBox = el('div', { class: 'cast-tally' });
const drawPlayers = () => {
  playersBox.replaceChildren(...castTeams.map((t) => el('div', { class: 'cast-team' }, t.players.map((p) =>
    el('button', { type: 'button', class: 'cast-p' + (castPick && castPick.name === p.name ? ' on' : ''), style: `--pc:${p.color}`, text: p.name,
      onclick: () => { castPick = p; drawPlayers(); } })))));
};
bus.on('casting-match', (m) => { castTeams = (m && m.teams) || []; if (castPick && !castTeams.some((t) => t.players.some((p) => p.name === castPick.name))) castPick = null; drawPlayers(); });
bus.on('casting-tally', (s) => { tallyBox.replaceChildren(...((s && s.rows) || []).map((r) =>
  el('div', { style: `color:${r.color}`, text: `${r.name} · B ${r.blunders} · W ${r.wows} · F ${r.funnies}` }))); });
const fireR = (fx) => { const r = makeReaction({ fx, player: castPick, x: castPoint.x, y: castPoint.y }); if (r) send('reaction', r); };
const LABEL = { blunder: 'Blunder', funny: 'Funny', wow: 'Wow', wololo: 'Wololo', spotlight: 'Spotlight', gg: 'GG' };
const fxBtns = el('div', { class: 'btns cast-fx' }, FX.map((fx, i) => el('button', { type: 'button', class: fx === 'gg' ? 'pri' : '', text: `${i + 1} ${LABEL[fx]}`, onclick: () => fireR(fx) })));
const pad = el('div', { class: 'cast-pad', title: 'Click = where Wow / Wololo / Spotlight start' });
const dot = el('span', { class: 'cast-dot' }); pad.append(dot);
const placeDot = () => { dot.style.left = (castPoint.x / 19.2) + '%'; dot.style.top = (castPoint.y / 10.8) + '%'; };
pad.addEventListener('click', (e) => { const r = pad.getBoundingClientRect(); castPoint = clampPoint((e.clientX - r.left) / r.width * 1920, (e.clientY - r.top) / r.height * 1080); placeDot(); });
placeDot();
const search = el('input', { type: 'text', placeholder: 'Follow player (name)' });
const results = el('div', { class: 'cast-results' });
const followed = el('div', { class: 'dim' });
const showFollowed = () => { followed.textContent = getp('casting.followProfileId') ? `Following ${getp('casting.followName')} (${getp('casting.followProfileId')})` : 'Following: my own games'; };
refreshers.push(showFollowed); showFollowed();
search.addEventListener('change', async () => {
  results.textContent = '…';
  try { const j = await (await fetch(searchUrl(search.value.trim()))).json();
    results.replaceChildren(...searchEntries(j).map((p) => el('button', { type: 'button', text: `${p.name} · ${p.country} · ${p.games} games`,
      onclick: () => { write('casting.followProfileId', p.profileId); write('casting.followName', p.name); results.replaceChildren(); showFollowed(); } })));
  } catch { results.textContent = 'Search failed — try again'; }
});
// Manual fallback: used only while the overlay has sent no casting-match with players.
const manual = el('textarea', { rows: '3', placeholder: 'Manual players, one per line: Name #rrggbb' });
manual.value = getp('casting.manual') || '';
manual.addEventListener('change', () => { write('casting.manual', manual.value); if (!castLive) { castTeams = parseManual(manual.value); drawPlayers(); } });
let castLive = false;
bus.on('casting-match', (m) => { castLive = !!(m && m.teams && m.teams.length); if (!castLive) { castTeams = parseManual(manual.value); drawPlayers(); } });
castTeams = parseManual(manual.value); drawPlayers();
const castingCard = card('Casting', [
  followed, el('div', { class: 'row' }, [search]), results, manual,
  el('div', { class: 'btns' }, [el('button', { type: 'button', text: 'Follow my own games', onclick: () => { write('casting.followProfileId', null); write('casting.followName', ''); showFollowed(); } })]),
  playersBox, fxBtns, pad, tallyBox,
  el('div', { class: 'btns' }, [el('button', { type: 'button', class: 'dng', text: 'Reset tally', onclick: () => send('casting-reset', {}) })]),
  check('Sound', 'casting.sound'), field('Volume', 'casting.volume', 'range', { min: '0', max: '1', step: '0.05' }),
]);
castingCard.tabIndex = 0;
castingCard.addEventListener('keydown', (e) => { if (/^[1-6]$/.test(e.key) && e.target.tagName !== 'INPUT') fireR(FX[+e.key - 1]); });
```
  - Append `castingCard` last in `panel.js:157`: `$('cards').append(startingCard, brbCard, ambienceCard, alertsCard, introCard, bannerCard, castingCard);`
  - Import `FX, makeReaction, parseManual, searchUrl, searchEntries, clampPoint` from `./core/reactionlogic.js`.
  - `panel.html`: add `<button type="button" id="copyCasting">Copy Casting link</button>` after `copyEnd`.
  - `panel.js`: add `$('copyCasting').addEventListener('click', copy(links.casting));`.
  - `panel.css`:
    ```css
    .cast-team { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
    .cast-p { border-left: 6px solid var(--pc); }
    .cast-p.on { outline: 2px solid var(--brass-300, #e3c48a); }
    .cast-fx button { min-width: 88px; }
    .cast-pad { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #2a1a10; border: 1px solid #57411f; margin: 6px 0; cursor: crosshair; }
    .cast-dot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #ffb347; }
    .cast-tally { font-size: 12px; }
    ```
- [ ] **Step 2:** run `timeout 120 npm test` → `ℹ fail 0`. Run `node --check panel.js`.
- [ ] **Step 3:** commit `feat(casting): dock Casting card (players, reactions, point pad, follow player, tally)`.

### Task 7: integration check + INSTALL.md (controller)
depends: T3, T5, T6

- [ ] **Step 1:**
  - Start the local server (`preview_start` name `pdbull-site`).
  - Open `panel.html?room=test` and `overlay.html?room=test&scene=casting&bg=1` in two tabs of the in-app browser. They share BroadcastChannel.
  - Click a player and each of the six reactions. Each one must play in the overlay tab.
  - Check that the tally appears in the dock and that GG shows the awards.
- [ ] **Step 2:** take stills of each reaction over a CA capture (`docs/ca/*.png` if Paul provided them; else the harness mock) and look at them yourself. Check:
  - nothing above y 118 or below y 965;
  - the chat clears the score lines;
  - an alert (`&demo=sub`) sits below the CA top bar.
- [ ] **Step 3: real-data gates** (the table above):
  - follow-player search for "F1Re" in the dock → picks `196310`;
  - the overlay poller switches to his matches (status dot OK) and the player buttons show his match;
  - over each of `.superpowers/ca/ca-{1v1,2v2,3v3,4v4}.webp` (`overlay.html?room=test&scene=casting&demo=1` cannot show a background image, so use `prototypes/casting/d-chronicle.html?bg=../../.superpowers/ca/ca-4v4.webp` for reactions, and a screenshot of the overlay page layered over the capture for chat): the lowest chat line is above CA's first score row, and Spotlight / Blunder / GG leave the score rows undimmed.
- [ ] **Step 4:** `docs/INSTALL.md`, new section **2e. Casting (CaptureAge)** (Romanian):
  - new OBS scene "Casting": CA Window Capture, under it Paul's camera at X 8, Y 755, 322×180, on top a Browser Source from **Copy Casting link**, 1920×1080, with **Control audio via OBS** on;
  - how to use the Casting card: follow player, click a player and then a reaction, the point pad, keys 1–6 while the dock has focus, Reset tally.
- [ ] **Step 5:**
  - bump `version.json`;
  - check that `core/autoupdate.js` `CODE` lists `core/reactionlogic.js`, `modules/reactions.js`, `modules/reactions-fx.js`, `modules/reactions.css`;
  - run `timeout 120 npm test` → `ℹ fail 0`;
  - commit `docs(casting): install steps, version bump`.

### Task 8: Paul's gates, push, OBS, live gate
depends: T4, T7, Paul's yes for each action

- [ ] **Step 1:** Paul's verdict on the finished set (links + stills). Fix whatever he asks for.
- [ ] **Step 2:** on Paul's yes, `git push`. Check that Pages serves the new `version.json`.
- [ ] **Step 3:** on Paul's yes, add the Casting scene in OBS. Paul adds it himself following INSTALL 2e, or Claude does it over WebSocket with `obs-apply.mjs` **only** if Paul asks for that explicitly. Back up first.
- [ ] **Step 4:** live gate: one casted match over real CA. Check:
  - reactions are readable;
  - nothing covers CA's HUD;
  - no visible skipped frames (`obs-meter.mjs` read-only while a reaction plays);
  - the sound level is right.
- [ ] **Step 5:** `docs/design.md` gets a "ROUND 4 — Casting" result line; tick this plan; write `.claude/NEXT.md`.
