// Pure helpers for the dock panel (node-testable, no DOM).
export const MAX_NAME = 25;
export const LONG_NAME = 'Extremely_Long_Name_25chr';

export const TEST_ALERTS = [
  { key: 'follow', label: 'Follow' },
  { key: 'sub', label: 'Sub' },
  { key: 'gift5', label: 'Gifted 5' },
  { key: 'bits50', label: 'Bits 50' },
  { key: 'bits500', label: 'Bits 500' },
  { key: 'bits1500', label: 'Bits 1500' },
  { key: 'donShort', label: 'Donation (short)' },
  { key: 'donLong', label: 'Donation (long message)' },
  { key: 'longName', label: 'Long name' },
];

export function countdownEnd(minutes, now = Date.now()) {
  const m = Number(minutes);
  if (minutes === '' || minutes == null || !Number.isFinite(m) || m <= 0) return null;
  return now + Math.round(m * 60000);
}

// Dock input value -> what gets stored: number and range inputs give strings, settings need numbers.
export function coerceField(kind, raw) {
  return kind === 'number' || kind === 'range' ? Number(raw) : raw;
}

export function roomLinks(room, panelUrl) {
  const q = '?room=' + room;
  const at = (p) => new URL(p + q, panelUrl).href;
  return { overlay: at('overlay.html'), starting: at('scenes/starting.html'), brb: at('scenes/brb.html'), ending: at('scenes/ending.html') };
}

// Demo matches for the dock's banner test buttons: exactly what normalizeMatch (core/aoe2.js)
// returns, so a match-running event carries the same shape as a live one.
const demoPlayer = (profileId, name, civ, rating, colorHex, country) =>
  ({ profileId, name, civ, rating, ratingDiff: null, won: null, colorHex, country });
function demoMatch(id, mode, map, leaderboard, myTeam, enemies) {
  const me = myTeam[0];
  return {
    id, started: '2026-11-05T12:00:00Z', finished: null, running: true, mode, map,
    lobby: 'Test lobby', leaderboard, hideCivs: false,
    me, myTeam, enemies, won: null, ratingDiff: null,
  };
}
const t1 = [
  demoPlayer(551021, 'PDBull', 'Franks', 1620, '#0000ff', 'RO'),
  demoPlayer(900002, 'Ragnar_the_Unstoppable_01', 'Vikings', 1587, '#ff0000', 'SE'),
];
const t4a = [
  demoPlayer(551021, 'PDBull', 'Franks', 1620, '#0000ff', 'RO'),
  demoPlayer(900102, 'Kasia', 'Poles', 1485, '#00ff00', 'PL'),
  demoPlayer(900103, 'Ragnar_the_Unstoppable_01', 'Vikings', null, '#ffff00', 'SE'),
  demoPlayer(900104, 'Tamerlan', 'Tatars', 1710, '#00ffff', 'KZ'),
];
const t4b = [
  demoPlayer(900105, 'Wolfhound', 'Lithuanians', 1390, '#ff0000', 'LT'),
  demoPlayer(900106, 'SaladinFan', 'Saracens', 1555, '#ff00ff', 'EG'),
  demoPlayer(900107, 'Nikephoros', 'Byzantines', 1440, '#808080', 'GR'),
  demoPlayer(900108, 'Mongol_Mike', 'Mongols', 1660, '#ff8000', 'US'),
];
export const TEST_MATCHES = {
  '1v1': demoMatch('test-banner-1v1', '1v1', 'Arabia', 'RM 1v1', [t1[0]], [[t1[1]]]),
  '4v4': demoMatch('test-banner-4v4', 'tg', 'Arena', 'Team Random Map', t4a, [t4b]),
};

const COLORS = ['red', 'blue', 'green', 'yellow', 'teal', 'purple', 'grey', 'orange'];
const HEX = { red: '#ff0000', blue: '#0000ff', green: '#00ff00', yellow: '#ffff00', teal: '#00ffff', purple: '#ff00ff', grey: '#808080', orange: '#ff8000' };

// Fake normalized team game (same shape as core/aoe2.js normalizeMatch): 4 players per side.
export function fakeMatch4v4() {
  const players = COLORS.map((c, i) => ({
    profileId: 900001 + i, name: 'Player' + (i + 1), civ: 'Franks', rating: 1000 + i * 25,
    ratingDiff: null, won: null, colorHex: HEX[c], country: 'RO',
  }));
  const myTeam = players.slice(0, 4);
  return {
    id: 'test-4v4', started: '2026-11-05T12:00:00Z', finished: null, running: true, mode: 'tg', map: 'Arabia',
    lobby: 'Test lobby', leaderboard: 'Team Random Map', hideCivs: false,
    me: myTeam[0], myTeam, enemies: [players.slice(4)], won: null, ratingDiff: null,
  };
}

function fakeMatch1v1() {
  const mk = (id, name, color) => ({ profileId: id, name, civ: 'Franks', rating: 1500, ratingDiff: null, won: null, colorHex: color, country: 'RO' });
  const me = mk(551021, 'PDBull', '#0000ff');
  return {
    id: 'test-1v1', started: '2026-11-05T12:00:00Z', finished: null, running: true, mode: '1v1', map: 'Arabia',
    lobby: 'Test lobby', leaderboard: 'RM 1v1', hideCivs: false,
    me, myTeam: [me], enemies: [[mk(900002, 'SwedishGoblinTwitch', '#ff0000')]], won: null, ratingDiff: null,
  };
}

// -> { name: bus event name, payload }. opts.match1v1: a real normalized match (browser fetches the fixture).
export function testEvent(key, now = Date.now(), opts = {}) {
  const id = `test-${key}-${now}`;
  const al = (type, extra) => ({ name: type, payload: { type, id, ...extra } });
  switch (key) {
    case 'follow': return al('follow', { name: 'PDBull_Fan' });
    case 'sub': return al('sub', { name: 'PDBull_Fan', months: 3, tier: '1000', gift: false, message: 'Love the stream!' });
    case 'gift5': return al('sub', { name: 'PDBull_Fan', amount: 5, tier: '1000', gift: true });
    case 'bits50': return al('bits', { name: 'PDBull_Fan', amount: 50, message: 'Cheer50' });
    case 'bits500': return al('bits', { name: 'PDBull_Fan', amount: 500, message: 'Cheer500 nice play' });
    case 'bits1500': return al('bits', { name: 'PDBull_Fan', amount: 1500, message: 'Cheer1500 take my bits' });
    case 'donShort': return al('donation', { name: 'PDBull_Fan', amount: 5, currency: 'USD', message: 'Good luck!' });
    case 'donLong': return al('donation', { name: 'PDBull_Fan', amount: 25, currency: 'USD', message: 'Watching since the first Arabia game and still learning something new every stream. Thanks for the long sessions, the calm commentary and the honest reviews of every lost fight, keep it up!' });
    case 'longName': return al('follow', { name: LONG_NAME });
    // fresh ids on every click: a test always plays, never lands in sessionStorage, and the
    // event id lets receivers drop the local-bus / room double delivery
    case 'intro1v1': return { name: 'match-start', payload: { type: 'match-start', id, match: { ...(opts.match1v1 || fakeMatch1v1()), id: `test-1v1-${now}` } } };
    case 'intro4v4': return { name: 'match-start', payload: { type: 'match-start', id, match: { ...fakeMatch4v4(), id: `test-4v4-${now}` } } };
    default: return null;
  }
}

// Dock events go to the LOCAL bus first (OBS dock and sources share it), then to the room as
// backup. Receivers dedup by event id. latest-snapshot frames are local only: nobody reads
// them in the room and every room message counts against ntfy's daily limit.
const LOCAL_ONLY = new Set(['latest-snapshot']);
export function createSender({ bus, remote }) {
  return async (name, payload) => {
    try { bus.emit(name, payload); } catch { /* local delivery must not block the room copy */ }
    if (LOCAL_ONLY.has(name)) return;
    await remote.publishEvent(name, payload);
  };
}

// Real Streamlabs event -> [settings path, value] for the "last follower" strip, or null.
export function latestUpdate(e) {
  if (!e || !e.name) return null;
  if (e.type === 'follow') return ['latest.follower', e.name];
  if (e.type === 'sub') return ['latest.subscriber', e.name];
  if (e.type === 'donation') return ['latest.donation', e.name];
  return null;
}

// Last `max` raw Streamlabs socket messages, copied (JSON round-trip), token keys dropped, with receive time.
export function createRawLog(max = 50) {
  let items = [];
  const clean = (k, v) => (/^(streamlabs)?token$/i.test(k) ? undefined : v);
  return {
    push(raw) {
      let copy;
      try { copy = JSON.parse(JSON.stringify(raw, clean)); } catch { return; }
      items.push({ t: Date.now(), raw: copy });
      if (items.length > max) items = items.slice(-max);
    },
    list: () => items.slice(),
    clear() { items = []; },
  };
}
