// Cached, ETag-revalidated reads of make.fun's public API. Read-only: GET only.
export const API = "https://make.fun/api";
export const ORIGIN = "https://make.fun";

// Per-view request accounting, shown in the cache line at the top of every view.
export const stats = { requests: 0, unchanged: 0, memory: 0, updatedAt: 0 };
export function statsReset() {
  stats.requests = 0;
  stats.unchanged = 0;
  stats.memory = 0;
  stats.updatedAt = Date.now();
}

const mem = new Map();

function stored(url) {
  try {
    const raw = sessionStorage.getItem("tf:" + url);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function store(url, etag, body) {
  try {
    sessionStorage.setItem("tf:" + url, JSON.stringify({ etag, body, at: Date.now() }));
  } catch {
    // Storage full or unavailable: the memory cache still serves this session.
  }
}

// fetchCached: one GET with If-None-Match revalidation. A 304 reuses the stored
// body and counts as unchanged; a memory hit costs no request at all.
export async function fetchCached(url) {
  if (mem.has(url)) {
    stats.memory++;
    return mem.get(url);
  }
  const prev = stored(url);
  const headers = {};
  if (prev && prev.etag) headers["If-None-Match"] = prev.etag;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    if (prev) {
      stats.memory++;
      mem.set(url, prev.body);
      return prev.body;
    }
    throw err;
  }
  stats.requests++;
  stats.updatedAt = Date.now();
  if (res.status === 304 && prev) {
    stats.unchanged++;
    mem.set(url, prev.body);
    return prev.body;
  }
  const body = await res.json();
  if (!res.ok) throw new Error("API " + res.status + " for " + url);
  mem.set(url, body);
  store(url, res.headers.get("ETag"), body);
  return body;
}

export function boardList() {
  return fetchCached(API + "/competitions");
}

export function bountyBoard(slug, limit) {
  return fetchCached(API + "/competitions/" + slug + "/leaderboard" + (limit ? "?limit=" + limit : ""));
}

// Full bounty detail: the board list already carries the pot and rewards, but
// only the detail carries the phases (deadline, results-by) and the opened date.
export function bountyDetail(slug) {
  return fetchCached(API + "/competitions/" + slug);
}

export function profileOf(handle) {
  return fetchCached(API + "/profiles/" + encodeURIComponent(handle));
}

// Root a root-relative API image path (avatars, entry images) on make.fun.
export function absImg(path) {
  if (!path) return "";
  return path.startsWith("/") ? ORIGIN + path : path;
}

export function money(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(n) {
  return (Number(n) || 0).toLocaleString("en-US");
}

export function timeLeft(deadline) {
  const ms = Date.parse(deadline) - Date.now();
  if (ms <= 0) return "closed";
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 48) return h + "h " + (m % 60) + "m";
  return Math.floor(h / 24) + "d " + (h % 24) + "h";
}

// A bounty still takes entries when its deadline is in the future, whatever
// its status says (a past-deadline bounty may read open until results publish).
export function isOpen(c) {
  return Date.parse(c.deadline) > Date.now();
}

export function feeText(c) {
  const f = Number(c.entryFeeUsd);
  return !f ? "Free" : money(f);
}

// Live prize now for a place, from the bounty's own rewardsNow table.
export function prizeNow(bounty, place) {
  const rows = bounty && bounty.rewardsNow;
  if (Array.isArray(rows)) {
    const r = rows.find((x) => x.place === place);
    if (r) return Number(r.amountUsd);
  }
  const base = bounty && bounty.rewards ? Number(bounty.rewards[String(place)] || 0) : 0;
  return base;
}
