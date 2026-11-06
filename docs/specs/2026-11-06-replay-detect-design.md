# Casting: detect the cast game from the replay file — design

Status: approved by Paul 2026-11-06 (options 1 + ntfy, question 1a, question 2 yes). Extends `2026-11-06-casting-scene-design.md` §3–4.

## 1. What it does
When Paul plays or spectates (casts) an AoE2 DE game, the game writes a replay file live. A small local watcher reads the players from that file and sends them to the room. The casting overlay then shows them in the dock's Casting card. Paul no longer types "Follow player" or manual names.

## 2. Facts (checked 2026-11-06)
| Fact | How it was checked |
|---|---|
| Live games and spectated games write `MP Replay v<build> @YYYY.MM.DD HHMMSS (N).aoe2record` into `%USERPROFILE%\Games\Age of Empires 2 DE\<steamId>\savegame\`, growing during the game | previous session's probe, file list on disk |
| Header: uint32 header length, then raw deflate from byte 8. Save version today is 68.9 (`VER 9.4`) | `mgz.fast.header.decompress` + `parse_version` on the 3 newest files |
| `mgz` 1.8 cannot parse save 68.9 (`parse_de` asserts) → own parser | probe2 on the newest files |
| Player slot, anchored on 4 DE strings (`60 0A` + uint16 length): `""`, 1 byte, ai name, censored name, name; then uint32 type, uint32 profileId, 4 bytes, int32 number. Before the first string: int32 colour (−24), team byte (−18), uint32 civ (−8), uint32 custom-civ count c (−4) and c uint32 entries (shift everything back by 4c) | byte dump of the newest replay; prototype parser |
| Prototype parser over all 620 replays on disk: 0 empty, 0 bad; 1–8 players; median 2.0 ms, max 9.3 ms per file (first 64 KB of compressed data) | `proto2.mjs` over the whole folder |
| Colour id is 0-based (0 blue, 1 red); aoe2companion's `color` is 1-based with `colorHex` 1 #405BFF, 2 #FF0000, 3 #00FF00, 4 #FFFF00, 5 #00FFFF, 6 #FF57B3, 7 #797979, 8 #FF9600 | PolishedPoo vs Dobby, replay vs `data.aoe2companion.com/api/matches?profile_ids=1947956` |
| Team byte: 1 = no team (FFA), 2 → team 1, 3 → team 2 (…5 → team 4); 0 occurs in 8/620 files (one player, sometimes a duplicate colour) | same comparison; sweep |
| Co-op players share a player number (DD3 files) | sweep |
| OBS 33.0.1 embeds Chromium 150 (`libcef.dll` 150.0.7871.252). Chrome 141+ gates public-site requests to 127.0.0.1 behind a Local Network Access prompt; nothing documents CEF's behaviour without a prompt UI | file version; Chrome docs / blink-dev Intent to Ship |
| The overlay already reads the room's ntfy cache at start (`/json?poll=1&since=all`) | `core/remote.js` `start()` |

Not yet checked (real-data gate G3): the file is readable while the game writes it, and how soon after the game starts the header is complete.

## 3. Components
- **`core/recheader.js`** (pure ESM, runs in Node and in the browser): `playersFromHeader(bytes)` → `[{ name, profileId, number, color, team }]` from the inflated header bytes; `teamsFromPlayers(players)` → `[{ team, players:[{ name, color, profileId }] }]` (team label 1–4, or `'?'` for team byte 0; FFA = one team per player; colour as hex from the table above, unknown → the existing fallback colour). Inflating is the caller's job.
- **`tools/replay-watch.mjs`** (Node 24, no dependencies): every 5 s it lists the savegame folder, takes the newest `.aoe2record`; when that file is new (not yet announced) and its mtime is within the last 2 min, it reads the first 64 KB, inflates (`zlib.inflateRawSync`, sync flush), parses, and POSTs one room event. A failed parse retries on the next ticks (max 6), then the file is skipped and logged. Config in `%APPDATA%\pdbull-overlay\replay-watch.json` (`room`, optional `dir`; the room code never goes on a command line). Single instance (pid lock). Log: `%LOCALAPPDATA%\pdbull-overlay\replay-watch.log`, kept small. 429 → pause like `remote.js`.
- **Message** (same body shape as `publishEvent`): `{ kind:'event', type:'replay-match', t, payload:{ id:<file name>, startedAt:<from file name>, source:'replay', teams } }`. One message per game.
- **Overlay** (`overlay.html`, `core/remote.js`): `start()` also delivers the newest cached `replay-match` younger than 3 h, so a restarted overlay recovers the current game without a new message. `modules/reactions.js` (casting scene only): on `replay-match`, when `casting.auto` is on, pin it: `tally.forMatch(id)`, set the player count, emit `casting-match { matchId:id, map:'', teams, source:'replay' }`. While a replay is pinned and auto is on, `match-running` from the aoe2companion poller is ignored.
- **Dock** (`panel.js`, Casting card; labels in English like the rest of the dock): a checkbox **"Auto from replay"** (`casting.auto`, default on) with a source line "From replay 14:23 · N players" / "From aoe2companion · N players" / "No match yet: manual list below". Picking a Follow player or "Follow my own games" unticks Auto. A button **"Load replay…"** (file input, `.aoe2record`) for recordings loaded in CaptureAge: reads the first 64 KB of the file, inflates with `DecompressionStream('deflate-raw')`, parses with the same `core/recheader.js`, and sends `replay-match` (local bus + room). Timebox: ≤ 2 attempts to get the file dialog working in the OBS dock; if it does not open there, the button is dropped and the gap is recorded.
- **Logon start:** a `.vbs` in the user's Startup folder runs the watcher with no window (`wscript //B`; no admin rights needed, unlike a Task Scheduler logon trigger; hidden launch dry-run 2026-11-06). Written by `tools/replay-watch-install.mjs` only on Paul's yes; `--uninstall` removes it.

## 4. Data flow
AoE2 writes replay → watcher (5 s tick) → ntfy room `replay-match` → overlay (live SSE, or cache at start) → `reactions.js` pins it → local bus `casting-match` → dock shows the player buttons. Dock "Alege replay" → same `replay-match` event from the dock.
Precedence in the casting scene: replay (when Auto is on) > Follow player / own games > manual list.

## 5. Error handling
- No replay yet, or a parse failure: nothing is sent; the dock keeps today's sources.
- No internet: the POST fails, the watcher retries on the next tick while the file is still the newest live one; the log says so.
- Paul plays his own game: the watcher announces it too; harmless (the casting scene is not on screen; the game overlay ignores `replay-match`).
- Team byte 0 → group `'?'`, still clickable. Co-op players appear as separate buttons of the same colour.

## 6. Testing
- `node --test`: parser on small binary fixtures cut from real replays (1v1 PolishedPoo vs Dobby, a 4v4 with custom-civ counts, a DD3 co-op game, a team-0 game, an FFA game); `teamsFromPlayers`; the watcher's decide step with a fake folder listing and clock (new file, stale file, already announced, parse retry cap); remote cache delivery of `replay-match` (age cut-off); reactions pin / ignore `match-running` / auto off; dock Auto checkbox and Follow unticking Auto.
- **Real-data gates**

| Gate | Real sample | Expected |
|---|---|---|
| G1 parser sweep | all `.aoe2record` in Paul's savegame folder (620 today) | 0 empty, 0 bad; every file with ≥ 2 players yields ≥ 2 teams or FFA |
| G2 colours/teams | ≥ 5 of Paul's own recent matches, replay vs aoe2companion | every player: same name, same colour hex, same team split |
| G3 live file | one live or spectated game with the watcher running | detected ≤ 15 s after the file appears; header parsed within 3 ticks; file readable while written |
| G4 end to end | same game, OBS with the casting scene | dock shows the right players and colours without typing; reactions use them |

`timeout 120 npm test` green before any push. Push, the logon task and anything in OBS only on Paul's yes.

## 7. Out of scope
Civ names, map name, ratings from the replay; a list of recent replays in the dock; reading the replay body (live events).
