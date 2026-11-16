// Read-only make.fun API client: GET only, with ETag revalidation.
//
// The API sends ETags bound to the minute. We keep one entry per URL in
// memory (and in sessionStorage, so a reload revalidates instead of
// re-downloading): a fresh entry is used as-is, a stale one is revalidated
// with If-None-Match, and a 304 keeps the cached body. Nothing is ever
// posted, and no credentials are sent.
const API = "https://make.fun/api";
const mem = new Map();
const FRESH_MS = 45 * 1000;

function storeGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: memory cache still works.
  }
}

export async function api(path) {
  const url = API + path;
  const key = "mf:" + path;
  const now = Date.now();
  let entry = mem.get(key) || storeGet(key);
  if (entry && now - entry.at < FRESH_MS) return entry.data;
  const headers = {};
  if (entry && entry.etag) headers["If-None-Match"] = entry.etag;
  const res = await fetch(url, { headers });
  if (res.status === 304 && entry) {
    entry.at = now;
    mem.set(key, entry);
    storeSet(key, entry);
    return entry.data;
  }
  if (!res.ok) throw new Error("make.fun API " + res.status + " for " + path);
  const data = await res.json();
  entry = { at: now, etag: res.headers.get("ETag"), data };
  mem.set(key, entry);
  storeSet(key, entry);
  return data;
}

export function listCompetitions() {
  return api("/competitions");
}

export function getCompetition(slug) {
  return api("/competitions/" + encodeURIComponent(slug));
}

export function getLeaderboard(slug) {
  return api("/competitions/" + encodeURIComponent(slug) + "/leaderboard");
}

export function getProfile(handle) {
  return api("/profiles/" + encodeURIComponent(handle));
}

// "2h 14m left", "ended 3d ago" — computed from a deadline, never the
// status alone: a bounty past its deadline may still read status open.
export function timeLeft(deadline) {
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return "";
  const diff = end - Date.now();
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const span = d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + mm + "m" : mm + "m";
  return diff >= 0 ? span + " left" : "ended " + span + " ago";
}

export function isOpen(c) {
  return c.deadline ? new Date(c.deadline).getTime() > Date.now() : c.status === "open";
}

export function money(n) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
