// Pure logic for the camchat module and the overlay status relay (no DOM).

// Chat bottom edge (px from the bottom of the 1920x1080 canvas): the in-game score
// panel ends at y 890 for 2 players and grows 24 px upward per extra player.
export function chatBottom(players) {
  const n = Math.min(8, Math.max(2, Math.floor(Number(players)) || 2));
  return 190 + 24 * (n - 2);
}

// Players in a normalized match (myTeam + all enemy teams); 2 when there is no match.
export function playerCount(match) {
  if (!match || !match.myTeam) return 2;
  const n = match.myTeam.length + (match.enemies || []).reduce((s, t) => s + t.length, 0);
  return n || 2;
}

const emoteUrl = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;

// Twitch `emotes` tag ("25:0-4,6-10/305954156:12-18") -> text and {e:url} parts in order.
export function emoteParts(text, tag) {
  const s = String(text == null ? '' : text);
  const ranges = [];
  for (const grp of String(tag || '').split('/')) {
    const [id, rs] = grp.split(':');
    if (!id || !rs || !/^\w+$/.test(id)) continue;
    for (const r of rs.split(',')) {
      const m = /^(\d+)-(\d+)$/.exec(r);
      if (m) ranges.push({ a: +m[1], b: +m[2], id });
    }
  }
  if (!ranges.length) return [s];
  ranges.sort((x, y) => x.a - y.a);
  const out = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.a < pos || r.b < r.a || r.a >= s.length) continue;
    if (r.a > pos) out.push(s.slice(pos, r.a));
    out.push({ e: emoteUrl(r.id) });
    pos = r.b + 1;
  }
  if (pos < s.length) out.push(s.slice(pos));
  return out;
}

// Relays a source status to the room only when its ok/reason changes. Only the
// overlay's own aoe2 and chat sources go out (sync/streamlabs belong to the dock),
// and it is fed by local sources only, never by events that came back from the room.
export function createStatusRelay(publish) {
  const last = new Map();
  return (st) => {
    if (!st || (st.source !== 'aoe2' && st.source !== 'chat')) return;
    const key = JSON.stringify([!!st.ok, st.reason == null ? null : String(st.reason)]);
    if (last.get(st.source) === key) return;
    last.set(st.source, key);
    const p = { source: st.source, ok: !!st.ok };
    if (st.reason != null) p.reason = String(st.reason);
    publish(p);
  };
}
