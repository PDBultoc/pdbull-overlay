# PDBull stream overlay — production plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Owner rules in `~/.claude/CLAUDE.md` apply (fan out READY tasks, ≤8 agents, reviewers on sonnet, long jobs owned by the controller).

**Goal:** turn the approved round-2 prototypes (A1 Starting Soon, B2 BRB, D1 camera + chat, E3 match intro, F3 alerts) into the version Paul runs live in OBS Studio, hosted on GitHub Pages and controlled from an OBS dock.

**Architecture:** the goblin-overlay engine is copied in (not shared): ES modules, no build step, a settings store + event bus synced between the dock (`panel.html`) and the browser sources through the local bus AND an ntfy.sh room (`?room=`), `version.json` autoupdate. Three browser sources: `scenes/starting.html`, `scenes/brb.html` (full scenes), `overlay.html` (in-game: camera frame + chat always, intro and alerts mounted only while they play). The 3D comes from the prototypes' shared three.js modules, moved to `shared/`; every WebGL renderer exists only while its scene is visible.

**Tech stack:** plain ES modules, three@0.170.0 via jsdelivr importmap (as in `prototypes/*.html`), socket.io 2.3.0 from cdnjs (Streamlabs, dock only), `node --test` (Node 24), headless Edge capture (`docs/capture.md`).

**Spec:** `docs/design.md` — section "ROUND 2" overrides everything above it. Engine reference: `../goblin-overlay` (read its `.claude/NEXT.md` gotchas).

## Decisions taken (Paul, 2026-11-05: "Da, toate")
1. New public repo `PDBultoc/pdbull-overlay` + GitHub Pages; engine copied from goblin (no coupling to Goblin's live overlay).
2. Live scope = the 5 approved scenes + the "last follower" strip already in BRB/Starting. Goblin's other modules (match bar, result, challenges, music, series) are out of scope.
3. Alerts: Streamlabs socket (follow / sub / bits / donation); Paul pastes his socket token in the dock (never in code, never in the room). Sounds: the synthesised WebAudio sounds from the prototype, each replaceable by a URL field in the dock.
4. Intro: Paul's aoe2companion profile = **PDBull, profileId 551021** (from goblin `modules/series.js` / aoe2 wiki pa100.md). 1v1 = full seal scene; team games = same scene with team names on the two banners.
5. Token faces (painterly macro look) deferred; all other known gaps are fixed in this plan.
6. Performance: render on demand + a measured gate on Paul's PC.
7. First commit done (bc56cbc, local, branch `main`).

## Global constraints
- Every on-screen text is English. Nothing Romanian on screen (`docs/design.md` ROUND 2 §1). Talk to Paul in Romanian.
- AoE2 is the world; chess = one small prop only. No AoE2 game art: everything drawn by us (§2).
- Canvas 1920x1080 @ 60; game at 2560x1440 scaled; standard AoE2 DE HUD — nothing may cover the in-game score panel (chat bottom rule: y 890 for 2 players, 24 px higher per extra player, `camchat.js`).
- aoe2companion answers only from a browser (node/curl get 403 + rate limits) — never script it from the CLI; only `overlay.html` polls (one poller per stream, 20 s, `&_=` bucket).
- Twitch names up to 25 characters must fit every text slot.
- Streamlabs token stays in the dock's own storage; `stripSecrets` before anything is published to the room.
- Every push that changes code bumps `version.json` ("v": "YYYY-MM-DD.N").
- Module CSS scoped under `[data-mod=name]`; node tests never use a real BroadcastChannel (goblin gotchas).
- Edits with backslashes go through Edit/Write; no `| tail` / `| head` on runs; Python with `-X utf8`.
- Never push, create the repo, or deploy without Paul's yes (external actions).

## Real-data gates
| Heuristic / selector | Real sample | Expected |
|---|---|---|
| `normalizeMatch(raw, 551021)` picks Paul's side | `../goblin-overlay/tests/fixtures/pa100.json` (4 real Goblin–PDBull 1v1s) | `me.name === 'PDBull'`, `enemies[0][0].name === 'SwedishGoblinTwitch'`, map `Arabia` on match 0 |
| Intro for team games | `tests/fixtures/pdbull-tg.json`: one real TG page of Paul's history saved from the BROWSER (Task 8 step 1) | both banner name lists = real names, ≤4 per side, map name from `mapName` |
| Streamlabs `mapEvent` shapes | `tests/fixtures/streamlabs-paul.json`: Paul's own socket log of the 4 Streamlabs dashboard "Test" alerts (Task 10) | 4 events, types follow/sub/bits/donation, names and amounts non-empty |
| Bits tier selector | 49 / 50 / 99 / 100 / 999 / 1000 / 1500 | coins / coins / coins / pile / pile / chest / chest |
| Long name fit | `Extremely_Long_Name_25ch` in all 4 alerts + intro banners + chat | no glyph past its band (pixel check in capture) |
| Chat bottom from player count | real match with 2 and with 8 players (fixtures above) | `--chat-bottom` = 190 / 334 px |

## File structure (target)
```
index.html            links to the 4 pages (dev only)
panel.html, panel.js  OBS dock: room link, countdown, BRB text, Streamlabs token, sound URLs, tests, status dots
overlay.html          in-game source: mounts modules from core/registry.js
scenes/starting.html  A1 (+ .js/.css)        scenes/brb.html  B2 (+ .js/.css)
modules/camchat.js    D1 frame + chat         modules/intro.js  E3   modules/alerts.js  F3
core/*.js             copied from goblin (bus, settings, remote, autoupdate, aoe2, twitchchat, streamlabs, registry) + core/scene.js (render lifecycle) + core/alertlogic.js + core/intrologic.js
shared/war-table.js, shared/campaign.js, shared/tokens.css   moved from prototypes/shared
tests/*.test.js, tests/fixtures/
version.json, package.json, docs/INSTALL.md
prototypes/           frozen reference (round 2); not linked from production pages
```

## Dependency map
| Task | depends | owner |
|---|---|---|
| T0 Scaffold + engine copy | — | agent |
| T1 OBS dock↔source probe | T0 | Paul (5 min) |
| T2 Shared 3D fixes | T0 | agent |
| T3 Render lifecycle (`core/scene.js`) | T2 (same file war-table.js) | agent |
| T4 Dock panel + settings | T0 | agent |
| T5 Starting Soon scene | T3, T4 | agent |
| T6 BRB scene | T3, T4 | agent |
| T7 overlay.html + camchat module | T0, T4 | agent |
| T8 Intro module | T3, T7 | agent |
| T9 Alerts module | T3, T7 | agent |
| T10 Streamlabs real-data gate | T4 | Paul (5 min) + agent |
| T11 Visual sign-off sheet | T5, T6, T8, T9 | controller → Paul |
| T12 Repo + Pages + push | T11, Paul's yes | Paul creates repo, controller pushes |
| T13 OBS install guide | T12, T1 | agent |
| T14 Performance gate | T12, T13 | Paul + controller |
| T15 Live gate (one stream) | T14 | Paul |

READY at start: T0. After T0: T1, T2, T4 fan out. After T2→T3: T5, T6 (needs T4), T7 → T8, T9 in parallel. T10 any time after T4. Parallel writers never share a file: T5/T6/T8/T9 each own their files; `shared/*` belongs to T2/T3 only — later tasks report shared issues to the controller, never edit `shared/`.

## Risks (decided up front)
| Risk | Effect | Mitigation in plan |
|---|---|---|
| OBS dock and browser sources may not share localStorage/BroadcastChannel (unconfirmed for OBS, false for Streamlabs Desktop) | dock buttons do nothing | room sync via ntfy is always on (proven on Goblin); T1 tells us whether the local path also works; dedup by message id already exists |
| Hidden OBS browser sources keep rendering | GPU cost while gaming | guide: "Shutdown source when not visible" for starting/brb; `core/scene.js` stops rAF when `document.hidden` or idle |
| 3D intro/alerts over a 1440p game | dropped game/OBS frames | renderer created on demand, disposed after, DPR 1, bloom only on alerts that need it; T14 measures |
| SwiftShader capture is slow / kills renderer | flaky screenshots | `readPixels` after `advance()` (BRB builder's finding, add to capture.md in T3); ≤2 attempts per capture, then shorter `t` |
| aoe2companion 403/429 | no intro | backoff exists in createPoller; intro is cosmetic, dock shows aoe2 status dot |
| Pages deploy stuck (seen on goblin) | old code live | `gh api` cancel + rebuild recipe from goblin NEXT.md in T12 |

---

### T0: Scaffold + engine copy
**Files:** create `package.json`, `version.json`, `core/{bus,settings,remote,autoupdate,aoe2,twitchchat,streamlabs,registry}.js` (copied from `../goblin-overlay/core/`), `tests/{bus,bus-storage,settings,settings-echo,remote,autoupdate,aoe2,poller,twitchchat,streamlabs}.test.js` + `tests/fixtures/pa100.json` (copied); `git mv prototypes/shared/{war-table.js,campaign.js,tokens.css,game.webp} shared/` and fix the prototypes' imports to `../shared/`.
**Interfaces produced:** same exports as goblin (`createBus({name})`, `createSettings(storage, key)`, `createRemote({room,onSettings,onEvent,onStatus})`, `startAutoUpdate({...})`, `createPoller({profileId,...})`, `connect({channel,onMessage,onStatus})`, `connectStreamlabs({token,onEvent,onStatus})`, `mapEvent(raw)`), renamed: bus name `'pdbull'`, settings key `'pdbull.v1'`, bus key `'pdbull.bus'`, `topicFor = room => 'pdbull-' + room`.
- [ ] Copy files; replace `goblin` identifiers as listed (grep `-i goblin` in core/ and tests/ must print only comments that credit the origin).
- [ ] `core/settings.js` DEFAULTS replaced by:
```js
export const DEFAULTS = {
  profileId: 551021, pollSec: 20,
  scenes: { countdownEnd: null, countdownMin: 5, brbText: 'Be right back' },
  latest: { follower: '', subscriber: '', donation: '' },
  modules: {
    camchat: { enabled: true, channel: 'pdbull', lines: 7 },
    intro: { enabled: true, minSeconds: 6 },
    alerts: { enabled: true, follow: true, sub: true, bits: true, donation: true, sound: true,
      sounds: { follow: '', sub: '', bits: '', donation: '' }, streamlabsToken: '' },
  },
};
```
- [ ] `core/registry.js`: `export const MODULES = ['camchat','intro','alerts'];`
- [ ] `core/autoupdate.js` CODE list = the T-file-structure files (overlay.html, panel.html, panel.js, scenes/*.html/js/css, core/*.js, shared/*.js).
- [ ] Adapt tests to new names/defaults; add `tests/aoe2-pdbull.test.js`:
```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs'; import { normalizeMatch } from '../core/aoe2.js';
const L = JSON.parse(readFileSync(new URL('./fixtures/pa100.json', import.meta.url)));
test('PDBull side picked from a real match', () => {
  const m = normalizeMatch(L[0], 551021);
  assert.equal(m.me.name, 'PDBull'); assert.equal(m.enemies[0][0].name, 'SwedishGoblinTwitch'); assert.equal(m.map, 'Arabia');
});
```
- [ ] Run `timeout 60 npm test` → all green (goblin's suite ran this way, 96 green on 2026-11-03). Prototype pages still render (one capture of `prototypes/starting.html` per docs/capture.md, no console errors).
- [ ] Commit `chore: scaffold production tree, copy goblin engine`.

### T1: OBS dock ↔ browser source probe (Paul, ~5 min)
- [ ] Controller copies `../goblin-overlay/probes/{dock,source}.html` to `probes/`, renames the channel/key to `pdbull-probe`, serves the repo with preview_start "pdbull-proto" (port 8796).
- [ ] Paul: OBS → Docks → Custom Browser Docks → `http://127.0.0.1:8796/probes/dock.html`; Browser Source `http://127.0.0.1:8796/probes/source.html`; press Toggle 3x. Reports what the source shows.
- [ ] Record the answer in NEXT.md and docs/INSTALL.md notes: local path works / doesn't. Room sync stays on either way. Stop the preview server afterwards and prove port 8796 free.

### T2: Shared 3D fixes (`shared/war-table.js`, `shared/campaign.js`)
Builders' reports from round 2 (workflow wf_9472b6d9-67c). For each: capture before, fix, capture after (`shared/demo.html` scenes), controller views one contact sheet.
- [ ] `makeCandle({ lightOffset = 0.34 })`: point light at wax top + lightOffset, kept after `setHeight`; remove the page workarounds in starting.js / brb.js when T5/T6 port them.
- [ ] `enableDOF`: depth of field BEFORE bloom by default (brb.js reorders locally today).
- [ ] Fog: warmer default colour (no "snow" under the candle) + `map.userData.setFogOpacity(k)` (0..1) instead of pages poking `fogMeshes[i].material.userData.uniforms.uOpacity`.
- [ ] Map back edge: no pale wedges / jagged smear at the far edge (Starting review major, t=3/65/95) — fog-plane vs paper-curl clipping.
- [ ] Parchment must read warm parchment, not snow/ice, under a single warm candle (BRB review major): map material albedo/roughness/env.
- [ ] `PLAYER_COLOURS`: add `cloth` presets with deeper blue `0x14307f` and green `0x245a3a` for banners (intro + starting both found the muted blue grey).
- [ ] Props: `stone` with chiselled bevels/darker joints (reads as cubes); `wood` end grain less saturated.
- [ ] Gold coin flame reflection: leave (judged acceptable) — no change.
- [ ] Done = demo scenes campaign/tokens/candle/ages captured, sheet viewed by controller, no console errors, `prototypes/*.html` still render. Commit.

### T3: Render lifecycle (`core/scene.js`, small hooks in `shared/war-table.js`)
**Produces:** `createScene({ canvasHost, build, onFrame, maxFps = 60 }) → { start(), stop(), dispose(), running }` — `build(wt)` adds content; `stop()` cancels rAF; `dispose()` frees geometry/materials/textures/render targets and removes the canvas; auto-stop on `document.visibilitychange` hidden. `wt.advance(dt)` followed by a 1-px `readPixels` (headless capture stability).
- [ ] Unit test (node, no WebGL): `createScene` with a fake `wt` counts rAF requests: 0 after `stop()`, 0 after `dispose()`, `build` called once per `start()` after dispose.
- [ ] Browser check: `overlay.html` (stub) creates and disposes an alert scene 20x; `renderer.info.memory.geometries` and `textures` return to the start value (log printed, read by controller).
- [ ] Add the readPixels note to `docs/capture.md`. Commit.

### T4: Dock panel + settings (`panel.html`, `panel.js`)
Port goblin's panel pattern (room creation + "Copy overlay link", status dots, settings patch with `_rev`), cut to PDBull's controls:
- [ ] Room: shows code, buttons "Copy overlay link", "Copy Starting link", "Copy BRB link" (each `…?room=CODE`).
- [ ] Starting Soon: minutes input + "Start countdown" (sets `scenes.countdownEnd = Date.now()+min*60000`) + "Reset".
- [ ] BRB text (default "Be right back").
- [ ] Alerts: Streamlabs token (password field, kept in local storage only), per-type toggles, sound on/off, 4 sound URL fields, test buttons Follow / Sub / Gifted 5 / Bits 50 / Bits 500 / Bits 1500 / Donation (short) / Donation (long message) / Long name.
- [ ] Intro: "Test intro 1v1", "Test intro 4v4" (emit a fake `match-start` with fixture data).
- [ ] Streamlabs events → `remote.publishEvent` + write `latest.{follower,subscriber,donation}`.
- [ ] Status dots: room, Streamlabs, (from overlay) aoe2 + chat.
- [ ] Tests: `tests/panel.test.js` — token never present in `stripSecrets(settings.get())`; countdown end computed from minutes; test buttons emit the documented payloads (shape below, shared with T9):
```js
// alert payload on the bus: { type: 'follow'|'sub'|'bits'|'donation', id, name, amount?, currency?, months?, tier?, gift?, message? }
```
- [ ] Visual: dock at 360x800 in walnut/brass style tokens from the prototypes (no new design work). Commit.

### T5: Starting Soon scene (`scenes/starting.{html,js,css}`)
Port `prototypes/starting.*`; remove test-only params except `shot`, `t`.
- [ ] Countdown from `settings.scenes.countdownEnd` (live updates via room); when it reaches 0 shows "Starting now"; null → shows only "Starting soon".
- [ ] Last follower from `settings.latest.follower` (hidden when empty).
- [ ] Fix review findings still visible on the current render: label "AOE2 · CHESS" → "PDBULL" only; blue banner inside frame at all orbit times; soft scrim behind title/countdown; use T2 candle/fog APIs.
- [ ] Uses `createScene`; autoupdate + remote wired.
- [ ] Captures t=3/35/65/95 + one with a 25-char follower; controller views sheet; reviewer (sonnet) against design.md §3. Commit.

### T6: BRB scene (`scenes/brb.{html,js,css}`)
- [ ] Smoke text from `settings.scenes.brbText` (English default).
- [ ] Chat lines (bottom-right) from `core/twitchchat.js` channel `pdbull`, +2–3 px size and more contrast for muted usernames; last follower bottom-left from `settings.latest.follower`.
- [ ] Fix findings still visible: map not floating in a black void (table extends behind), map far half lit enough to read, AoE2 content readable through DOF (village age change visible), smoke dissolve sweeps left→right without blobs.
- [ ] Captures t=2/12/16/45; reviewer; commit.

### T7: `overlay.html` + `modules/camchat.js`
- [ ] `overlay.html` = goblin's mount/unmount loop over `MODULES` + remote + autoupdate + ONE `createPoller({profileId: settings.profileId})` that emits `match-start`/`match-end`/`match-update` and `status` on the bus.
- [ ] `camchat`: port D1 (`prototypes/camchat.*`) as a module (CSS scoped `[data-mod=camchat]`), chat from `twitchchat.connect`, `--chat-bottom = 190 + 24*(players-2)` from the running match's player count (2 when idle), Twitch emotes as in goblin `modules/chat.js`.
- [ ] Test `tests/camchat.test.js`: chatBottom(2)=190, (4)=238, (8)=334, clamps 1→190, 9→334.
- [ ] Capture over `shared/game.webp` with 2 and 8 players. Commit.

### T8: Intro module (`modules/intro.js`, `core/intrologic.js`)
- [ ] Step 1 (controller, browser path only): in the built-in browser fetch `https://data.aoe2companion.com/api/matches?profile_ids=551021&page=1` (and next pages) until a team game appears; save that page as `tests/fixtures/pdbull-tg.json`. If none in 5 pages, ask Paul for a TG match id. ≤2 attempts on 403/429, then wait 10 min.
- [ ] `introFromMatch(m)` → `{ left: { names: string[], colour }, right: { names, colour }, map: string, mode: '1v1'|'team' }` — left = Paul's team; ≤4 names per side; colours from `colorHex` mapped to the nearest `PLAYER_COLOURS` name.
- [ ] Tests on `pa100.json` (1v1: left ['PDBull'], right ['SwedishGoblinTwitch'], map 'Arabia') and `pdbull-tg.json` (names = real names, mode 'team').
- [ ] Module: on `match-start` builds the E3 scene with `createScene`, plays once (no replay after reload: remember `match.id` in sessionStorage), disposes after; banners use T2 cloth presets; scroll ≥8 px above band bottom; 25-char names fit (auto-shrink font).
- [ ] Captures: 1v1, 4v4, long names; reviewer; commit.

### T9: Alerts module (`modules/alerts.js`, `core/alertlogic.js`)
- [ ] `core/alertlogic.js`:
```js
export function bitsTier(n) { return n >= 1000 ? 'chest' : n >= 100 ? 'pile' : 'coins'; }
export function durationOf(a) { // seconds, design.md ROUND 2 §7
  if (a.type === 'follow') return 4;
  if (a.type === 'sub') return 6;
  if (a.type === 'bits') return { coins: 5, pile: 6.5, chest: 8 }[bitsTier(a.amount)];
  const len = (a.message || '').length; return Math.min(12, 8 + Math.ceil(len / 60));
}
export function createQueue({ play, now = () => Date.now() }) { /* FIFO, one at a time, dedup by id (last 200), play(a) returns a Promise */ }
```
- [ ] Tests: bitsTier on 49/50/99/100/999/1000/1500; durationOf follow 4, sub 6, donation empty 8, 600-char 12; queue plays in order, drops a repeated id, never two at once.
- [ ] Module: port F3 from `prototypes/alerts.js` (`trigger(payload)`), scene created on first alert and disposed 10 s after the queue empties; sounds: synth by default, `settings.modules.alerts.sounds[type]` URL overrides; per-type toggles honoured.
- [ ] Fix findings still visible: bits long name (25 chars fits the 625–1675 band), tray brass not muddy, sub ribbon velvet sheen, donation message text larger.
- [ ] Captures of all 4 + bits 50/500/1500 + long name + long message; reviewer; commit.

### T10: Streamlabs real-data gate (Paul ~5 min, then agent)
- [ ] Paul pastes his Streamlabs socket token in the dock (local preview), then presses Streamlabs dashboard → Alert Box → Test Follow / Sub / Bits / Donation. The dock logs raw socket messages to `tests/fixtures/streamlabs-paul.json` via a "Save log" button (download; controller moves the file). Names in test events are Streamlabs' fakes — no personal data.
- [ ] `tests/streamlabs.test.js` runs `mapEvent` on that fixture: 4 typed events, non-empty name/amount. Any field mismatch → fix `mapEvent`, re-run. Commit (fixture checked for tokens first: `grep -c token` must print 0).

### T11: Visual sign-off sheet (controller → Paul)
- [ ] One contact sheet `docs/productie-2026-11-xx.jpg` at full resolution per frame (no worse than the deliverable): starting t=3/65, BRB t=12/45, overlay with chat, intro 1v1 + 4v4, 4 alerts. Controller views it first. Paul answers OK or lists changes; changes loop back to T5–T9 only for the named scenes.

### T12: Repo + Pages + push (needs Paul's yes)
- [ ] Paul runs `gh repo create PDBultoc/pdbull-overlay --public --source . --remote origin` (auto-mode blocked repo creation on goblin).
- [ ] Controller: `git push -u origin main`; enable Pages from `main` / root (`gh api -X POST repos/PDBultoc/pdbull-overlay/pages -f "source[branch]=main" -f "source[path]=/"`); verify `https://pdbultoc.github.io/pdbull-overlay/overlay.html`, `panel.html`, `scenes/starting.html`, `scenes/brb.html`, `version.json` answer 200. If a deploy hangs: cancel via `gh api -X POST repos/PDBultoc/pdbull-overlay/pages/deployments/<sha>/cancel`, then `gh api -X POST repos/PDBultoc/pdbull-overlay/pages/builds`.

### T13: OBS install guide (`docs/INSTALL.md`, in Romanian — Paul's own use; click-level, short)
- [ ] Steps: dock (Docks → Custom Browser Docks, panel URL); create room → copy links; 3 Browser Sources 1920x1080 (overlay in the game scene above the game capture; starting and brb in their scenes, "Shutdown source when not visible" ON, "Refresh browser when scene becomes active" OFF); webcam source placed inside the D1 frame (coordinates from camchat.css); Streamlabs token; test buttons; OBS Settings → Advanced → "Enable browser source hardware acceleration" ON.
- [ ] Every URL and coordinate in the guide checked against the deployed files.

### T14: Performance gate (Paul + controller, timebox 30 min)
- [ ] Paul, in a custom AoE2 game vs AI at 1440p: 2 min with the overlay source hidden, 2 min visible with chat running, then 3 test alerts and a test intro. Reads AoE2 FPS (in-game) and OBS Stats (render lag, skipped frames, CPU).
- [ ] Pass = game FPS drop ≤10 % average, OBS skipped/lagged frames ≤0.5 % during alerts. Fail → controller lowers cost in this order: bloom off on alerts, DPR 0.75, shadows off, maxFps 30 for intro; re-measure once. Still failing → record numbers, ask Paul.

### T15: Live gate (Paul's next stream)
- [x] (Paul, live stream night of 2026-11-05: "merge totul ok") Starting countdown from the dock; intro fires once per match (1v1 and, if played, a TG); real follow/sub/bits/donation (or Streamlabs tests) show; BRB scene; chat stays above the score panel. Paul reports; fixes go to a follow-up plan.

## Out of scope / later
- Painterly token faces (macro look).
- Goblin modules: match bar, result, challenges, music, series, messages.
- Custom sound pack (URLs in the dock cover it).
