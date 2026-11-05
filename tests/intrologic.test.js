import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMatch } from '../core/aoe2.js';
import { introFromMatch, colourName, fitSize, shouldPlay, introCivs, stretchTime } from '../core/intrologic.js';

const P = (id, name, hex, civ = 'Franks') => ({ profileId: id, name, civ, colorHex: hex });
const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/pa100.json', import.meta.url), 'utf8'));

test('colourName: AoE2 palette (incl. real fixture hexes) maps to the pigment names', () => {
  const cases = { '#0000ff': 'blue', '#405BFF': 'blue', '#ff0000': 'red', '#00FF00': 'green', '#FFFF00': 'yellow',
    '#00FFFF': 'teal', '#FF57B3': 'purple', '#ff00ff': 'purple', '#797979': 'grey', '#808080': 'grey', '#FF9600': 'orange', '#ff8000': 'orange' };
  for (const [hex, name] of Object.entries(cases)) assert.equal(colourName(hex), name, hex);
  assert.equal(colourName(0xff0000), 'red');
  assert.equal(colourName(undefined), 'red');
  assert.equal(colourName('nonsense'), 'red');
});

test('introFromMatch on real pa100 match 0 (1v1)', () => {
  const m = normalizeMatch(raw[0], 551021);
  const i = introFromMatch(m);
  assert.equal(i.mode, '1v1');
  assert.deepEqual(i.left.names, ['PDBull']);
  assert.deepEqual(i.right.names, ['SwedishGoblinTwitch']);
  assert.equal(i.map, 'Arabia');
  // pa100.json carries no colorHex: the sides fall back to the prototype pair, never two equal banners
  assert.equal(m.me.colorHex, undefined);
  assert.equal(i.left.colour, 'blue');
  assert.equal(i.right.colour, 'green');
  assert.deepEqual(Object.keys(i).sort(), ['left', 'map', 'mode', 'right']);
});

test('introFromMatch: equal side colours are separated, left keeps its own colour', () => {
  const a = P(1, 'A', '#ff0000'), b = P(2, 'B', '#ff0000');
  const i = introFromMatch({ mode: '1v1', map: 'Arabia', me: a, myTeam: [a], enemies: [[b]] });
  assert.equal(i.left.colour, 'red');
  assert.notEqual(i.right.colour, 'red');
  const c = P(3, 'C', '#0000ff');
  assert.equal(introFromMatch({ mode: '1v1', me: a, myTeam: [a], enemies: [[c]] }).right.colour, 'blue');
});

// SYNTHETIC normalized 4v4 (hand-made, not a real match)
function synth4v4() {
  const me = P(551021, 'PDBull', '#0000ff');
  const myTeam = [P(1, 'Mate_One', '#00ff00'), me, P(2, 'Mate_Two', '#00ffff'), P(3, 'Mate_Three', '#ffff00')];
  const foes = [P(4, 'Foe_A', '#ff0000'), P(5, 'Foe_B', '#ff8000'), P(6, 'Foe_C', '#808080'), P(7, 'Foe_D', '#ff00ff')];
  return { id: 'syn', mode: 'tg', map: 'Black Forest', me, myTeam, enemies: [foes], hideCivs: false };
}

test('introFromMatch synthetic 4v4: mode team, me first on the left, <=4 per side', () => {
  const i = introFromMatch(synth4v4());
  assert.equal(i.mode, 'team');
  assert.deepEqual(i.left.names, ['PDBull', 'Mate_One', 'Mate_Two', 'Mate_Three']);
  assert.deepEqual(i.right.names, ['Foe_A', 'Foe_B', 'Foe_C', 'Foe_D']);
  assert.equal(i.left.colour, 'blue');
  assert.equal(i.right.colour, 'red');
  assert.equal(i.map, 'Black Forest');
});

test('introFromMatch caps at 4 per side, merges several enemy teams, tolerates missing data', () => {
  const m = synth4v4();
  m.myTeam.push(P(8, 'Extra', '#fff'));
  m.enemies = [[P(4, 'A', '#ff0000'), P(5, 'B', '#ff0000')], [P(6, 'C', '#00ff00'), P(7, 'D', '#00ff00'), P(9, 'E', '#00ff00')]];
  const i = introFromMatch(m);
  assert.equal(i.left.names.length, 4);
  assert.deepEqual(i.right.names, ['A', 'B', 'C', 'D']);
  const bare = introFromMatch({ mode: '1v1', me: P(1, '', '#f00'), myTeam: [P(1, '', '#f00')], enemies: [[P(2, undefined, '#0f0')]] });
  assert.deepEqual(bare.left.names, ['Player']);
  assert.deepEqual(bare.right.names, ['Player']);
  assert.equal(bare.map, 'Unknown map');
  assert.equal(introFromMatch(null), null);
});

test('introCivs: civs per side, blank when the lobby hides civs', () => {
  const m = normalizeMatch(raw[0], 551021);
  const c = introCivs(m);
  assert.equal(c.left[0], m.me.civ);
  assert.equal(introCivs({ ...m, hideCivs: true }).left[0], '');
});

test('team game on the real browser fixture (pdbull-tg.json) when present', (t) => {
  const url = new URL('./fixtures/pdbull-tg.json', import.meta.url);
  if (!fs.existsSync(url)) { t.skip('tests/fixtures/pdbull-tg.json not saved yet (controller adds it from the browser)'); return; }
  const data = JSON.parse(fs.readFileSync(url, 'utf8'));
  const arr = Array.isArray(data) ? data : data.matches || [];
  const tg = arr.map((r) => normalizeMatch(r, 551021)).find((m) => m && m.mode === 'tg');
  assert.ok(tg, 'fixture holds a team game');
  const i = introFromMatch(tg);
  assert.equal(i.mode, 'team');
  assert.equal(i.map, tg.map);
  for (const side of [i.left, i.right]) {
    assert.ok(side.names.length >= 1 && side.names.length <= 4);
    for (const n of side.names) assert.ok(n && n !== 'Player');
  }
  assert.equal(i.left.names[0], tg.me.name);
});

test('fitSize: shrinks to the width, never below the floor, never grows', () => {
  const w = (px) => px * 20; // 20 em wide text
  assert.equal(fitSize(w, 1300, 200, 36), 65);
  assert.equal(fitSize(w, 1300, 50, 36), 50);
  assert.equal(fitSize(w, 400, 200, 36), 36);
  assert.ok(w(fitSize(w, 1300, 200, 36)) <= 1300);
});

test('shouldPlay: once per match id, test ids always, survives a broken storage', () => {
  const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
  const s = mem();
  assert.equal(shouldPlay(s, { id: 123 }), true);
  assert.equal(shouldPlay(s, { id: 123 }), false);
  assert.equal(shouldPlay(s, { id: 124 }), true);
  assert.equal(shouldPlay(s, { id: 123 }), false);
  assert.equal(shouldPlay(s, { id: 'test-1v1' }), true);
  assert.equal(shouldPlay(s, { id: 'test-1v1' }), true);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(shouldPlay(bad, { id: 5 }), true);
  assert.equal(shouldPlay(null, { id: 5 }), true);
  assert.equal(shouldPlay(s, null), false);
});

test('stretchTime: identity at the base duration, holds the stamped state for longer runs', () => {
  assert.equal(stretchTime(1, 5.2, 5.2), 1);
  assert.equal(stretchTime(5.2, 5.2, 5.2), 5.2);
  const hold = 6.5 - 5.2;
  assert.equal(stretchTime(3.9 + hold / 2, 6.5, 5.2), 3.9);
  assert.ok(Math.abs(stretchTime(6.5, 6.5, 5.2) - 5.2) < 1e-9);
  assert.equal(stretchTime(2, 4, 5.2), 2); // shorter request: no change
});
