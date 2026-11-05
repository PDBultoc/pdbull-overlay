// Integration: the REAL poller + bus + banner flow, wired as overlay.html / modules/matchbar.js wire them.
// Per-module tests feed events in the order the spec describes; this one uses the order the poller produces.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPoller } from "../core/aoe2.js";
import { createBus } from "../core/bus.js";
import { createBannerFlow } from "../core/matchbarlogic.js";

const pa100 = JSON.parse(fs.readFileSync(new URL("./fixtures/pa100.json", import.meta.url), "utf8"));
const done = pa100.filter((m) => m.finished != null);
const NOW = Date.parse("2026-11-05T18:00:00.000Z");
const live = { ...done[0], matchId: 999, finished: null, started: "2026-11-05T17:59:30.000Z" };

function wire() {
  const log = [];
  const timers = [];
  const bus = createBus({ BC: null, win: null });
  let shownKey = null;
  const keyOf = (m) => (m && m.id != null ? String(m.id) : null);
  const flow = createBannerFlow({
    show: (m) => { if (keyOf(m) === shownKey) return; shownKey = keyOf(m); log.push("SHOW " + shownKey); },
    hide: () => { if (shownKey != null) log.push("HIDE"); shownKey = null; },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
    fallbackMs: 12000,
  });
  bus.on("match-start", (p) => log.push("intro starts " + (p.match && p.match.id)));
  bus.on("match-start", (p) => { const m = p && p.match; if (m && keyOf(m) != null && keyOf(m) === shownKey) return; flow.start(m); });
  bus.on("intro-end", (p) => flow.introEnd(p && p.id));
  bus.on("match-running", (p) => flow.running(p && p.match));
  bus.on("match-end", () => flow.end());
  const pages = []; let i = 0; let next = null;
  const poller = createPoller({
    profileId: 551021, now: () => NOW,
    setTimer: (fn) => { next = fn; return 1; }, clearTimer: () => {},
    fetchFn: async () => ({ ok: true, status: 200, json: async () => pages[Math.min(i++, pages.length - 1)] }),
    onEvents: (evs) => { for (const e of evs) bus.emit(e.type, { match: e.match }); },
    // exactly overlay.html onStatus
    onStatus: (st) => { if (st && st.ok) queueMicrotask(() => bus.emit("match-running", { match: poller.latest() })); },
  });
  const poll = async (first) => { if (first) await poller.start(); else { const f = next; next = null; await f(); } await new Promise((r) => setImmediate(r)); };
  return { log, timers, bus, pages, poll, poller };
}

test("overlay.html defers match-running past the same-tick events", () => {
  const src = fs.readFileSync(new URL("../overlay.html", import.meta.url), "utf8");
  assert.match(src, /queueMicrotask\(\(\) => bus\.emit\('match-running'/);
});

test("new ranked start: banner waits for intro-end, not shown at once", async () => {
  const w = wire();
  w.pages.push(done, [live, ...done]);
  await w.poll(true);
  await w.poll(false);
  assert.deepEqual(w.log, ["intro starts 999"]);
  w.bus.emit("intro-end", { id: 999 });
  assert.deepEqual(w.log, ["intro starts 999", "SHOW 999"]);
  w.poller.stop();
});

test("new ranked start without an intro: banner shows after the 12 s fallback", async () => {
  const w = wire();
  w.pages.push(done, [live, ...done]);
  await w.poll(true);
  await w.poll(false);
  assert.deepEqual(w.log, ["intro starts 999"]);
  assert.equal(w.timers.at(-1).ms, 12000);
  w.timers.at(-1).fn();
  assert.deepEqual(w.log, ["intro starts 999", "SHOW 999"]);
  w.poller.stop();
});

test("stale unfinished match on page 1 never shows a banner between games", async () => {
  const w = wire();
  w.pages.push(pa100, pa100);
  await w.poll(true);
  await w.poll(false);
  assert.deepEqual(w.log, []);
  w.poller.stop();
});
