// Match banner prototype. Data shape = normalizeMatch: { mode, map, me, myTeam, enemies:[team,...] },
// player { profileId, name, civ, colorHex }, rating = RM 1v1 ELO (Map id -> number, missing = unknown).
function fitStage(el = document.querySelector('.stage')) {
  const f = () => el.style.setProperty('--stage-scale', Math.min(innerWidth / 1920, innerHeight / 1080));
  f(); addEventListener('resize', f); return f;
}

const q = new URLSearchParams(location.search);
const state = {
  v: ['1', '2', '3'].includes(q.get('v')) ? q.get('v') : '1',
  s: ['1v1', '2v2', '4v4'].includes(q.get('size')) ? q.get('size') : '1v1',
  p: q.get('pos') === 'tl' ? 'tl' : 'tr'
};
if (q.get('shot') === '1') document.body.classList.add('shot');
if (q.get('bg') === '0') document.body.classList.add('nobg');
fitStage();

// ---- demo data (realistic names, one 25-char name, one missing rating) ----
const ROSTER = [
  // my team
  { profileId: 1, name: 'PDBull',                    civ: 'Franks',      colorHex: '#3b78e0', elo: 1742 },
  { profileId: 2, name: 'Frostbite_Nils',            civ: 'Vikings',     colorHex: '#4fb15a', elo: 2288 },
  { profileId: 3, name: 'kiwi_lancer',               civ: 'Persians',    colorHex: '#e0c53a', elo: 1310 },
  { profileId: 4, name: 'DukeOfEdinburgh',           civ: 'Byzantines',  colorHex: '#3fc3cf', elo: 1655 },
  // enemies
  { profileId: 5, name: 'Ragnar_the_Unstoppable_01', civ: 'Hindustanis', colorHex: '#d8453a', elo: 2130 }, // 25 chars
  { profileId: 6, name: 'ShadowMonk',                civ: 'Mongols',     colorHex: '#a35bd0', elo: 905 },
  { profileId: 7, name: 'ElPollo88',                 civ: 'Spanish',     colorHex: '#8f8f8f', elo: null },    // no rating
  { profileId: 8, name: 'Teuton_Tony',               civ: 'Teutons',     colorHex: '#ec8a2e', elo: 1488 }
];
const SIZES = { '1v1': 1, '2v2': 2, '4v4': 4 };

function demoMatch(size) {
  const n = SIZES[size];
  const mine = ROSTER.slice(0, 4).slice(0, n).map(({ elo, ...p }) => p);
  const theirs = ROSTER.slice(4).slice(0, n).map(({ elo, ...p }) => p);
  const ratings = new Map(ROSTER.filter(p => p.elo != null).map(p => [p.profileId, p.elo]));
  return { match: { mode: size, map: 'Arabia', me: mine[0], myTeam: mine, enemies: [theirs] }, ratings };
}

const stage = document.getElementById('stage');
const slot = document.getElementById('slot');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const fmt = r => (r == null ? '—' : String(r));
function avg(team, ratings) {
  const v = team.map(p => ratings.get(p.profileId)).filter(x => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

// one player row; v3 uses a two-line row
function playerRow(p, isMe, ratings, two) {
  const row = el('div', 'row' + (isMe ? ' me' : ''));
  const pip = el('i', 'pip'); pip.style.setProperty('--c', p.colorHex || '#888');
  const nm = el('span', 'nm', p.name);
  nm.title = p.name;
  const civ = el('span', 'civ', p.civ || '');
  const elo = el('span', 'elo', fmt(ratings.get(p.profileId)));
  row.append(pip, nm, civ, elo);
  return row;
}

function build(v, size) {
  const { match, ratings } = demoMatch(size);
  const teams = [match.myTeam, ...match.enemies];
  const teamGame = SIZES[size] > 1;
  const bar = el('div', `mb v${v} s${SIZES[size]} p-${state.p}`);

  const sideHead = (t, i) => {
    const h = el('div', 'th');
    h.append(el('span', 'tl', i === 0 ? 'Your team' : 'Enemy'), el('span', 'ta', 'avg ' + fmt(avg(t, ratings))));
    return h;
  };
  const rows = t => t.map(p => playerRow(p, p.profileId === match.me.profileId, ratings));

  if (v === '1') {
    bar.append(el('div', 'hd', match.map));
    teams.forEach((t, i) => {
      const box = el('div', 'team' + (i === 0 ? ' mine' : ''));
      if (teamGame) box.append(sideHead(t, i));
      box.append(...rows(t));
      bar.append(box);
    });
  } else if (v === '2') {
    const slip = el('div', 'slip');
    slip.append(el('div', 'hd', match.map));
    teams.forEach((t, i) => {
      if (i === 1) { const d = el('div', 'vs'); d.append(el('b', null, 'VS')); slip.append(d); }
      const box = el('div', 'team' + (i === 0 ? ' mine' : ''));
      if (teamGame) box.append(sideHead(t, i));
      box.append(...rows(t));
      slip.append(box);
    });
    bar.append(slip, el('i', 'tack'));
  } else {
    const rod = el('div', 'rod');
    rod.append(el('span', 'rm', match.map));
    const wrap = el('div', 'flags');
    teams.forEach((t, i) => {
      const f = el('div', 'flag' + (i === 0 ? ' mine' : ''));
      f.style.setProperty('--tc', t[0].colorHex || '#777');
      const cloth = el('div', 'cloth');
      if (teamGame) cloth.append(sideHead(t, i));
      cloth.append(...rows(t));
      f.append(cloth);
      wrap.append(f);
    });
    bar.append(rod, wrap);
  }
  return bar;
}

function render(animate = true) {
  slot.className = 'slot ' + state.p;
  slot.replaceChildren();
  const bar = build(state.v, state.s);
  if (!animate) bar.classList.add('noanim');
  slot.append(bar);
  document.body.dataset.v = state.v;
  document.querySelectorAll('.panel [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === state.v));
  document.querySelectorAll('.panel [data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === state.s));
  document.querySelectorAll('.panel [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === state.p));
  return bar;
}

document.querySelectorAll('.panel [data-v]').forEach(b => b.onclick = () => { state.v = b.dataset.v; render(); });
document.querySelectorAll('.panel [data-s]').forEach(b => b.onclick = () => { state.s = b.dataset.s; render(); });
document.querySelectorAll('.panel [data-p]').forEach(b => b.onclick = () => { state.p = b.dataset.p; render(); });
document.getElementById('btn-bg').onclick = () => document.body.classList.toggle('nobg');

// pixel boxes (layout size, stage px) of every variant at 1v1 and 4v4: ?measure=1 or ?shot=1 logs them
async function measure() {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const keep = { ...state };
  for (const s of ['1v1', '2v2', '4v4']) for (const v of ['1', '2', '3']) {
    state.v = v; state.s = s;
    const b = render(false);
    const w = b.offsetWidth, h = b.offsetHeight;
    const x = state.p === 'tr' ? 1920 - 8 - w : 8;
    console.log(`BOX v${v} ${s} ${state.p} x=${x} y=${b.offsetTop + slot.offsetTop} w=${w} h=${h}`);
  }
  Object.assign(state, keep);
  render(false);
}

render();
if (q.get('shot') === '1' || q.get('measure') === '1') measure();
