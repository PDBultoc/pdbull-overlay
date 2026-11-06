# PDBull overlay — round 3 production plan (stinger, end scene, ambience, match banner)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Owner rules in `~/.claude/CLAUDE.md` apply (fan out READY tasks, ≤8 agents, reviewers on sonnet, long jobs owned by the controller, never re-run a hang, headless captures one at a time).

**Goal:** ship the round-3 picks into the live overlay: the parchment-scroll Stinger transition as a .webm with alpha, the "Thanks for watching" end scene (replaces OBS "Ending Soon"), generated ambient sound on Starting / BRB / End with on/off + volume in the dock, and a small in-game match banner (top-right, all players, RM 1v1 ELO).

**Architecture:** same engine as round 2 (ES modules, no build, settings + bus synced dock↔sources locally and via the ntfy room, `version.json` autoupdate). The stinger is rendered offline, frame by frame, from the deterministic `draw(ctx, tMs)` of `prototypes/stingers/scroll.js`: a render page posts PNG frames + a WAV of `sfx()` to a tiny local Node receiver, ffmpeg encodes VP9 `yuva420p` + Opus. The end scene is a third full scene on `core/scene.js`. Ambience is one WebAudio module used by the three scenes. The banner is a persistent overlay module fed by the existing aoe2 poller events and `core/ratings.js`.

**Tech stack:** plain ES modules, three@0.170.0 (jsdelivr importmap), WebAudio, `node --test` (Node 24), ffmpeg 9.0 full build (winget Gyan.FFmpeg, has `libvpx-vp9`), OBS 33.0.1.

**Spec:** `docs/design.md` (ROUND 2 world) + Paul's round-3 picks below. Prototypes: `prototypes/index.html` section "RUNDA 3".

## Decisions taken (Paul, 2026-11-05)
1. Transition: **B · Parchment scroll** (`prototypes/stingers/scroll.js`, 1900 ms, cut 1000 ms), on every scene switch, with sound. Replaces the current global Stinger (old Streamlabs .webm).
2. End scene: **1 · Candle out** (`prototypes/ending.html?v=1`) — candle gutters and goes out, ember + smoke thread, "Thanks for watching" / "See you next time" inked on a letter; chat stays visible like BRB. It **replaces OBS "Ending Soon"**; "Intermission" is left as it is.
3. Music: **none** — only our generated ambience (candle, hearth, quill). No licensed tracks, no on-screen music credit.
4. Ambience: the prototype mixes (`prototypes/ambience.js` PRESETS starting / brb / ending) with on/off + volume in the dock.
5. Match banner: **top-right** under the menu buttons, **all players** in team games (up to 4v4), name + RM 1v1 ELO + civ + colour, map name, team average ELO. Variant: **1 · Brass plaque** (`prototypes/matchbar.html?v=1`; Paul, 2026-11-05) — walnut board, thin brass rim with rivets, engraved rows, team blocks stacked with "YOUR TEAM / ENEMY · avg N" headers, Paul's row with a brass bar.

## Global constraints
- Every on-screen text is English; talk to Paul in Romanian. No AoE2 game art (civ = text, no icons).
- Canvas 1920x1080 @ 60, AoE2 DE HUD at 2560x1440 scaled: nothing over the resource bar (x ≤ 650, y ≤ 50), menu buttons (x ≥ 1720, y ≤ 50), bottom HUD (y ≥ 985), score panel/minimap bottom-right; our camera frame x 8 y 755 322x180; chat bottom-right above the score.
- Twitch names up to 25 characters must fit every text slot, **including the banner at 1v1** (the prototypes cut them at 300 px in all three variants — fix in S5).
- Every push that changes code bumps `version.json` ("v": "YYYY-MM-DD.N") and lists new files in `core/autoupdate.js` CODE.
- Module CSS scoped under `[data-mod=name]`; node tests never use a real BroadcastChannel or a real AudioContext.
- Never `img.decode()` in a page that may be hidden (OBS sources, hidden pane): it never settles there. Use the load event + timeout.
- Edits with backslashes via Edit/Write; no `| tail` / `| head` on runs; Python with `-X utf8`.
- Never push, change OBS, or deploy without Paul's yes per action (OBS WebSocket 4455 is read-only for us).

## Facts checked while planning (2026-11-05)
| Fact | How checked |
|---|---|
| ffmpeg 9.0 has `libvpx-vp9`; `-pix_fmt yuva420p` writes `TAG:alpha_mode=1`; decoding with `-c:v libvpx-vp9` returns the alpha exactly (frames 0–2 alpha 0, 3–5 alpha 255) | dry run on 6 lavfi PNG frames, command in S1 |
| ffmpeg's native VP9 decoder (no `-c:v libvpx-vp9`) drops alpha (`alphaextract` fails) | same dry run → OBS alpha must be proven on Paul's PC (S9 gate) |
| Chromium 152 MediaRecorder VP8/VP9 keeps canvas alpha; WebCodecs `alpha:'keep'` unsupported | in-app browser probe — not used: offline frames are frame-exact, real-time recording is not |
| scroll.js: full cover at 967/1000/1033 ms, transparent at 0 and 1900 ms | real-GPU check in the in-app browser (`stinger.html?v=b&check=1`) |
| Ambience levels at master 1: starting −25.6 / brb −27.0 / ending −23.0 dBFS RMS, peaks ≤ −8.3 | `prototypes/ambience.html?levelcheck=1&preset=all` (OfflineAudioContext) |
| Dust shader drifts `uTime * 0.02` in x (`shared/war-table.js:1050`) → particles leave the room after ~1 h in BRB/Starting/End | read the shader |
| Paul's OBS: Stinger is the global transition with track-matte settings present; scenes include "Ending Soon", "Intermission" | read-only obs-websocket probe (parent session) |

## Real-data gates
| Heuristic / selector | Real sample | Expected |
|---|---|---|
| Banner rows from a match | `tests/fixtures/pa100.json` match 0 (1v1) and `tests/fixtures/pdbull-tg.json` (team game) through `normalizeMatch(…, 551021)` | 1v1: 2 rows, me = PDBull first block; TG: one block per team, ≤ 4 rows each, map = fixture `mapName` |
| ELO per player | `tests/fixtures/profiles-rm1v1.json` through `rm1v1()` | each row shows that profile's rm_1v1 rating; missing → "—"; team avg ignores missing |
| 25-char name fit | `Ragnar_the_Unstoppable_01` at 1v1 / 2v2 / 4v4 in the chosen variant | no name element with `scrollWidth > clientWidth` (DOM check, S5 step) |
| Stinger alpha | rendered `assets/stinger-scroll.webm` | `alpha_mode=1`; decoded alpha min = 255 at frames 58–62 (cut 1000 ms ±33 ms @60), max = 0 at frames 0 and 113 |
| Ambience loudness in scenes | OfflineAudioContext level check of `core/ambience.js` | each preset RMS in −30…−22 dBFS, peak ≤ −6 dBFS |

## File structure (target)
```
assets/stinger-scroll.webm            S1  (VP9 alpha + Opus, 1920x1080@60, 1.9 s)
tools/frames-server.mjs               S1  local receiver: POST /frame/NNNN (PNG), /audio (WAV) -> tools/out/
tools/stinger-render.html|.js         S1  renders draw(t) frames + OfflineAudioContext sfx, posts them
shared/stingers/scroll.js             S1  (moved from prototypes/stingers/scroll.js, polished)
core/ambience.js                      S2  (from prototypes/ambience.js)
scenes/ending.html|js|css             S4  (from prototypes/ending v1)
core/sceneaudio.js                    S2  scene glue: settings/visibility -> ambience
core/dustdrift.js                     S3  pure drift term (GLSL + JS mirror)
core/endinglogic.js                   S4  pure: camDrift, beatAt
core/matchbarlogic.js                 S5  pure: rows/teams/avg/fit
modules/matchbar.js|css               S5
core/settings.js, core/registry.js, panel.js, core/panelcore.js   S0
shared/war-table.js                   S3  (dust drift only)
```

## Dependency map
| Task | depends | owner |
|---|---|---|
| R0 Banner variant pick | — | Paul |
| S0 Settings, registry, dock cards, Ending link | — | agent |
| S1 Stinger: polish + offline render to .webm | — | agent prepares; controller runs the render |
| S2 Ambience module + Starting/BRB hook | S0 | agent |
| S3 Dust drift fix (shared) | — | agent |
| S4 End scene `scenes/ending.*` | S0, S2, S3 | agent |
| S5 Match banner module | S0, R0 | agent |
| S6 autoupdate CODE, version, INSTALL.md | S1, S2, S4, S5 | agent |
| S7 Visual sign-off sheet | S1, S4, S5 | controller → Paul |
| S8 Push to Pages | S6, S7, Paul's yes | controller |
| S9 OBS gates (stinger alpha, Ending Soon swap, audio, banner live) | S8 | Paul + controller |

READY at start: R0 (Paul), S0, S1, S3. After S0: S2, and S5 once R0 is answered. S4 after S0+S2+S3. Writers never share a file: `core/settings.js` / `core/registry.js` / `panel.js` belong to S0 only; `shared/war-table.js` to S3 only; `scenes/starting.js` + `scenes/brb.js` to S2 only; `modules/intro.js` + `overlay.html` to S5 only. Later tasks report needs in those files to the controller.

## Risks (decided up front)
| Risk | Effect | Mitigation |
|---|---|---|
| OBS decodes the VP9 with the native decoder (no alpha) | black box around the scroll during the transition | S9 gate on a test scene first; fallback (≤ 1 attempt, then switch): render a Track Matte version — colour on top, matte below, 1920x2160 H.264 (`-filter_complex vstack`), OBS Stinger "Use a Track Matte" → "Vertical" |
| OBS browser sources do not autoplay audio / audio not in the mixer | no ambience | INSTALL: "Control audio via OBS" on Starting/BRB/End sources; S9 checks it; if CEF blocks autoplay, resume the AudioContext on first `visibilitychange`/settings message and report |
| Ambience under Paul's voice too loud/quiet | annoying stream | dock volume (0–1, default 0.6) + per-scene presets; S9 Paul listens live |
| Banner covers in-game notifications top-right | hides info | fixed box under the menu buttons (y ≥ 58), ≤ 420x220 at 4v4; S9 checks in a real match |
| Ratings fetch slow/blocked | banner without ELO | show "—" immediately, fill in when `ratings.get` resolves (2.5 s timeout, 10-min cache shared with the intro) |
| Long-running scenes drift (dust) | empty room after an hour | S3 bounded drift; S4 test runs `wt.advance(4 * 3600)` and asserts particle x stays within the room bounds |

---

### R0: Banner variant (Paul)
- [x] Paul picked **1 · Brass plaque** (2026-11-05). S5 ports only `.v1` from `prototypes/matchbar.*`.

### S0: Settings, registry, dock cards, Ending link
**Files:** modify `core/settings.js` (DEFAULTS), `core/registry.js`, `core/panelcore.js` (`roomLinks`), `panel.js`, `panel.html` (one copy button); tests `tests/settings.test.js`, `tests/panel.test.js`.
**Interfaces produced:**
```js
// core/settings.js DEFAULTS additions
scenes: { countdownEnd: null, countdownMin: 5, brbText: 'Be right back' },
ambience: { enabled: true, volume: 0.6 },
modules: { ..., matchbar: { enabled: true } },
// core/registry.js
export const MODULES = ['camchat', 'intro', 'alerts', 'matchbar'];
// core/panelcore.js roomLinks(room, href) -> { overlay, starting, brb, ending }   // ending = scenes/ending.html?room=<room>
```
- [x] Failing tests first: `settings.test.js` asserts the new defaults merge into an old stored object without losing existing keys; `panel.test.js` asserts `roomLinks('abc', 'https://pdbultoc.github.io/pdbull-overlay/panel.html').ending === 'https://pdbultoc.github.io/pdbull-overlay/scenes/ending.html?room=abc'`.
- [x] Implement; dock: new card "Ambience" (checkbox `ambience.enabled`, range 0–1 step 0.05 `ambience.volume` with the numeric value shown), card "Match banner" (checkbox `modules.matchbar.enabled`, buttons "Test banner 1v1" / "Test banner 4v4" that send `match-running` with the demo matches from `core/panelcore.js` `TEST_MATCHES` — add `TEST_MATCHES = { '1v1': …, '4v4': … }` there with one 25-char name and one player without rating), button "Copy End link" next to Copy BRB link.
- [x] `timeout 60 npm test` → all pass (138 before this plan + new). Commit `feat(dock): ambience + match banner settings, End link`.

### S1: Stinger — polish and offline render to .webm
**Files:** `git mv prototypes/stingers/scroll.js shared/stingers/scroll.js` (prototype harness imports updated), create `tools/frames-server.mjs`, `tools/stinger-render.html`, `tools/stinger-render.js`, `assets/stinger-scroll.webm`, test `tests/frames-server.test.js`; add `tools/out/` to `.gitignore`.
**Interfaces:** consumes `meta`, `create(W,H) -> { draw(ctx,tMs) }`, `sfx(ac, dest, when)` (contract in `prototypes/stinger.js` header). Produces `assets/stinger-scroll.webm` + transition point **1000 ms** (= `meta.cutMs`; re-read it after polish).
- [x] Polish (look at each in the in-app browser, `prototypes/stinger.html?v=b&t=<ms>`, window visible): roller entering frame (t 150–300) and roll-back (t 1300–1600) seen; wood grain stronger so the rotation reads (knot/stripe); shadow ahead of the roller darker and longer; `create()` awaits the fonts with `Promise.race([document.fonts.load('600 40px Cinzel'), timeout 1500 ms])` so frames are deterministic. Re-run the coverage check: `STINGER-CHECK` must print `255,255,255` / start 0 / end 0.
- [x] `tools/frames-server.mjs` (Node http, 127.0.0.1:8798, CORS for http://127.0.0.1:8797 and http://localhost:8797): `POST /frame/<4 digits>` body = PNG bytes → `tools/out/frames/f<4 digits>.png`; `POST /audio` body = WAV → `tools/out/sfx.wav`; `POST /done` → exits 0. Rejects any other path (404) and any name not matching `^\d{4}$`. Test with a real server on an ephemeral port: POST two frames + done, assert files and exit.
- [x] `tools/stinger-render.js`: `create(1920,1080)`; for `i = 0 … round(durationMs*60/1000)`: clear, `draw(ctx, i*1000/60)`, `canvas.toBlob('image/png')`, POST, await. Audio: `new OfflineAudioContext(2, 48000*2.2, 48000)`, `sfx(oac, oac.destination, 0)`, render, encode 16-bit WAV in JS, POST `/audio`, then `/done`. Page shows progress text "frame N / M".
- [x] Controller runs the render (window visible, one run): start `node tools/frames-server.mjs` in background with a log file, open `http://localhost:8797/tools/stinger-render.html`, wait for the server to exit. Then encode:
```bash
ffmpeg -hide_banner -y -framerate 60 -i tools/out/frames/f%04d.png -i tools/out/sfx.wav -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 18 -row-mt 1 -auto-alt-ref 0 -c:a libopus -b:a 160k -shortest assets/stinger-scroll.webm
```
- [x] Verify (gate):
```bash
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:stream_tags=alpha_mode -of default=nw=1 assets/stinger-scroll.webm
ffmpeg -hide_banner -loglevel error -c:v libvpx-vp9 -i assets/stinger-scroll.webm -vf "alphaextract,format=gray" -f rawvideo - | od -v -An -tu1 -w2073600 | awk '{mn=255;mx=0;for(i=1;i<=NF;i++){if($i<mn)mn=$i;if($i>mx)mx=$i} print NR-1, "alpha min="mn" max="mx}' > tools/out/alpha.txt
```
  Expected: `codec_name=vp9`, 1920x1080, `60/1`, `TAG:alpha_mode=1`; in `alpha.txt` frames 58–62 `min=255`, frame 0 and the last frame `max=0`. (The awk line over 2 MB per frame is slow-ish; run it in background to a file.)
- [x] Commit `feat(stinger): parchment scroll .webm with alpha (cut 1000 ms)` including the .webm (≈1–3 MB; check size before commit, say it in the report).

### S2: Ambience module + Starting / BRB hook
**Files:** create `core/ambience.js` (from `prototypes/ambience.js`, CAL `{ candle: 0.33, hearth: 0.55, quill: 0.6 }`), `core/sceneaudio.js`, tests `tests/ambience.test.js`, `tests/sceneaudio.test.js`; modify `scenes/starting.js`, `scenes/brb.js`.
**Interfaces produced:**
```js
// core/ambience.js
export const PRESETS;                                   // { starting, brb, ending: { layers:{candle,hearth,quill}, master } }
export function createAmbience(ac, { layers, master }) // -> { output, set(layer,v), setMaster(v), start(), stop(fadeMs=800) }
// core/sceneaudio.js — glue used by every full scene
export function createSceneAudio({ preset, settings, AudioCtx = globalThis.AudioContext, doc = globalThis.document })
  // -> { apply(settingsObj), dispose() }
  // on when settings.ambience.enabled && !doc.hidden; master = PRESETS[preset].master * settings.ambience.volume;
  // stops (fade 800 ms) on hidden, resumes on visible; resumes a suspended context on the next settings message.
```
- [x] Failing tests with a fake AudioContext (plain objects recording `createGain/createBufferSource/start/stop` calls and gain values): enabled=false → no source started; volume 0.5 → master gain = preset master × 0.5; hidden → stop called; visible again → started once (no double start).
- [x] Implement; hook in `scenes/starting.js` (preset `starting`) and `scenes/brb.js` (preset `brb`): create on load, `apply()` in the existing settings handler, `dispose()` on unload.
- [x] Level gate: copy the level-check page logic to `prototypes/ambience.html` importing `../core/ambience.js`; run `?levelcheck=1&preset=all` in the in-app browser (window visible) → RMS −30…−22, peak ≤ −6 per preset; paste the 3 lines in the commit message.
- [x] `timeout 60 npm test`; commit `feat(scenes): generated ambience with dock on/off + volume`.

### S3: Dust drift fix
**Files:** create `core/dustdrift.js` (pure, no three import — node tests cannot load `shared/war-table.js`, it needs the browser importmap); modify `shared/war-table.js:1050` (dust vertex shader); test `tests/dust.test.js`.
```js
// core/dustdrift.js — single source for the shader term and its JS mirror
export const DUST_DRIFT_X_GLSL = 'sin(uTime * 0.11 + aPhase * 6.0) * 0.35 + sin(uTime * 0.013 + aPhase * 3.0) * 0.6';
export const dustOffsetX = (t, phase) => Math.sin(t * 0.11 + phase * 6) * 0.35 + Math.sin(t * 0.013 + phase * 3) * 0.6;
```
- [x] Failing test first: for t in 0…4 h step 60 s and 20 phases in [0,1), `Math.abs(dustOffsetX(t, p)) <= 0.95`; and `DUST_DRIFT_X_GLSL` contains no bare `uTime *` term outside a `sin(`.
- [x] `shared/war-table.js` imports `DUST_DRIFT_X_GLSL` and builds the line `p.x += ${DUST_DRIFT_X_GLSL};` (replaces the unbounded `+ uTime * 0.02`). Check BRB in the in-app browser still shows drifting dust. Commit `fix(shared): dust stays in the room on multi-hour scenes`.

### S4: End scene `scenes/ending.*` (from prototype v1)
**Files:** create `scenes/ending.html`, `scenes/ending.js`, `scenes/ending.css` from `prototypes/ending.*` keeping only variant 1, plus `core/endinglogic.js` (pure helpers moved out of ending.js: camera drift `camDrift(t) -> {x,y,z}`, beat timeline `beatAt(t) -> { flame, ember, ink }` in 0…1 — node cannot import ending.js, it loads three via the importmap); test `tests/ending.test.js` on `core/endinglogic.js`.
**Interfaces:** consumes `createScene` (core/scene.js), `createSceneAudio({ preset: 'ending', settings })` (S2), chat via `core/twitchchat.js` + `core/brbchat.js` like BRB, settings/bus/remote/autoupdate wiring copied from `scenes/brb.js`.
- [x] Remove the runtime dust-shader patch (S3 fixed it in shared) and the v2 code paths, `?v=` buttons and `&moon/&lamp` knobs (keep the chosen values as constants).
- [x] Fix what the review saw: letter less washed out (exposure/albedo down until "Thanks for watching" contrast ≥ 4.5:1 against the paper in a screenshot sample), quill resting on the table (no floating), inkwell fully in frame.
- [x] Opening beat plays once per scene start (scene shown), then steady state; `?q=low` as BRB.
- [x] Tests in `tests/ending.test.js`: `camDrift(t)` stays inside its bounds for t up to 4 h (step 10 s); `beatAt(0).flame === 1`, `beatAt(4).flame === 0` (out at 3.2 s), `beatAt(8).ink === 1`, `beatAt(3600)` equals `beatAt(8)` (steady state).
- [x] Look at it in the in-app browser at 1920x1080 (window visible): at t=2 s, t=6 s, t=20 s, with `&demo=1` chat; then one headless capture per docs/capture.md (budget 1, timeout 60, cleanup proof). Commit `feat(scenes): Thanks for watching end scene`.

### S5: Match banner module
**Files:** create `core/matchbarlogic.js`, `modules/matchbar.js`, `modules/matchbar.css` (from `prototypes/matchbar.*`, chosen variant only); modify `overlay.html` (mount persistent module, pass one shared `ratings`), `modules/intro.js` (emit `intro-end` and accept `ctx.ratings`); tests `tests/matchbarlogic.test.js`.
**Interfaces produced:**
```js
// core/matchbarlogic.js
export function barFromMatch(match, ratings /* Map id->rating */) // -> { map, teams: [{ mine, avg, players: [{ id, name, civ, colorHex, rating, me }] }] }
                                                                   //    my team first; avg = rounded mean of known ratings or null
export function eloText(r)                                         // -> '1834' | '—'
// bus events consumed: 'match-start' {match} (show after 'intro-end' or 12 s fallback), 'match-running' {match|null}
//   (show at once if no intro is playing; null -> hide), 'match-end' (hide), 'intro-end' {id}
```
- [x] Failing tests on the real fixtures (Real-data gates rows 1–2): `barFromMatch(normalizeMatch(pa100[0], 551021), map)`; for the team game, load `tests/fixtures/pdbull-tg.json` (array of 2 raw matches with `teams`, `mapName`) exactly as `tests/intrologic.test.js:81` does and pass each through `normalizeMatch(raw, 551021)`; ratings Map built as in `tests/ratings.test.js:55` from `profiles-rm1v1.json`. Missing rating → `rating: null`, `eloText(null) === '—'`, avg ignores nulls.
- [x] Implement module: enters once (0.6 s heavy drop, no bounce), then static; box anchored right 8 px, top 58 px; widths: 1v1 sized so `Ragnar_the_Unstoppable_01` fits (measure; ≤ 340 px), 4v4 ≤ 420x220.
- [x] Ratings: one `createRatings()` instance created in `overlay.html` and passed as `ctx.ratings` to intro and matchbar (intro keeps its own fallback when ctx has none); render rows with "—" first, fill when `get(ids)` resolves.
- [x] 25-char DOM check (Real-data gate row 3) in the in-app browser via `overlay.html?demo=matchbar1v1|matchbar4v4` (add these two demo keys to DEMO_EVENTS).
- [x] `timeout 60 npm test`; commit `feat(overlay): in-game match banner (RM 1v1 ELO, all players)`.

### S6: autoupdate, version, install guide
**Files:** `core/autoupdate.js` CODE (+ `scenes/ending.*`, `core/ambience.js`, `core/sceneaudio.js`, `core/matchbarlogic.js`, `modules/matchbar.*`), `version.json` bump, `docs/INSTALL.md` (Romanian).
- [x] INSTALL additions: (a) **Tranziția**: Scene Transitions → Stinger → Video File = `assets/stinger-scroll.webm` downloaded from the repo, Transition Point Type = Time, Transition Point = **1000 ms**, Audio Monitoring as Paul prefers; (b) **Ending Soon**: replace its image + old alertbox with a Browser Source = "Copy End link", 1920x1080, "Shutdown source when not visible"; (c) **Sunet**: on Starting/BRB/End sources tick "Control audio via OBS", volume from the dock card "Ambience"; (d) banner needs nothing (part of the overlay).
- [x] `timeout 60 npm test`; commit.

### S7: Visual sign-off sheet (controller → Paul)
- [x] (Paul ok 2026-11-05) One contact sheet image (JPEG at 1920 px width, labelled): stinger frames 150/500/1000/1400/1700 ms over the game, end scene t=2/6/20 s, banner 1v1 + 4v4 over `shared/game.webp` at real size crop. Controller looks at it first, then sends it to Paul (SendUserFile). Paul's "ok" = gate.

### S8: Push (Paul's yes)
- [x] (2026-11-05: pushed 9c3e123, Pages serves 2026-11-05.8) After Paul's yes: `git push`; wait for the Pages build; open `https://pdbultoc.github.io/pdbull-overlay/version.json` and confirm the new version string.

### S9: OBS gates on Paul's PC (each OBS change only with Paul's yes)
- [x] (passed 2026-11-05, Paul: "Arată bine") **Stinger alpha:** Paul sets the new file on the Stinger (S6 guide) and switches Joc → BRB → Joc. Pass = scroll over the game with no black box, scene changes hidden under the paper. Fail → Track Matte fallback (Risks row 1), one attempt.
- [ ] **Ending Soon:** source swapped; the candle beat plays on entering the scene; chat visible.
- [ ] **Audio:** ambience audible on Starting/BRB/End in the OBS mixer, dock on/off and volume change it within 2 s; silent in Joc.
- [ ] **Banner:** real match: appears after the intro, all players with ELO, nothing covered; hides at match end. Add banner on/off to the T14 performance check (round-2 plan).
- [ ] Update `.claude/NEXT.md` and `docs/design.md` "ROUND 3" with the results.

## Out of scope / later
- Raid / charity / power-up alerts, gift-sub verification (round-2 open items).
- Licensed music and on-screen music credits (Paul chose none).
- End-scene variant 2 (map rolled up) and transitions A/C stay in `prototypes/` only.
