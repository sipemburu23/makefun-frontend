// Read-only client for make.fun's public API (GET https://make.fun/api/...).
// Every answer is cached in memory and in sessionStorage with its ETag, and
// revalidated with If-None-Match, so a revisit inside the same minute costs
// one cheap 304 instead of a full download. Nothing here ever writes.

const BASE = "https://make.fun/api";
const mem = new Map();

function cacheKey(url) {
  return "mf:" + url;
}

function readCache(url) {
  const hit = mem.get(url);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    mem.set(url, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(url, entry) {
  mem.set(url, entry);
  try {
    sessionStorage.setItem(cacheKey(url), JSON.stringify(entry));
  } catch {
    // Storage full or private mode: the in-memory copy still works.
  }
}

// Fetch one JSON answer, revalidating a cached copy when there is one.
// A 304 keeps the cached body; any other failure falls back to it too,
// so a flaky minute still shows the last good data instead of an error.
export async function fetchJson(path) {
  const url = BASE + path;
  const cached = readCache(url);
  const headers = { Accept: "application/json" };
  if (cached && cached.etag) headers["If-None-Match"] = cached.etag;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    if (cached) return cached.body;
    throw err;
  }
  if (res.status === 304 && cached) return cached.body;
  if (!res.ok) {
    if (cached) return cached.body;
    throw new Error("make.fun API " + res.status + " for " + path);
  }
  const body = await res.json();
  writeCache(url, { etag: res.headers.get("ETag"), body });
  return body;
}

// The board: one call, up to 100 bounties, newest first from the API.
export function listCompetitions() {
  return fetchJson("/competitions?limit=100");
}

export function getCompetition(slug) {
  return fetchJson("/competitions/" + encodeURIComponent(slug));
}

// Leaderboard rows come back ranked; limit keeps the payload small.
export function getLeaderboard(slug, limit) {
  return fetchJson(
    "/competitions/" + encodeURIComponent(slug) + "/leaderboard?limit=" + (limit || 50),
  );
}

export function getProfile(handle) {
  return fetchJson("/profiles/" + encodeURIComponent(handle));
}
