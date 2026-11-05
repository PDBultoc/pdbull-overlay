// Pure data for the in-game match banner. Browser + node safe.
// match = normalizeMatch shape; ratings = Map profileId -> RM 1v1 ELO (missing / null = unknown).
const MAX_ROWS = 4;

export function eloText(r) {
  return typeof r === 'number' && Number.isFinite(r) ? String(r) : '—';
}

function avgOf(players) {
  const v = players.map((p) => p.rating).filter((x) => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** -> { map, teams: [{ mine, avg, players: [{ id, name, civ, colorHex, rating, me }] }] }, my team first; null for no match */
export function barFromMatch(match, ratings) {
  if (!match) return null;
  const meId = match.me && match.me.profileId;
  const rate = (id) => {
    const r = ratings && typeof ratings.get === 'function' ? ratings.get(id) : null;
    return typeof r === 'number' && Number.isFinite(r) ? r : null;
  };
  const mk = (team, mine) => {
    // Paul's row leads his team (the API lists players in lobby order)
    const ordered = [...(team || [])].sort((a, b) => (b.profileId === meId) - (a.profileId === meId));
    const players = ordered.slice(0, MAX_ROWS).map((p) => ({
      id: p.profileId,
      name: p.name || 'Player',
      civ: match.hideCivs ? '' : (p.civ || ''),
      colorHex: p.colorHex || '#888888',
      rating: rate(p.profileId),
      me: meId != null && p.profileId === meId,
    }));
    return { mine, avg: avgOf(players), players };
  };
  return {
    map: match.map || 'Unknown map',
    teams: [mk(match.myTeam, true), ...(match.enemies || []).map((t) => mk(t, false))],
  };
}
