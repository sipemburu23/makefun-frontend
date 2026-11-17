// Trifold data layer: one in-memory cache shared by every view, ETag
// revalidation, and honest per-view counters. Every view fetches at most one
// fresh URL; everything else it needs comes from this cache (from memory).
// A bounty past its deadline may still read status open until its results
// are published, so liveness is decided by the deadline, never by status.

export const API = 'https://make.fun/api';

// url -> { etag, json, at }: the single cache every view reads and writes.
export const cache = new Map();

// Per-view counters, reset on every navigation. req counts 200 answers,
// unch counts 304 answers, mem counts answers served without a request.
export const stats = { req: 0, unch: 0, mem: 0 };
export function resetStats() { stats.req = 0; stats.unch = 0; stats.mem = 0; }

// Fresh for 30 s: inside the window the answer comes from memory, no fetch.
// Older than that, revalidate with If-None-Match: a 304 keeps the cached
// answer (and counts as unchanged), a 200 replaces it (and counts as a
// request). ETags here are bound to the minute, so a revalidation inside
// the same minute answers 304 even when nothing changed.
export async function api(path) {
  const url = API + path;
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && now - hit.at < 30000) { stats.mem++; return hit.json; }
  const headers = {};
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
  const res = await fetch(url, { headers });
  if (res.status === 304 && hit) { stats.unch++; hit.at = now; return hit.json; }
  stats.req++;
  const json = await res.json();
  cache.set(url, { etag: res.headers.get('etag'), json, at: now });
  return json;
}

// Background revalidation, run by the one shared timer every 30 s. It never
// touches the per-view counters: the cache line reports what the view did,
// not what the timer did behind it.
export async function revalidateAll() {
  for (const [url, hit] of cache) {
    if (Date.now() - hit.at < 30000) continue;
    try {
      const res = await fetch(url, { headers: hit.etag ? { 'If-None-Match': hit.etag } : {} });
      if (res.status === 304) { hit.at = Date.now(); }
      else if (res.ok) cache.set(url, { etag: res.headers.get('etag'), json: await res.json(), at: Date.now() });
    } catch { /* offline: keep the cached answer */ }
  }
}

// One fetch per view: the board reads the competitions list, a bounty page
// reads its own competition, a leaderboard reads its leaderboard, a profile
// reads its profile. Each competition object in the list already carries its
// recent submissions (with createdAt and a passed status), its rewardsNow and
// its escrow lock, so the board's last-entry times, the prize-now figures and
// the escrow line cost no extra request.
export const board = () => api('/competitions');
export const bounty = (slug) => api('/competitions/' + slug);
export const leaderboard = (slug) => api('/competitions/' + slug + '/leaderboard');
export const profile = (handle) => api('/profiles/' + handle);

// A bounty is live while its deadline is ahead, whatever its status says.
export const isLive = (c) => c && c.deadline && Date.parse(c.deadline) > Date.now();

// Latest submission time of a bounty, from the submissions the list or the
// detail already carries. Null when the API gives no submissions.
export function lastEntryAt(c) {
  if (!c || !Array.isArray(c.submissions) || !c.submissions.length) return null;
  let t = 0;
  for (const s of c.submissions) { const d = Date.parse(s.createdAt || ''); if (d > t) t = d; }
  return t || null;
}

// Entries that passed the checks, from the detail's submissions. The list
// caps submissions at 50, so only the detail's full list gives the true
// passed count; the board never claims one.
export function passedCount(c) {
  if (!c || !Array.isArray(c.submissions)) return null;
  let n = 0;
  for (const s of c.submissions) if (s.status === 'passed') n++;
  return n;
}

// Prize now for a place, from rewardsNow: base + fee share, as the API
// computes it. Null when the bounty pays no such place.
export function prizeNow(c, place) {
  const rows = c && Array.isArray(c.rewardsNow) ? c.rewardsNow : null;
  if (!rows) return null;
  for (const r of rows) if (r.place === place) return parseFloat(r.amountUsd);
  return null;
}

// Escrowed dollars actually held, from the live escrow lock (base units of
// the USDC mint, 6 decimals). Null when the API exposes no lock.
export function escrowHeldUsd(c) {
  const lock = c && c.escrowLock;
  if (!lock || lock.held_base_units == null) return null;
  return Number(lock.held_base_units) / 1e6;
}
