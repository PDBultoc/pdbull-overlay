# pdbull-overlay — NEXT (2026-11-05, published; waiting on Paul's OBS tests)
- LIVE: github.com/PDBultoc/pdbull-overlay (public), Pages https://pdbultoc.github.io/pdbull-overlay/ (panel.html, overlay.html, scenes/starting.html, scenes/brb.html). main = c599476, version.json 2026-11-05.5, 138/138 node tests (`timeout 60 npm test`). Every code push must bump version.json (autoupdate every 2 min).
- Plan docs/plans/2026-11-05-pdbull-overlay-production-plan.md: T0–T13 DONE (T1: OBS dock↔source local path works; T10: Paul's real Streamlabs log in tests/fixtures/streamlabs-paul.json, donation donor = `from`). Guide: docs/INSTALL.md (Romanian).
- NEXT: T14 performance in OBS (Paul: AoE2 vs AI at 1440p, overlay hidden vs visible + 3 test alerts + test intro; read game FPS + OBS Stats). Pass = FPS drop ≤10 %, skipped/lagged ≤0.5 %. Fail order: bloom off on alerts, DPR 0.75, shadows off, intro maxFps 30; BRB `&q=low`. Watch: document.hidden on a visible source (alerts would be dropped), alerts cut below ~10 fps, blank frame when switching to Starting/BRB with "Shutdown when not visible".
- Then T15 live gate on Paul's next stream.
- OPEN for Paul: Twitch charity donation → donation letter? raid / powerUp later? (all ignored now). Gift subs unverified (no real sample).
- Deferred minors: .superpowers/sdd/2026-11-05-pdbull-overlay-production-plan/progress.md (git-ignored ledger, rulings 1–15).
- RULE (Paul): never reproduce a hang by re-running; read code, find cause, fix. Headless captures one at a time, never in retry loops.
