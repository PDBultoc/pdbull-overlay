// RM 1v1 ELO lookup for the match intro. Pure + injectable fetch; browser + node safe.
// Source: GET https://data.aoe2companion.com/api/profiles/<id> -> { leaderboards: [{ leaderboardId, rating }] }
export const PROFILE_URL = 'https://data.aoe2companion.com/api/profiles/';

/** profile JSON -> rm_1v1 rating (number) or null */
export function rm1v1(profile) {
  const lb = profile && Array.isArray(profile.leaderboards) ? profile.leaderboards.find((l) => l && l.leaderboardId === 'rm_1v1') : null;
  const r = lb ? Number(lb.rating) : NaN;
  return Number.isFinite(r) ? r : null;
}

export function createRatings({ fetchFn = globalThis.fetch, ttlMs = 10 * 60 * 1000, now = () => Date.now(), timeoutMs = 2500 } = {}) {
  const cache = new Map(); // id -> { v, at }
  async function one(id) {
    try {
      const r = await fetchFn(PROFILE_URL + encodeURIComponent(id));
      if (!r || !r.ok) return null;
      return rm1v1(await r.json());
    } catch { return null; }
  }
  return {
    /** ids -> Promise<Map<id, number|null>>; never rejects; ids unresolved after timeoutMs -> null */
    async get(profileIds) {
      const ids = [...new Set((profileIds || []).filter((x) => x != null))];
      const out = new Map(ids.map((id) => [id, null]));
      const t = now();
      const todo = [];
      for (const id of ids) {
        const c = cache.get(id);
        if (c && t - c.at < ttlMs) out.set(id, c.v); else todo.push(id);
      }
      if (!todo.length) return out;
      let timer;
      const jobs = todo.map((id) => one(id).then((v) => { out.set(id, v); cache.set(id, { v, at: now() }); }));
      await Promise.race([Promise.all(jobs), new Promise((res) => { timer = setTimeout(res, timeoutMs); })]);
      clearTimeout(timer);
      return new Map(out); // snapshot: late answers after the timeout do not change it
    },
  };
}
