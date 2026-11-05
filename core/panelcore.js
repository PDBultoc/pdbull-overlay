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

export function roomLinks(room, panelUrl) {
  const q = '?room=' + room;
  const at = (p) => new URL(p + q, panelUrl).href;
  return { overlay: at('overlay.html'), starting: at('scenes/starting.html'), brb: at('scenes/brb.html') };
}

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
    case 'intro1v1': return { name: 'match-start', payload: { type: 'match-start', match: opts.match1v1 || fakeMatch1v1() } };
    case 'intro4v4': return { name: 'match-start', payload: { type: 'match-start', match: fakeMatch4v4() } };
    default: return null;
  }
}

// Real Streamlabs event -> [settings path, value] for the "last follower" strip, or null.
export function latestUpdate(e) {
  if (!e || !e.name) return null;
  if (e.type === 'follow') return ['latest.follower', e.name];
  if (e.type === 'sub') return ['latest.subscriber', e.name];
  if (e.type === 'donation') return ['latest.donation', e.name];
  return null;
}
