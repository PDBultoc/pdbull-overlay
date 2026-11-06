import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playersFromHeader, teamsFromPlayers, startedAtFromName, replayMatch, inflateHead, replayFromFile } from '../core/recheader.js';

const fx = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/rec/${n}`, import.meta.url)));
const rows = (b) => playersFromHeader(b).map((p) => [p.name, p.profileId, p.number, p.color, p.team]);
const LIVE = 'MP Replay v101.103.57257.0 @2026.11.06 142338 (1).aoe2record';

test('1v1 from a live replay (save 68.9): name, profile id, number, colour id, team byte', () => {
  assert.deepEqual(rows(fx('poo-dobby.bin')), [['PolishedPoo', 10440776, 1, 1, 2], ['Dobby', 1947956, 2, 0, 3]]);
});
test('4v4 with custom-civ lists before the names', () => {
  assert.deepEqual(rows(fx('4v4-cc.bin')), [['PolishedPoo', 10440776, 1, 5, 2], ['MaxPain', 5897473, 2, 0, 3], ['Lukasso', 968628, 3, 3, 2],
    ['极致的数值', 11966470, 4, 4, 3], ['PDBull', 551021, 5, 7, 2], ['DearBanana', 17402278, 6, 2, 3], ['奶糖小团子', 18432299, 7, 1, 2], ['咔咔', 12386146, 8, 6, 3]]);
});
test('a custom-civ count that only looks valid is rejected by the field checks', () => {
  assert.deepEqual(rows(fx('cc-trap.bin')), [['The Potato King', 3974891, 1, 1, 2], ['Tenacious_Lee', 730927, 2, 0, 3], ['wh_halcon', 3831060, 3, 3, 2], ['PDBull', 551021, 4, 2, 3]]);
});
test('co-op: two players share a number and a colour', () => {
  assert.deepEqual(rows(fx('coop.bin')), [['JAM_Josim', 1627260, 1, 0, 2], ['OIDA | Thorb0203', 4527022, 1, 0, 2], ['NO MAMES', 24374627, 2, 6, 3], ['Fer_amicus', 3215548, 2, 6, 3]]);
});
test('team byte 0 and FFA (team byte 1) are read as stored', () => {
  assert.deepEqual(rows(fx('team0.bin'))[2], ['Mike', 23021957, 3, 0, 0]);
  assert.equal(rows(fx('team0.bin')).length, 8);
  assert.deepEqual(rows(fx('ffa.bin')), [['Tramonta', 6312420, 1, 1, 1], ['l1ttl3', 2370053, 2, 0, 1]]);
});
test('empty or junk bytes give no players', () => {
  assert.deepEqual(playersFromHeader(new Uint8Array(0)), []);
  assert.deepEqual(playersFromHeader(new Uint8Array(4096)), []);
});
test('teamsFromPlayers: teams in order, colours as aoe2companion colorHex', () => {
  assert.deepEqual(teamsFromPlayers(playersFromHeader(fx('poo-dobby.bin'))), [
    { team: 1, players: [{ name: 'PolishedPoo', color: '#FF0000', profileId: 10440776 }] },
    { team: 2, players: [{ name: 'Dobby', color: '#405BFF', profileId: 1947956 }] },
  ]);
});
test('teamsFromPlayers: FFA = one group per player; team byte 0 goes to a last "?" group', () => {
  assert.deepEqual(teamsFromPlayers(playersFromHeader(fx('ffa.bin'))).map((t) => [t.team, t.players.map((p) => p.name)]), [[1, ['Tramonta']], [2, ['l1ttl3']]]);
  const t0 = teamsFromPlayers(playersFromHeader(fx('team0.bin')));
  assert.deepEqual(t0.map((t) => [t.team, t.players.length]), [[1, 3], [2, 4], ['?', 1]]);
  assert.equal(t0[2].players[0].name, 'Mike');
});
test('startedAtFromName / replayMatch', () => {
  assert.equal(startedAtFromName(LIVE), '2026-11-06T14:23:38');
  assert.equal(startedAtFromName('[DD3] OIDA JAM vs LOS PRIMOS G1.aoe2record'), null);
  const m = replayMatch(LIVE, playersFromHeader(fx('poo-dobby.bin')));
  assert.equal(m.id, LIVE); assert.equal(m.source, 'replay'); assert.equal(m.startedAt, '2026-11-06T14:23:38'); assert.equal(m.teams.length, 2);
});
test('inflateHead: the raw file head inflates to the same bytes as the fixture', async () => {
  const h = await inflateHead(new Blob([fx('poo-dobby.head')]));
  assert.deepEqual(Buffer.from(h), Buffer.from(fx('poo-dobby.bin')));
});
test('inflateHead: not a replay → null (bad length, bad deflate)', async () => {
  assert.equal(await inflateHead(new Blob([new Uint8Array(100)])), null);
  const bad = new Uint8Array(200); bad.set([200, 0, 0, 0]); bad.fill(255, 8);
  assert.equal(await inflateHead(new Blob([bad])), null);
});
test('replayFromFile: a File becomes a replay-match payload; junk → null', async () => {
  const m = await replayFromFile(new File([fx('poo-dobby.head')], LIVE));
  assert.deepEqual(m.teams.map((t) => t.players.map((p) => p.name)), [['PolishedPoo'], ['Dobby']]);
  assert.equal(await replayFromFile(new File([new Uint8Array(50)], 'x.aoe2record')), null);
});
