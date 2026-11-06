import test from 'node:test';
import assert from 'node:assert/strict';
import { FX, DURATION, clampPoint, makeReaction, replaces, createTally, playersFromMatch, parseManual, searchUrl, searchEntries, seeded, castingChatBottom, caKeepOut, castSourceLine } from '../core/reactionlogic.js';

test('six reactions with their lengths', () => {
  assert.deepEqual(FX, ['blunder', 'funny', 'wow', 'wololo', 'spotlight', 'gg']);
  assert.deepEqual(DURATION, { blunder: 2.8, funny: 3.6, wow: 3.2, wololo: 2.6, spotlight: 4.5, gg: 8 });
});
test('clampPoint keeps text on screen and defaults to the play-area centre', () => {
  assert.deepEqual(clampPoint(NaN, undefined), { x: 960, y: 500 });
  assert.deepEqual(clampPoint(-50, 2000), { x: 60, y: 810 });
  assert.deepEqual(clampPoint(700, 400), { x: 700, y: 400 });
});
test('makeReaction validates fx, player and point', () => {
  assert.equal(makeReaction({ fx: 'nope' }), null);
  const r = makeReaction({ fx: 'wow', player: { name: 'F1Re', color: '#e0392e' }, x: 5, y: 5, id: 'a1' });
  assert.deepEqual(r, { fx: 'wow', player: { name: 'F1Re', color: '#e0392e' }, x: 60, y: 190, id: 'a1' });
  const bad = makeReaction({ fx: 'gg', player: { name: 'x'.repeat(40), color: 'red' }, id: 'b' });
  assert.equal(bad.player.name.length, 25);
  assert.equal(bad.player.color, '#d6c6a6');
  assert.equal(makeReaction({ fx: 'funny', id: 'c' }).player, null);
  assert.match(makeReaction({ fx: 'funny' }).id, /^r-/);
});
test('a new reaction replaces the current one, except over GG', () => {
  assert.equal(replaces(null, { fx: 'wow' }), true);
  assert.equal(replaces({ fx: 'blunder' }, { fx: 'wow' }), true);
  assert.equal(replaces({ fx: 'gg' }, { fx: 'wow' }), false);
  assert.equal(replaces({ fx: 'gg' }, { fx: 'gg' }), true);
});
test('tally: first known match keeps rows fired before it; a switch between known matches resets', () => {
  const a = { name: 'A', color: '#111111' };
  const t = createTally();
  t.record('wow', a);
  t.forMatch('m1'); assert.equal(t.rows().length, 1);   // null -> m1: kept
  t.forMatch('m2'); assert.equal(t.rows().length, 0);   // m1 -> m2: reset
});
test('tally counts per player, resets on a new match, awards go to the latest on ties', () => {
  const t = createTally();
  const a = { name: 'A', color: '#111111' }, b = { name: 'B', color: '#222222' };
  t.forMatch('m1');
  t.record('wow', a); t.record('wow', b); t.record('blunder', a); t.record('funny', b); t.record('spotlight', a);
  assert.deepEqual(t.rows().map((r) => [r.name, r.wows, r.blunders, r.funnies]), [['A', 1, 1, 0], ['B', 1, 0, 1]]);
  assert.equal(t.awards().play.name, 'B');      // tie 1-1: B was recorded later
  assert.equal(t.awards().blunder.name, 'A');
  t.forMatch('m1'); assert.equal(t.rows().length, 2);   // same match: kept
  t.forMatch('m2'); assert.equal(t.rows().length, 0);   // new match: reset
  assert.deepEqual(t.awards(), { play: null, blunder: null });
  t.record('wow', null); assert.equal(t.rows().length, 0); // no player: not counted
});
test('playersFromMatch lists teams with name and colour', () => {
  const p = (name, colorHex) => ({ name, colorHex });
  const m = { myTeam: [p('A', '#405BFF'), p('B', '#ffd700')], enemies: [[p('C', '#FF0000')], [p('D', 'bad')]] };
  assert.deepEqual(playersFromMatch(m), [
    { team: 1, players: [{ name: 'A', color: '#405BFF' }, { name: 'B', color: '#ffd700' }] },
    { team: 2, players: [{ name: 'C', color: '#FF0000' }] },
    { team: 3, players: [{ name: 'D', color: '#d6c6a6' }] },
  ]);
  assert.deepEqual(playersFromMatch(null), []);
});
test('follow-player search: url and entries', () => {
  assert.equal(searchUrl('F1 Re'), 'https://data.aoe2companion.com/api/profiles?search=F1%20Re&page=1');
  const json = { profiles: [{ profileId: 196310, name: 'F1Re', country: 'br', games: '15669' }, { name: 'no id' }] };
  assert.deepEqual(searchEntries(json), [{ profileId: 196310, name: 'F1Re', country: 'br', games: 15669 }]);
  assert.deepEqual(searchEntries(null), []);
});
test('manual players: one "Name #rrggbb" per line, up to 8, one team', () => {
  assert.deepEqual(parseManual('Hera #2fbf4a\n  TaToH \nbad line #zz\n'), [
    { team: 1, players: [{ name: 'Hera', color: '#2fbf4a' }, { name: 'TaToH', color: '#d6c6a6' }, { name: 'bad line #zz', color: '#d6c6a6' }] }]);
  assert.deepEqual(parseManual(''), []);
  assert.equal(parseManual(Array.from({ length: 12 }, (_, i) => 'P' + i).join('\n'))[0].players.length, 8);
});
test('CA score rows: chat bottom and keep-out grow with the player count (measured 2026-11-06)', () => {
  assert.deepEqual([2, 4, 6, 8].map(castingChatBottom), [198, 266, 373, 480]);
  assert.equal(castingChatBottom(3), 232);          // halfway between 2 and 4
  assert.equal(castingChatBottom(0), 198); assert.equal(castingChatBottom(20), 480);
  assert.deepEqual(caKeepOut(8), { x: 1520, y: 600, w: 400, h: 370 });
  assert.deepEqual(caKeepOut(2), { x: 1670, y: 882, w: 250, h: 88 });
});
test('seeded is deterministic', () => {
  const a = seeded(7), b = seeded(7);
  assert.equal(a(), b()); assert.equal(a(), b());
});
test('castSourceLine: where the dock players come from', () => {
  const teams = [{ team: 1, players: [{ name: 'A' }, { name: 'B' }] }, { team: 2, players: [{ name: 'C' }] }];
  assert.equal(castSourceLine({ source: 'replay', startedAt: '2026-11-06T14:23:38', teams }), 'From replay 14:23 · 3 players');
  assert.equal(castSourceLine({ source: 'replay', startedAt: null, teams }), 'From replay · 3 players');
  assert.equal(castSourceLine({ matchId: 'm1', teams }), 'From aoe2companion · 3 players');
  assert.equal(castSourceLine({ teams: [] }), 'No match yet: manual list below');
  assert.equal(castSourceLine(null), 'No match yet: manual list below');
});
