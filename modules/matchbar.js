// matchbar - in-game match banner, "Brass plaque" (ported from prototypes/matchbar.js variant 1).
// Bus: 'match-start' {match} (shown after 'intro-end' or a 12 s fallback), 'match-running' {match|null} (shown at once when no
// intro is pending; null / finished hides), 'match-end' (hides), 'intro-end' {id}. Rows render with "—" first and are filled
// when the shared ratings lookup (ctx.ratings) resolves. Settings: modules.matchbar.enabled (read by overlay.html).
import { barFromMatch, eloText, createBannerFlow } from '../core/matchbarlogic.js';
import { introPlayerIds } from '../core/intrologic.js';
import { createRatings } from '../core/ratings.js';

const INTRO_FALLBACK_MS = 12000;
const SAMPLE_ELOS = [1505, 1257, 1131, 1955, 1725, 1655, 1306, 1579]; // panel test matches (test-* ids never touch the network)

function ensureCss() {
  if (document.getElementById('matchbar-css')) return;
  const l = document.createElement('link');
  l.id = 'matchbar-css'; l.rel = 'stylesheet';
  l.href = new URL('./matchbar.css', import.meta.url).href;
  document.head.appendChild(l);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** shrink a text element until it fits its box whole: font first (down to 8 px), then a little letter-spacing. Never ellipsis. */
export function fitText(node) {
  node.style.fontSize = ''; node.style.letterSpacing = '';
  if (node.scrollWidth <= node.clientWidth) return;
  const base = parseFloat(getComputedStyle(node).fontSize) || 12;
  let px = base;
  while (node.scrollWidth > node.clientWidth && px > 8) { px -= 0.25; node.style.fontSize = px + 'px'; }
  let ls = 0;
  while (node.scrollWidth > node.clientWidth && ls > -0.06) { ls -= 0.01; node.style.letterSpacing = ls + 'em'; }
}

function build(bar) {
  const nTeam = Math.max(...bar.teams.map((t) => t.players.length));
  const size = nTeam >= 3 ? 4 : nTeam === 2 ? 2 : 1;
  const root = el('div', `mb s${size}`);
  root.append(el('div', 'hd', bar.map));
  const teamGame = bar.teams.some((t) => t.players.length > 1);
  const eloNodes = new Map(); // profile id -> [elo span]
  const avgNodes = [];
  bar.teams.forEach((t, i) => {
    const box = el('div', 'team' + (t.mine ? ' mine' : ''));
    if (teamGame) {
      const th = el('div', 'th');
      const ta = el('span', 'ta', 'avg ' + eloText(t.avg));
      th.append(el('span', 'tl', t.mine ? 'Your team' : 'Enemy'), ta);
      avgNodes[i] = ta;
      box.append(th);
    }
    for (const p of t.players) {
      const row = el('div', 'row' + (p.me ? ' me' : ''));
      const pip = el('i', 'pip'); pip.style.setProperty('--c', p.colorHex);
      const nm = el('span', 'nm', p.name); nm.title = p.name;
      const elo = el('span', 'elo', eloText(p.rating));
      row.append(pip, nm, el('span', 'civ', p.civ), elo);
      box.append(row);
      if (p.id != null) { const a = eloNodes.get(p.id) || []; a.push(elo); eloNodes.set(p.id, a); }
    }
    root.append(box);
  });
  return { root, eloNodes, avgNodes };
}

// ctx: { settings, bus, cfg, ratings, latest } -> { unmount }
export function mount(root, ctx = {}) {
  ensureCss();
  const bus = ctx.bus;
  const ratings = ctx.ratings || createRatings();
  const slot = el('div', 'slot');
  root.append(slot);
  let shownKey = null, dead = false, gen = 0;

  const enabled = () => !(ctx.settings && ctx.settings.get && ctx.settings.get().modules?.matchbar?.enabled === false);
  const keyOf = (m) => (m && m.id != null ? String(m.id) : null);

  function hide() {
    gen++;
    slot.replaceChildren();
    shownKey = null;
  }

  async function show(match) {
    if (dead || !match || match.running === false || !enabled()) return;
    const key = keyOf(match);
    if (key != null && key === shownKey) return; // same match already on the board: it stays still
    const my = ++gen;
    shownKey = key;
    const ids = introPlayerIds(match);
    const test = /^test-/.test(String(match.id));
    const sample = new Map(ids.map((id, i) => [id, SAMPLE_ELOS[i % SAMPLE_ELOS.length]]));
    const first = barFromMatch(match, test ? sample : new Map());
    if (!first) return;
    const { root: bar, eloNodes, avgNodes } = build(first);
    slot.replaceChildren(bar);
    const fit = () => bar.querySelectorAll('.nm, .civ').forEach(fitText);
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (gen === my) fit(); }).catch(() => {});
    if (test) return;
    let map;
    try { map = await ratings.get(ids); } catch (e) { map = new Map(); }
    if (dead || gen !== my) return;
    const full = barFromMatch(match, map);
    full.teams.forEach((t, i) => {
      if (avgNodes[i]) avgNodes[i].textContent = 'avg ' + eloText(t.avg);
      for (const p of t.players) for (const n of eloNodes.get(p.id) || []) n.textContent = eloText(p.rating);
    });
  }

  const flow = createBannerFlow({ show, hide, fallbackMs: INTRO_FALLBACK_MS });
  const offs = [];
  if (bus && bus.on) {
    offs.push(bus.on('match-start', (p) => { const m = p && p.match; if (m && keyOf(m) != null && keyOf(m) === shownKey) return; flow.start(m); }));
    offs.push(bus.on('intro-end', (p) => flow.introEnd(p && p.id)));
    offs.push(bus.on('match-running', (p) => flow.running(p && p.match)));
    offs.push(bus.on('match-end', () => flow.end()));
  }

  const initial = ctx.latest ? ctx.latest() : null;
  if (initial) show(initial);

  return {
    unmount() {
      dead = true; flow.clear(); gen++;
      for (const off of offs) { try { if (off) off(); } catch (e) { /* ignore */ } }
      root.replaceChildren();
    },
  };
}
