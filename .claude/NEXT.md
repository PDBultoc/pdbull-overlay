# pdbull-overlay — NEXT (2026-11-06, casting scene T1–T7 done, T8 open)
- main @ (this commit), local only, NOT pushed. LIVE is still Pages 2026-11-05.8; local version.json = 2026-11-06.1. `timeout 120 npm test` → 220/220.
- NEXT TASK: T8 of `docs/plans/2026-11-06-casting-scene-plan.md` — (1) Paul's verdict DONE 2026-11-06: "Look good" on the Funny redraw + the finished set. Still needs Paul's yes per action: (2) `git push`, (3) OBS scene "Casting" per INSTALL 2e (Paul adds it, or obs-apply.mjs only if he asks; back up first), (4) live gate on one cast.
- Stills for the verdict: `.superpowers/casting-stills/funny/frames/f000{1,2,3}.png` (Funny t 1.2/2.4/3.2) and `.superpowers/casting-stills/final/frames/f0099.png` (all six, real fonts). Regenerate: tools/frames-server.mjs (OUT_DIR=…, POST frames from the page) — see ledger.
- Rulings R1–R19, gate results and deferred minors: `.superpowers/sdd/2026-11-06-casting-scene-plan/progress.md` (git-ignored; keep until T8 lands).
- Open minors for Paul's verdict: monk's book reaches y ~536 in the last pose; ram dust/chicken legs near x 692; keys 1–6 only with the Casting card focused (documented).
- Gotchas: in-app browser pane hidden → rAF and img.decode() stall (obs 0186); test in a shown pane or shim rAF in a test tab. Never `taskkill /IM msedge.exe`. Never re-run a hang.
