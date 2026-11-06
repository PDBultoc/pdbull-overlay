// Players from an AoE2 DE replay header (.aoe2record). Checked 2026-11-06 on save 68.9, 620 real replays.
// Layout: uint32 header length, uint32, then raw deflate. Each player slot holds 4 DE strings
// (60 0A + uint16 length): "", 1 byte, ai name, censored name, name; then uint32 type, uint32 profile id,
// 4 bytes, int32 number. Before the first string: int32 colour, 2 bytes, team byte, 9 bytes, uint32 civ,
// uint32 custom-civ count c and c uint32 civ ids. Pure ESM: runs in Node and in the browser.
export const HEAD_BYTES = 65536; // raw bytes read from the file
export const SCAN_BYTES = 8192;  // inflated bytes searched for player slots
// aoe2companion colorHex by 0-based replay colour id (aoe2companion's own `color` is 1-based)
export const COLOR_HEX = ['#405BFF', '#FF0000', '#00FF00', '#FFFF00', '#00FFFF', '#FF57B3', '#797979', '#FF9600'];

const dec = new TextDecoder();
function str(b, dv, i) {
  if (i < 0 || i + 4 > b.length || b[i] !== 0x60 || b[i + 1] !== 0x0a) return null;
  const end = i + 4 + dv.getUint16(i + 2, true);
  return end > b.length ? null : { s: dec.decode(b.subarray(i + 4, end)), end };
}
function slotAt(b, dv, g) {
  const a = str(b, dv, g); if (!a || a.s !== '') return null;
  const ai = str(b, dv, a.end + 1); if (!ai) return null;
  const cen = str(b, dv, ai.end); if (!cen) return null;
  const nm = str(b, dv, cen.end); if (!nm || !nm.s) return null;
  const t = nm.end; if (t + 16 > b.length) return null;
  for (let c = 0; c < 64; c++) { // the custom-civ count c sits 4 bytes before the strings, after c civ ids
    const base = g - 4 - 4 * c; if (base - 20 < 0) break;
    if (dv.getUint32(base, true) !== c) continue;
    let ok = true;
    for (let k = 0; k < c; k++) if (dv.getUint32(base + 4 + 4 * k, true) > 100) { ok = false; break; }
    const civ = dv.getUint32(base - 4, true), team = dv.getInt8(base - 14), color = dv.getInt32(base - 20, true);
    if (ok && civ <= 100 && team >= 0 && team <= 5 && color >= 0 && color <= 7) {
      return { name: nm.s, profileId: dv.getUint32(t + 4, true), number: dv.getInt32(t + 12, true), color, team, end: t + 16 };
    }
  }
  return null;
}

/** Inflated header bytes → [{ name, profileId, number, color (0-7), team (raw byte: 0 ?, 1 none, 2.. team 1..) }]. */
export function playersFromHeader(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  const lim = Math.min(b.length - 20, SCAN_BYTES);
  for (let g = 24; g < lim; g++) {
    const p = slotAt(b, dv, g);
    if (p) { const { end, ...row } = p; out.push(row); g = end - 1; }
  }
  return out;
}

/** Players → casting teams: real teams first (1..4), FFA one group per player (team = number), team byte 0 last as '?'. */
export function teamsFromPlayers(players) {
  const groups = new Map();
  for (const p of players || []) {
    const key = p.team === 0 ? '?' : p.team === 1 ? 'f' + p.number : 't' + (p.team - 1);
    if (!groups.has(key)) groups.set(key, { team: p.team === 0 ? '?' : p.team === 1 ? p.number : p.team - 1, players: [] });
    groups.get(key).players.push({ name: p.name, color: COLOR_HEX[p.color], profileId: p.profileId });
  }
  const rank = (g) => (g.team === '?' ? Infinity : g.team);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}

/** 'MP Replay v… @2026.11.06 142338 (1).aoe2record' → '2026-11-06T14:23:38' (local time), else null. */
export function startedAtFromName(name) {
  const m = /@(\d{4})\.(\d{2})\.(\d{2}) (\d{2})(\d{2})(\d{2})/.exec(String(name || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

/** The replay-match payload sent to the room. `name` is the file's base name. */
export function replayMatch(name, players) {
  return { id: String(name), startedAt: startedAtFromName(name), source: 'replay', teams: teamsFromPlayers(players) };
}

/** Blob/File → the first SCAN_BYTES inflated header bytes, or null when it is not a replay. */
export async function inflateHead(blob) {
  const raw = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  if (raw.length < 12) return null;
  const hl = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0, true);
  if (hl < 12) return null;
  const rd = new Blob([raw.subarray(8, Math.min(hl, raw.length))]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = []; let n = 0;
  try {
    while (n < SCAN_BYTES) { const { value, done } = await rd.read(); if (done) break; parts.push(value); n += value.length; }
  } catch { if (!n) return null; } // a cut-off stream errors at its end; what we already have is enough
  rd.cancel().catch(() => {});
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.subarray(0, SCAN_BYTES);
}

/** File (dock picker) → replay-match payload, or null. */
export async function replayFromFile(file) {
  try {
    const h = await inflateHead(file);
    const ps = h ? playersFromHeader(h) : [];
    return ps.length ? replayMatch(file.name, ps) : null;
  } catch { return null; }
}
