# pdbull-overlay — NEXT (2026-11-05, round 2 done)
- Git: initialised, NO commits yet (Paul hasn't asked). shots/ git-ignored.
- Paul chose A1 · B2 · D1 · E3 · F3; all text English; AoE2 campaign table is the world, chess one small nod; F3 = follow tag / sub plate+seal / bits coins→chest / Streamlabs donation letter. Source of truth: docs/design.md "ROUND 2".
- Round 2 built + reviewed + fixed (workflow wf_9472b6d9-67c); sheet docs/runda2-2026-11-05.jpg. Shared: prototypes/shared/war-table.js + campaign.js (map, fog, village ages, tokens, banners, props; API in journal of that run). Transparent+bloom dimming bug fixed.
- Live view: preview_start "pdbull-proto" (port 8796) → index.html. Headless capture: docs/capture.md; with shot=1 use &t= for the moment.
- WAITING on Paul: feedback on round 2.
- Known gaps: tokens fine at table distance, folk-art-toy look in macro (painterly faces would help); BRB map far half dim; donation message text small; intro blue banner a bit grey.
- Next phase (fresh session): writing-plans for production — reuse goblin-overlay engine (OBS dock panel, autoupdate, AoE2 match detection via aoe2companion browser path, Twitch IRC chat, Streamlabs socket alerts incl. donations), hosting (GitHub Pages like goblin), OBS install guide.
