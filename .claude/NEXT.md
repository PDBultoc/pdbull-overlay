# pdbull-overlay — NEXT (2026-11-05, production plan written)
- Git: branch main, first commit bc56cbc (round-2 prototypes + docs; local only, no remote yet). Repo-local identity PDBultoc (noreply) set.
- Paul approved round 2 (A1 · B2 · D1 · E3 · F3) and all 7 production decisions ("Da, toate"): new public repo PDBultoc/pdbull-overlay + Pages, goblin engine copied, 5 scenes + last-follower strip, Streamlabs socket alerts with synth sounds (URL override), profileId 551021 (PDBull), intro 1v1 + TG, token faces deferred, perf gate.
- PLAN: docs/plans/2026-11-05-pdbull-overlay-production-plan.md (T0–T15 with depends:). APPROVED by Paul 2026-11-05 ("Aprob"); committed.
- Next session: execute the plan (subagent-driven-development; Paul opted into workflows for this project). READY first: T0; then T1 (Paul in OBS), T2, T4 in parallel.
- Live view: preview_start "pdbull-proto" (port 8796). Headless capture: docs/capture.md.
- Gotchas: aoe2companion only from a browser (never curl/node); shared/* has one owner (T2/T3); round-2 builder findings are in the plan's T2/T5/T6/T8/T9 lists (source: workflow wf_9472b6d9-67c result JSON).
