# PDBull stream overlay — design (approved by Paul 2026-11-04)

Channel: twitch.tv/pdbull (AoE2 + chess, pure gaming — no work/engineering motifs).
OBS canvas 1920x1080 @ 60 fps. Game runs at 2560x1440, standard AoE2 DE HUD.
Direction chosen: **"Masa de război" — a chess war table**. Opposite of
SwedishGoblin's neon/slime overlay: nothing neon.

## 1. World of the table (approved)
- Dark polished walnut table with fine wear scratches; chess board of light/dark
  wood with a brass border.
- Pieces: two sides, warm ivory and ebony. At a match intro each side gets an
  accent in the player's in-game colour (blue, red, ...).
- Unit figurines (our own design, never copied from AoE2 art): carved in the
  same style as the chess pieces, recognisable by silhouette — knight on horse
  with lance, archer with drawn bow, monk with hood + staff, trebuchet, castle.
- Light: ONE warm source (candle/lantern) from the side, long soft shadows, the
  rest dark — a strategy room at night. Candle flickers; dust floats in the beam.
- Palette: dark brown, ivory, brass, muted gold. Single vivid accent: amber
  flame (#ffb347-ish) for big moments only.
- Type: engraved classic serif for titles (Cinzel / Cormorant Garamond, Google
  Fonts); a plain very legible sans for chat and names (e.g. Inter / Source Sans 3).
- Motion: slow and heavy like real objects; pieces land with weight, wood never
  bounces. Feeling: expensive and solid, not glittery.
- Over the game: only thin walnut/brass edges, no heavy backgrounds.

## 2. A · Starting Soon (full screen, 3D)
Board centre, candle aside, a slow self-playing game; now and then a chess piece
dissolves into gold dust and becomes the matching figurine (knight→cavalier,
rook→castle, bishop→monk, pawn→archer) and back. ~90 s camera loop, move order
varies. Text: "PDBull" engraved on a brass plate on the table edge; "Starting
soon" + countdown that burns like a candle (minutes set via URL ?min=); at 0 the
flame goes out and "Începem" appears; small corner text "AoE2 · Chess" and
"Bun venit, <last follower>". Sound optional, off by default. Render only while
visible (pause on document.hidden).

## 3. B · BRB (full screen, 3D)
Same table and light. Board frozen mid-game; wooden chess clock ticking. Shorter
candle with dripping wax. Camera almost still, "breathing"; dust in the beam.
Now and then one piece moves by itself. Text: "Revin imediat" on a brass plate;
optional minutes (?min=) shown on the chess clock counting down; last follower
and chat discreetly.

## 4. D · Camera frame + H · Chat (over the game)
HUD keep-out zones (1920x1080): top-left resources 0–625 x 0–55; top-right icons
1675–1920 x 0–60; bottom-left command panel 0–670 x 945–1080; bottom-right
minimap 1620–1920 x 935–1080; player score lines just above the minimap
(x 1720–1915, y ~900–935, grows upward with 3v3/4v4 — 24 px per row).
- Camera: small, left, above the command panel: x 8–330, y 755–935 (320x180).
- Chat: right, above the score, x 1600–1912, bottom at y≈890 growing up,
  max 8–10 messages, new message slides up, fades after ~40 s, nothing shown
  when idle. Twitch name colours softened to the palette, emotes as images.
  Read anonymously from Twitch IRC (later, not in prototypes).

## 5. E · Match intro + F · Alerts (over the game, top centre band x 625–1675)
- E: ~5 s at match start: player names, civs, map; two sides set up like a game.
- F: follow / sub / bits; follow→pawn, sub→knight, bits→queen (more glow for
  bigger amounts). The camera frame flashes amber briefly as an echo.

## Preview round (Paul asked: 3 different models per piece to choose from)
| Page | Variant 1 | Variant 2 | Variant 3 |
|---|---|---|---|
| A Starting Soon | Orbit: slow orbit, piece→figurine transforms | Game: near top-down self-playing game, gold move trails, figurine at each capture, countdown on a chess clock | Macro: extreme close-ups, shallow DOF, rack focus piece to piece, title rising from candle light |
| B BRB | Clock: frozen board + ticking chess clock | Candle: close-up candle, board blurred behind, smoke writes "Revin imediat" | Fallen king: king lying on the board gently rocking, other pieces gathered waiting (playful) |
| D+H Cam+Chat | Walnut & brass thin frames | Board edge: frames with a chess-square border; chat names with a role piece (king=broadcaster, rook=mod, pawn=viewer) | Corners only: brass corner brackets + soft shadow, chat messages on ivory slips |
| E Match intro | Setting up: two kings slide onto a board strip, names engraved under them | Chess clock between players, names on the two faces, button press starts the match | Seal: two banners unroll, wax seal "VS" stamped in the middle |
| F Alerts | Piece drops onto a board strip with the name | Move: piece crosses a mini board, text in chess notation ("Cf3 — X te urmărește") | Plate: brass plate nailed in, wax seal in the alert type's colour |

Out of scope for v1: goals, PA100 score, music widget, Ending scene.

## ROUND 2 — Paul's choice and changes (2026-11-05) — overrides the above where they differ
Chosen: **A1 · B2 · D1 · E3 · F3**. Other variants are dropped.
1. **ALL on-screen text in English** (Paul streams in English): "Starting soon",
   "Be right back", "Welcome, <name>", "New follower", "New subscriber", "Map",
   sample chat messages in English. Nothing Romanian on screen.
2. **AoE2 is the world, chess is only a small personal nod.** Streams are almost
   all AoE2. The table becomes a **commander's campaign table**: same walnut,
   brass, single candle light, slow heavy motion. On it:
   - centre: a parchment campaign map drawn by us (terrain, forests, gold and
     stone mines, a river) — original, never AoE2 art;
   - **fog of war** over the map that lifts as a scout token explores;
   - a village on the map that grows through **Dark → Feudal → Castle → Imperial**
     across the loop (buildings and banners get bigger/richer);
   - units = **carved, painted wooden wargame tokens** (scout, villager, knight,
     archer, monk) plus banners in player colours — they replace the toy-like
     figurines; tokens must look good up close;
   - resource props on the table: food sacks, wood logs, gold coins, stone;
   - chess = ONE detail only (a chess king near the candle or the chess clock as
     a prop). No chess board as the centrepiece anywhere.
3. A1 Starting Soon: the orbit camera now circles the campaign map: fog lifting,
   village growing through the ages, tokens moving; "PDBULL" plate + countdown stay.
4. B2 BRB: candle + smoke writing "Be right back" stays; blurred background is
   the campaign map with tokens instead of the chess set.
5. D1 Camera + chat: unchanged except English texts.
6. E3 Match intro: banners + wax seal stay; add the match map as a small
   parchment scroll under the seal ("Map · Arabia").
7. F3 Alerts — four clearly different objects, escalating in size/duration:
   | Alert | Object | Motion / sound | Size / duration | Text |
   |---|---|---|---|---|
   | Follow | small brass tag, one nail | one hammer tap | small, ~4 s | "New follower · Name" |
   | Sub | large brass plate with velvet ribbon + red wax seal with crossed swords/shield relief | seal pressed, wisp of steam; camera frame flashes amber | medium, ~6 s | "New subscriber · Name" + Tier/Prime/"gifted 5 subs" |
   | Bits | gold coins falling onto a brass tray; <100 a few coins, 100–999 a pile, 1000+ a chest opening | coin clinks | medium-large, 5–8 s | "Name · 500 bits" |
   | Donation (Streamlabs) | sealed letter: wax breaks, parchment unrolls, message written in ink | paper unfolding, ink | largest, 8–12 s, longer for long messages | "Name · $10" + donor message |
   Sounds: synthesised WebAudio placeholders for the prototype, off unless ?sound=1.

## ROUND 3 — Paul's picks (2026-11-05)
1. **Scene transition (OBS Stinger): B · Parchment scroll** — a walnut roller with brass caps unrolls our inked campaign map over the whole screen, then rolls back up. 1900 ms, transition point 1000 ms, with sound (rustle, roller rumble, soft thump). Used on every scene switch; replaces the old Streamlabs stinger. Delivered as `.webm` VP9 with alpha.
2. **End scene "Thanks for watching": 1 · Candle out** — the candle gutters and goes out, the wick keeps an ember and a thin smoke thread, the room dims; "Thanks for watching" / "See you next time" is inked on a letter. Chat stays visible like BRB. Replaces the OBS scene "Ending Soon"; "Intermission" unchanged.
3. **Music: none.** Only generated ambience (candle crackle, hearth fire, quill on parchment) on Starting / BRB / End, on/off + volume in the dock.
4. **In-game match banner:** top-right under the menu buttons, after the intro until match end; every player (up to 4v4) with colour, name, RM 1v1 ELO, civ (text), map name, team average ELO. Variant: **1 · Brass plaque** (walnut board, thin brass rim, engraved rows, team blocks stacked).
Plan: `docs/plans/2026-11-05-round3-production-plan.md`.
Result: live since 2026-11-05 (Pages 2026-11-05.8). OBS set up on 2026-11-05: stinger from the repo file, cut at 1000 ms; End scene as a browser source; ambience routed through OBS. Stinger gate passed on 2026-11-05. Paul streamed the night of 2026-11-05 and reported "merge totul ok". The T14 performance numbers were not measured.

## ROUND 4 — Casting scene over CaptureAge (Paul, 2026-11-06)
New OBS scene "Casting" for any match (1v1–4v4, Paul's or other players') cast through CaptureAge. CA shows names/civs/ELO/score, so our overlay adds only the cam + chat, alerts, and six hand-fired reactions from a dock "Casting" card: Blunder, Funny, Wow, Wololo, Spotlight, GG. Style: **D · Chronicle** — dry medieval chronicler + manuscript-margin doodles, ink / gold dust / candle light in our palette, no objects (Paul rejected plaque/seal variants and the off-style comic, cinematic and ink-and-fire looks; "Funny dar nu comic book funny", "să se potrivească cu stilul nostru de culori"). Prototype: `prototypes/casting/d-chronicle.html` ("Arată frumos"). Spec: `docs/specs/2026-11-06-casting-scene-design.md`. Plan: `docs/plans/2026-11-06-casting-scene-plan.md`.
