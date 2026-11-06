# Casting scene (CaptureAge) — design

Status: draft for Paul's approval, 2026-11-06. Visual direction approved by Paul on 2026-11-06: prototype D · Chronicle ("Arată frumos"), `prototypes/casting/d-chronicle.html`.

## 1. What it is
A new OBS scene, **Casting**, for casting any AoE2 match (1v1 to 4v4; Paul's own games or other players') through **CaptureAge** (CA:DE). CA already shows names, civs, ELO, series score, map and stats, so our overlay never duplicates them. It adds four things:
1. **Reactions** that Paul fires by hand when a player blunders, does something funny, or something great. This is the new part.
2. Paul's camera in the walnut frame, and chat. Both reuse `camchat`.
3. Alerts (follow, sub, bits, donation). This reuses `alerts`.
4. A per-match tally that feeds the GG awards.

The match intro and the match banner are **off** in this scene, because CA shows the same data.

## 2. Reactions (style D · Chronicle)
The world is the campaign table at night: ink, parchment tones, muted gold and candle light. The humour is a dry medieval chronicler plus manuscript-margin doodles. There are no objects (no plaques, seals, scrolls or cards). Colours come only from `shared/tokens.css`: walnut, ivory, brass/gold, and the amber flame for Wow only. Oxblood ink is used for Blunder, and the player's colour (muted) only as a small accent. All on-screen text is in English.

| # | Reaction | What happens | Length |
|---|---|---|---|
| 1 | Blunder | The player's name in ivory Cinzel; an oxblood quill slash cuts through it, ink pools and drips; the candle flinches (a short dim and a shadow sweep). "Blunder" + "The chroniclers will remember this." | 2.8 s |
| 2 | Funny | Margin doodles in ink come alive along the lower play area: a villager chasing a chicken, a sheep chasing a knight, a monk falling off a donkey. "The scribes are laughing." + name. **The doodles get redrawn with more detail** (Paul's gate). | 3.6 s |
| 3 | Wow | Gold dust bursts from the picked point and settles into an illuminated gold capital "L" that opens "Legendary"; a short amber flame flare; name. | 3.2 s |
| 4 | Wololo | A watercolour ink wash in the player's colour blooms from the picked point. "Wololo." | 2.6 s |
| 5 | Spotlight | The room dims except a candle-lit circle at the picked point; a quill arrow, "Look here." | 4.5 s |
| 6 | GG | A quill writes the chronicle entry: "GG", "Play of the game · name", "Blunder of the game · name" (from the tally). | 8 s |

Rules:
- Reactions live only in the CA play area (y 150–850 at 1920×1080). Darkening layers fade out over the last 40 px at both edges, so they never cover CA's top bar, bottom panel, minimap or score lines.
- A new reaction **replaces** the one playing (150 ms fade-out). GG can only be replaced by another GG.
- The picked point (Wow, Wololo, Spotlight) defaults to the centre of the play area and is clamped so text stays on screen.
- Sound is short and synthesised (quill, ink, flame, bell, low chord). It goes through OBS ("Control audio via OBS"), with on/off and volume in the dock. No sample files and no meme clips.
- OBS composites the overlay over the CA capture as a separate source. Effects therefore draw only their own pixels: no blend modes or backdrop filters, which cannot see the game in OBS.
- No WebGL; Canvas 2D + DOM. The canvas idles (no frames) when no reaction is playing.

## 3. Dock: new "Casting" card
- **Players:** buttons with each player's name in their colour, grouped by team, taken from the current match.
  - Source A (default): Paul's own live match (`profileId`, as today).
  - Source B: **Follow player**. Paul types a name, the dock searches aoe2companion (`GET /api/profiles?search=<name>`; checked 2026-11-06, it returns `profiles[].profileId`) and Paul picks one; the casting overlay then polls that player's matches.
  - Manual fallback: up to 8 names and colours typed by hand.
- **Reactions:** six buttons (1–6). Click a player, then a reaction; with no player picked, the reaction uses the last picked player. While the dock has focus, keys 1–6 work too.
- **Point pad:** a small 16:9 pad where Paul clicks the spot for Wow, Wololo and Spotlight; "centre" resets it.
- **Tally:** shows Blunder/Wow/Funny counts per player. It resets automatically when a new match starts, and there is a Reset button. GG uses it.
- **Test** buttons and a **sound** on/off + volume, like the other cards.

## 4. Scene and data flow
- The OBS scene "Casting" is a CA window capture plus one Browser Source, `overlay.html?room=…&scene=casting` at 1920×1080, plus Paul's camera source under it (same place as in the game scene: X 8, Y 755, 322×180).
- `overlay.html` with `scene=casting` mounts `camchat`, `alerts` and the new `reactions` module, never `intro` or `matchbar`. The chat bottom moves up so it clears CA's score lines (x 1690–1920, y 885–960).
- Alerts must not cover CA's top bar (y < 118). If the current alert placement does, the casting scene gets a vertical offset for alerts (checked in the plan).
- The dock sends `{ type: 'reaction', fx, player:{name,color}, x, y }` over the existing room bus (BroadcastChannel + remote). The overlay plays it, and each fired reaction updates the tally that the dock shows.
- In casting, the poller follows `settings.casting.followProfileId` when it is set, else `profileId`.

## 5. Testing
- `node --test`, pure logic in `core/reactionlogic.js`:
  - tally per player and reset on a new match id;
  - the award pick (most wows / most blunders; ties go to the latest; nobody → "—");
  - the replace rule;
  - point clamping;
  - the message shape;
  - the follow-player search response mapped to dock entries.
- Visual checks: the controller looks at stills at fixed t for each reaction over a CA frame. Paul gives his verdict on the redrawn Funny doodles and on the finished set.
- Live gate: one casted match in OBS over real CA. Reactions are readable, nothing covers CA's HUD, no skipped frames are visible, and the sound level is right.

## 6. Out of scope (later, only if Paul asks)
The between-games screen; a telestrator (drawing on screen); the chat vote "Blunder or big brain?"; the hype meter; OBS effects on the game image (freeze-frame, zoom/shake, instant replay — these need plugins and their own yes); global hotkeys while CA has focus (possible later through OBS hotkeys + WebSocket); automatic detection of game events (there is no public live data from CA or the game).
