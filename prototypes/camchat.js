// no 3D on this page: own stage fitter (same contract as shared fitStage)
function fitStage(el = document.querySelector('.stage')) {
  const f = () => el.style.setProperty('--stage-scale', Math.min(innerWidth / 1920, innerHeight / 1080));
  f(); addEventListener('resize', f); return f;
}

const q = new URLSearchParams(location.search);
const V = '1'; // round 2: only variant 1 (walnut & brass) is kept
document.body.classList.add('v1');
// chat bottom: y 890 for 2 players, 24 px higher per extra player (score lines grow upward)
const players = Math.min(8, Math.max(2, parseInt(q.get('players'), 10) || 2));
document.documentElement.style.setProperty('--chat-bottom', (190 + 24 * (players - 2)) + 'px');
if (q.get('shot') === '1') document.body.classList.add('shot');
if (q.get('bg') === '0') document.body.classList.add('nobg');
fitStage();
if (q.get('zoom')) document.body.classList.add('zoom' + q.get('zoom')); // review shots only

document.getElementById('btn-bg').onclick = () => document.body.classList.toggle('nobg');

// ---- softened name colours (dark-bg palette / ivory-slip palette) ----
const NAME_DARK  = ['#d4a28f', '#a9bf98', '#d8c28f', '#9fb4cc', '#c9a0b4', '#b7a58a', '#c58d6d', '#93b8b0'];

const E = id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
const KAPPA = E(25), POG = E(305954156); // v2/88 now answers 404, current PogChamp id used instead

const SEED = [
  { n: 'NordicFox',     r: 'v', t: ['hey! what map are we on today?'] },
  { n: 'PDBull',        r: 'b', t: ['Hey NordicFox! Arabia, ranked, random civ.'] },
  { n: 'OakMod',        r: 'm', t: ['Commands: !civ !rank !build'] },
  { n: 'ketchupKnight', r: 'v', t: ['gg that last fight was clean ', { e: KAPPA }] },
  { n: 'luna_pawn',     r: 'v', t: ['knights hit at minute 14, hold the line!'] },
  { n: 'Vlad_AoE',      r: 'v', t: ['that boom is insane ', { e: POG }] },
  { n: 'bruma',         r: 'v', t: ['love the stream, watching from my phone'] },
  { n: 'OakMod',        r: 'm', t: ['No spoilers for anyone playing right now, thanks!'] }
];
const TESTS = [
  { n: 'eveningCoffee', r: 'v', t: ['what opening is this?? ', { e: POG }] },
  { n: 'Carpenter_91',  r: 'v', t: ['nice walls bro, your builds are getting smoother'] },
  { n: 'PDBull',        r: 'b', t: ['Thanks! Castle age next, stick around.'] },
  { n: 'OakMod',        r: 'm', t: ['Chat is open to everyone, type away ', { e: KAPPA }] }
];

const chat = document.getElementById('chat');
const MAX = 9, LIFE = 40000;
let n = 0, ci = 0;

function build(m) {
  const colour = m.r === 'b' ? null : NAME_DARK[ci++ % 8];
  const wrap = document.createElement('div'); wrap.className = 'm';
  const inner = document.createElement('div'); inner.className = 'inner';
  const msg = document.createElement('div');
  msg.className = 'msg' + (m.r === 'b' ? ' role-b' : '');

  let name = document.createElement('span'); name.className = 'nm'; name.textContent = m.n;
  if (m.r === 'b') name.style.color = '#f1d9a4'; else name.style.color = colour;

  if (m.r !== 'v') {
    const b = document.createElement('span');
    b.className = 'badge ' + (m.r === 'b' ? 'b' : 'mod'); b.textContent = m.r === 'b' ? 'HOST' : 'MOD';
    msg.append(b);
  }
  msg.append(name, document.createTextNode(': '));
  const tx = document.createElement('span'); tx.className = 'tx';
  for (const part of m.t) {
    if (typeof part === 'string') tx.append(document.createTextNode(part));
    else { const im = document.createElement('img'); im.className = 'emote'; im.src = part.e; im.alt = ''; im.onerror = () => im.remove(); tx.append(im); }
  }
  msg.append(tx); inner.append(msg); wrap.append(inner);
  return wrap;
}

function remove(el) {
  if (!el.isConnected) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 1400);
}

function add(m, seed = false) {
  const el = build(m);
  if (seed) el.classList.add('seed', 'in');
  chat.append(el);
  if (!seed) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => remove(el), LIFE + (seed ? 0 : 0));
  const live = [...chat.children].filter(c => !c.classList.contains('out'));
  while (live.length > MAX) remove(live.shift());
}

SEED.forEach(m => add(m, true));
let ti = 0;
const test = () => add(TESTS[ti++ % TESTS.length]);
document.getElementById('btn-test').onclick = test;
if (q.get('add')) setTimeout(test, 1500);
