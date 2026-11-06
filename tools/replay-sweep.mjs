// G1: parse every replay in a folder; prints counts and the files that fail.
// node tools/replay-sweep.mjs "<savegame folder>"   (after an AoE2 patch too: a changed header shows here first)
import fs from 'node:fs';
import path from 'node:path';
import { inflateHead, playersFromHeader, teamsFromPlayers, HEAD_BYTES } from '../core/recheader.js';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => /\.aoe2record$/i.test(f));
const hist = {}; const empty = []; const noTeams = []; const ms = [];
for (const f of files) {
  const t0 = performance.now();
  const fd = fs.openSync(path.join(dir, f), 'r'); const buf = Buffer.alloc(HEAD_BYTES); const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0); fs.closeSync(fd);
  const h = await inflateHead(new Blob([buf.subarray(0, n)]));
  const ps = h ? playersFromHeader(h) : [];
  ms.push(performance.now() - t0);
  hist[ps.length] = (hist[ps.length] || 0) + 1;
  if (!ps.length) empty.push(f);
  else if (ps.length >= 2 && teamsFromPlayers(ps).length < 2) noTeams.push(f);
}
ms.sort((a, b) => a - b);
console.log(`files ${files.length}  players-per-file ${JSON.stringify(hist)}  empty ${empty.length}  noTeams ${noTeams.length}  median ${ms[ms.length >> 1].toFixed(1)} ms  max ${ms.at(-1).toFixed(1)} ms`);
for (const f of [...empty.map((x) => 'EMPTY ' + x), ...noTeams.map((x) => 'NOTEAMS ' + x)].slice(0, 30)) console.log(f);
