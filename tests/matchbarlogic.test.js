import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMatch } from '../core/aoe2.js';
import { rm1v1 } from '../core/ratings.js';
import { barFromMatch, eloText } from '../core/matchbarlogic.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const pa100 = load('pa100.json');
const tg = load('pdbull-tg.json');
const profiles = load('profiles-rm1v1.json');
const map = new Map(profiles.map((p) => [p.profileId, rm1v1(p)]));

test('eloText: number or em dash', () => {
  assert.equal(eloText(1834), '1834');
  assert.equal(eloText(null), '—');
  assert.equal(eloText(undefined), '—');
  assert.equal(eloText(NaN), '—');
});

test('barFromMatch on real pa100 match 0 (1v1): 2 rows, me first, ELO from the map', () => {
  const m = normalizeMatch(pa100[0], 551021);
  const b = barFromMatch(m, map);
  assert.equal(b.map, m.map);
  assert.equal(b.teams.length, 2);
  assert.equal(b.teams[0].mine, true);
  assert.equal(b.teams[1].mine, false);
  assert.equal(b.teams[0].players.length, 1);
  assert.equal(b.teams[1].players.length, 1);
  const me = b.teams[0].players[0];
  assert.equal(me.id, 551021);
  assert.equal(me.me, true);
  assert.equal(me.rating, 1505);
  assert.equal(me.name, m.me.name);
  assert.equal(me.civ, m.me.civ);
  assert.equal(me.colorHex, m.me.colorHex || '#888888'); // the pa100 sample carries no colorHex: neutral fallback
  const foe = b.teams[1].players[0];
  assert.equal(foe.me, false);
  assert.equal(foe.id, m.enemies[0][0].profileId);
  assert.equal(foe.rating, map.has(foe.id) ? map.get(foe.id) : null);
  assert.equal(b.teams[0].avg, 1505);
});

test('barFromMatch on real team games: one block per team, my team first, map = mapName', () => {
  const ms = [0, 1].map((k) => normalizeMatch(tg[k], 551021));
  const b0 = barFromMatch(ms[0], map);
  assert.equal(b0.map, 'Arena');
  assert.equal(b0.teams.length, 2);
  assert.deepEqual(b0.teams[0].players.map((p) => p.name), ['PDBull', 'SwedishGoblinTwitch', 'Havsutsikt']);
  assert.deepEqual(b0.teams[0].players.map((p) => p.rating), [1505, 1257, 1131]);
  assert.deepEqual(b0.teams[1].players.map((p) => p.rating), [1955, 1725, 1655]);
  assert.equal(b0.teams[0].avg, Math.round((1505 + 1257 + 1131) / 3));
  assert.equal(b0.teams[1].avg, Math.round((1955 + 1725 + 1655) / 3));
  assert.equal(b0.teams[0].mine, true);
  assert.deepEqual(b0.teams[0].players.map((p) => p.me), [true, false, false]);
  // Paul on teams[1] in the raw data: still first in the bar
  const b1 = barFromMatch(ms[1], map);
  assert.equal(b1.map, 'Black Forest');
  assert.equal(b1.teams[0].players[0].name, 'PDBull');
  assert.equal(b1.teams[0].players.length, 2);
  for (const t of b1.teams) assert.ok(t.players.length <= 4);
});

test('missing rating -> null, eloText "—", team avg ignores nulls, all null -> avg null', () => {
  const m = normalizeMatch(tg[0], 551021);
  const part = new Map([[551021, 1505], [20186100, null]]);
  const b = barFromMatch(m, part);
  assert.deepEqual(b.teams[0].players.map((p) => p.rating), [1505, null, null]);
  assert.equal(eloText(b.teams[0].players[1].rating), '—');
  assert.equal(b.teams[0].avg, 1505);
  assert.equal(b.teams[1].avg, null);
  const none = barFromMatch(m, new Map());
  assert.equal(none.teams[0].avg, null);
  assert.equal(barFromMatch(m, null).teams[0].players[0].rating, null);
});

test('barFromMatch: >4 per team capped, hidden civs blank, null match -> null', () => {
  const P = (id) => ({ profileId: id, name: 'p' + id, civ: 'Franks', colorHex: '#fff' });
  const mine = [1, 2, 3, 4, 5].map(P);
  const m = { map: 'X', me: mine[0], myTeam: mine, enemies: [[P(9)]], hideCivs: true };
  const b = barFromMatch(m, new Map());
  assert.equal(b.teams[0].players.length, 4);
  assert.equal(b.teams[0].players[0].civ, '');
  assert.equal(barFromMatch(null, new Map()), null);
});
