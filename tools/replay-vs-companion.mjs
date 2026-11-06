// G2: compare replay colours/teams with aoe2companion for the same games (matched by the set of profile ids).
// node tools/replay-vs-companion.mjs "<savegame folder>" <profileId> [<profileId> …]
import fs from 'node:fs';
import path from 'node:path';
import { inflateHead, playersFromHeader, teamsFromPlayers, startedAtFromName, HEAD_BYTES } from '../core/recheader.js';
const [dir, ...ids] = process.argv.slice(2);
const key = (pids) => [...pids].map(Number).sort((a, b) => a - b).join(',');
const byKey = new Map(); // same lineup → several replays (rematches): pick the one closest in time
for (const f of fs.readdirSync(dir).filter((x) => /\.aoe2record$/i.test(x))) {
  const at = startedAtFromName(f); if (!at) continue;
  const fd = fs.openSync(path.join(dir, f), 'r'); const buf = Buffer.alloc(HEAD_BYTES); const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0); fs.closeSync(fd);
  const h = await inflateHead(new Blob([buf.subarray(0, n)])); const ps = h ? playersFromHeader(h) : [];
  if (ps.length < 2) continue;
  const k = key(ps.map((p) => p.profileId));
  (byKey.get(k) || byKey.set(k, []).get(k)).push({ f, ps, t: new Date(at).getTime() }); // file name time is local
}
const closest = (k, startedIso) => {
  const t = Date.parse(startedIso); let best = null;
  for (const r of byKey.get(k) || []) if (Math.abs(r.t - t) <= 30 * 60000 && (!best || Math.abs(r.t - t) < Math.abs(best.t - t))) best = r;
  return best;
};
let ok = 0, diff = 0;
for (const id of ids) {
  for (const page of [1, 2]) {
    const r = await fetch(`https://data.aoe2companion.com/api/matches?profile_ids=${id}&page=${page}`, { headers: { 'user-agent': 'pdbull-overlay replay gate' } });
    if (!r.ok) { console.log(`aoe2companion http ${r.status} for ${id} page ${page}`); continue; }
    for (const m of (await r.json()).matches || []) {
      const cps = m.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.teamId })));
      const rep = closest(key(cps.map((p) => p.profileId)), m.started);
      if (!rep) continue;
      const teams = teamsFromPlayers(rep.ps);
      const repColor = new Map(teams.flatMap((t) => t.players.map((p) => [p.profileId, p.color.toUpperCase()])));
      const split = (groups) => groups.map((g) => key(g)).sort().join(' | ');
      const colourOk = cps.every((p) => repColor.get(p.profileId) === String(p.colorHex).toUpperCase());
      const teamOk = split(teams.map((t) => t.players.map((p) => p.profileId))) === split(m.teams.map((t) => t.players.map((p) => p.profileId)));
      if (colourOk && teamOk) ok++; else diff++;
      console.log(`${colourOk && teamOk ? 'OK  ' : 'DIFF'} ${m.matchId} ${m.mapName} ↔ ${rep.f}${colourOk ? '' : ' colours'}${teamOk ? '' : ' teams'}`);
    }
  }
}
console.log(`compared ${ok + diff}: OK ${ok}, DIFF ${diff}`);
