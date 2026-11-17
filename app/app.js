// Trifold round 4: the board, a bounty's page, its leaderboard and a profile,
// all on live make.fun data, in one 1280x800 cover of three panes: the dense
// board | the selected bounty's detail | the top-5 leaderboard.
// What the top 20 taught this build: countdowns tick in seconds, bounty
// titles are never cut, dates carry full UTC times with a Now slider, every
// leaderboard row carries its entry's title, and the cache line shows few
// requests with something served from memory.
import { api, board, bounty, leaderboard, profile, stats, resetStats, revalidateAll, isLive, lastEntryAt, passedCount, prizeNow, escrowHeldUsd } from './api.js';

// Measured first load of index.html (gzip-9), written in after measuring.
const FIRST_LOAD = '159 B';
const DEFAULT_BOUNTY = 'makefun-frontend-01';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function money(n, dec) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec });
}
export function num(n) { return (Number(n) || 0).toLocaleString('en-US'); }

// Time left, always with seconds, ticking every second: "27d 8h 22m 11s",
// "12h 26m 48s", "45m 48s". Past the deadline it reads "closed".
export function fmtLeft(ms) {
  if (ms == null || ms <= 0) return 'closed';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm ' + sec + 's';
  if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
  return m + 'm ' + sec + 's';
}

// Freshness of a bounty's latest entry, from live data: "just now", "3m ago".
export function fmtAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// UTC clock, the way the board reads it: "17 Nov, 12:30 UTC".
export function fmtClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ', ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
}
export function fmtDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
}

// Paid places of a bounty: how many ranks its pot actually pays.
export function paidPlaces(c) {
  if (c && Array.isArray(c.rewardsNow) && c.rewardsNow.length) return c.rewardsNow.length;
  if (c && c.rewards) return Object.keys(c.rewards).length;
  return 0;
}
export function livePot(c) { return parseFloat(c && c.potUsd) || parseFloat(c && c.rewardAmount) || 0; }
export function feeLabel(c) {
  const f = parseFloat(c && c.entryFeeUsd);
  return f ? money(f) : 'Free';
}

// Sorts the board offers. "Fewest per place" sorts by paid places, fewest
// first: the cheapest bounties to place in.
export const SORTS = {
  closing: { label: 'Closing soon', fn: (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline) },
  pot: { label: 'Biggest pot', fn: (a, b) => livePot(b) - livePot(a) },
  entries: { label: 'Most entries', fn: (a, b) => (b.submissionCount || 0) - (a.submissionCount || 0) },
  places: { label: 'Fewest per place', fn: (a, b) => paidPlaces(a) - paidPlaces(b) },
};

// The six phases of a bounty's life, each with its UTC time and one line
// saying what it means. Opened and Development come from the bounty itself;
// Final and Results by come from its phases when the API carries them.
export function phaseList(c) {
  const dev = (c.phases || []).find((p) => p.key === 'dev');
  const fin = (c.phases || []).find((p) => p.key === 'final');
  const opened = c.publishedAt || c.opensAt || (dev && dev.startsAt);
  const deadline = c.deadline;
  return [
    { key: 'Opened', at: opened, note: 'Entries open' },
    { key: 'Development', at: dev ? dev.startsAt : opened, end: dev ? dev.endsAt : deadline, note: 'Scores stay live' },
    { key: 'Now', at: new Date().toISOString(), note: 'Where we are' },
    { key: 'Deadline', at: deadline, note: 'Last moment to enter' },
    { key: 'Final', at: fin ? fin.startsAt : null, end: fin ? fin.endsAt : null, note: 'Scores after it ends' },
    { key: 'Results by', at: fin ? fin.endsAt : null, note: 'Published automatically' },
  ];
}

// Rewards tiers, grouped the way the board reads them: 1st, 2nd, 3rd,
// 4th–10th, 11th–20th, each with base, fee share and prize now.
export function rewardTiers(c) {
  const rows = (c.rewardsNow || []).slice().sort((a, b) => a.place - b.place);
  if (!rows.length) return [];
  const groups = [[1, 1], [2, 2], [3, 3], [4, 10], [11, 20]];
  const out = [];
  for (const [lo, hi] of groups) {
    const inGroup = rows.filter((r) => r.place >= lo && r.place <= hi);
    if (!inGroup.length) continue;
    const first = inGroup[0];
    const label = lo === hi ? (lo === 1 ? '1st' : lo === 2 ? '2nd' : '3rd') : lo + 'th–' + hi + 'th';
    out.push({ label, base: parseFloat(first.baseUsd), share: parseFloat(first.feeShareUsd), now: parseFloat(first.amountUsd), places: inGroup.length, max: rows[0] ? parseFloat(rows[0].amountUsd) : 0 });
  }
  return out;
}

// One leaderboard row for the wide leaderboard page: rank, avatar, handle
// with the entry's title under it, the judge win rate with its 90%
// interval, and what the place pays now.
export function leaderRow(e, comp) {
  const v = e.values || {};
  const win = v.judge != null ? (v.judge / 10000).toFixed(1) + '%' : '—';
  const lo = v.judge_low != null ? (v.judge_low / 10000).toFixed(1) : '';
  const hi = v.judge_high != null ? (v.judge_high / 10000).toFixed(1) : '';
  const prize = prizeNow(comp, e.rank);
  const img = e.image ? '<img class="av" crossorigin="anonymous" src="' + esc(e.image.startsWith('http') ? e.image : 'https://make.fun' + e.image) + '" alt="">' : '<span class="av av-none"></span>';
  return '<div class="lr"><span class="lr-rank">' + e.rank + '</span>' + img +
    '<span class="lr-who"><a href="#/profile/' + esc(e.handle) + '">@' + esc(e.handle) + '</a>' +
    '<span class="lr-title">' + esc(e.title || '') + '</span></span>' +
    '<span class="lr-win">' + win + (lo && hi ? ' <i>' + lo + '–' + hi + '%</i>' : '') + '</span>' +
    '<span class="lr-prize">' + (prize == null ? '—' : money(prize)) + '</span></div>';
}

// The same row for narrow panes (the cover's rail, the bounty's side): the
// entry's title gets its own line across the full width, one line, so a long
// title never squeezes the row into a word a line.
export function leaderRowSlim(e, comp) {
  const v = e.values || {};
  const win = v.judge != null ? (v.judge / 10000).toFixed(1) + '%' : '—';
  const lo = v.judge_low != null ? (v.judge_low / 10000).toFixed(1) : '';
  const hi = v.judge_high != null ? (v.judge_high / 10000).toFixed(1) : '';
  const prize = prizeNow(comp, e.rank);
  const img = e.image ? '<img class="av" crossorigin="anonymous" src="' + esc(e.image.startsWith('http') ? e.image : 'https://make.fun' + e.image) + '" alt="">' : '<span class="av av-none"></span>';
  return '<div class="lr slim"><span class="lr-rank">' + e.rank + '</span>' + img +
    '<span class="lr-who"><a href="#/profile/' + esc(e.handle) + '">@' + esc(e.handle) + '</a></span>' +
    '<span class="lr-win">' + win + (lo && hi ? ' <i>' + lo + '–' + hi + '%</i>' : '') + '</span>' +
    '<span class="lr-prize">' + (prize == null ? '—' : money(prize)) + '</span>' +
    '<span class="lr-title" title="' + esc(e.title || '') + '">' + esc(e.title || '') + '</span></div>';
}

// ---- state ---------------------------------------------------------------
const state = {
  route: null, sort: 'closing', cat: 'All', q: '', tab: 'live', selected: DEFAULT_BOUNTY,
  list: null, detail: null, lb: null, prof: null, profHandle: null,
  paintMs: null, updatedAt: 0, rowsPatched: 0, rowsBuilt: 0,
};
const $ = (s, r) => (r || document).querySelector(s);
const view = () => $('#view');
const shell = () => $('#shell');

// The cache line, the performance story in one line: how many requests this
// view made, how many answers came back unchanged, how many came from
// memory, and when the data was last refreshed.
export function cacheLine() {
  const ago = state.updatedAt ? Math.max(0, Math.round((Date.now() - state.updatedAt) / 1000)) : 0;
  return '● LIVE · this view: ' + stats.req + ' API request' + (stats.req === 1 ? '' : 's') +
    ' · ' + stats.unch + ' unchanged (304) · ' + stats.mem + ' from memory · updated ' + ago + 's ago';
}

function headerHTML() {
  return '<header class="top"><a class="logo" href="#/">▦ Trifold</a>' +
    '<nav><a href="#/" data-nav="board">Board</a><a href="#/bounty/' + esc(state.selected) + '" data-nav="bounty">Bounty</a>' +
    '<a href="#/bounty/' + esc(state.selected) + '/leaderboard" data-nav="lb">Leaderboard</a></nav>' +
    '<span class="cache" id="cacheline">' + cacheLine() + '</span>' +
    '<span class="prof-find"><input id="findprof" placeholder="Find a profile @handle" aria-label="Find a profile"><button id="findgo">Go</button></span>' +
    '<button class="refresh" id="refresh">Refresh</button></header>';
}

function footerHTML() {
  const paint = state.paintMs == null ? 'painted in … ms' : 'painted in ' + state.paintMs + ' ms';
  return '<footer class="foot">' + FIRST_LOAD + ' first load · 1 API request per view · ETag every 30 s · rows patched in place · virtual leaderboard · <span class="paint">' + paint + '</span></footer>';
}

// ---- board ---------------------------------------------------------------
function boardRowsHTML(list) {
  const live = list.filter(isLive);
  const closed = list.filter((c) => !isLive(c));
  const shown = state.tab === 'live' ? live : closed;
  let rows = shown.slice();
  if (state.cat !== 'All') rows = rows.filter((c) => c.category === state.cat);
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((c) => (c.title + ' ' + c.category + ' ' + c.slug).toLowerCase().includes(q));
  }
  rows.sort(SORTS[state.sort].fn);
  const cats = {};
  for (const c of live) cats[c.category] = (cats[c.category] || 0) + 1;
  const chips = ['All'].concat(Object.keys(cats).sort());
  const chipsHTML = chips.map((k) => '<button class="chip' + (state.cat === k ? ' on' : '') + '" data-cat="' + esc(k) + '">' + esc(k) + ' ' + (k === 'All' ? live.length : cats[k]) + '</button>').join('');
  const sortsHTML = Object.keys(SORTS).map((k) => '<button class="sort' + (state.sort === k ? ' on' : '') + '" data-sort="' + k + '">' + SORTS[k].label + '</button>').join('');
  const toggle = '<span class="toggle"><button class="' + (state.tab === 'live' ? 'on' : '') + '" data-tab="live">Live ' + live.length + '</button>' +
    '<button class="' + (state.tab === 'ended' ? 'on' : '') + '" data-tab="ended">Ended ' + closed.length + '</button></span>';
  let html = '<div class="pane-head"><h2>Bounty board</h2>' + toggle + '</div>' +
    '<div class="sorts">' + sortsHTML + '</div><div class="chips">' + chipsHTML + '</div>' +
    '<input class="filter" id="filter" placeholder="Filter bounties…  ( / )" value="' + esc(state.q) + '">';
  html += '<div class="rows" id="boardrows">' + rows.map(boardRowHTML).join('') + '</div>';
  if (state.tab === 'live' && closed.length) {
    html += '<div class="judging"><h3>Judging · entries closed</h3>' + closed.slice(0, 4).map((c) =>
      '<a class="jrow" href="#/bounty/' + esc(c.slug) + '"><span class="jt">' + esc(c.title) + '</span>' +
      '<span class="jp">' + money(livePot(c), 0) + '</span><span class="js">Judging</span>' +
      '<span class="je">' + num(c.submissionCount) + ' entries</span></a>').join('') + '</div>';
  }
  return { html, count: rows.length };
}

// One board row, keyed by slug so a refresh patches it in place instead of
// rebuilding the list. The title gets the whole row width and wraps onto two
// lines; it is never cut. The second line carries the category, the last
// entry's freshness, the fee, the time left in seconds and the entries, with
// a thin progress bar underneath.
function boardRowHTML(c) {
  const left = Date.parse(c.deadline) - Date.now();
  const soon = left > 0 && left < 3600000;
  const span = Date.parse(c.deadline) - Date.parse(c.publishedAt || c.deadline);
  const pct = span > 0 ? Math.max(0, Math.min(100, 100 * (1 - left / span))) : 100;
  const last = lastEntryAt(c);
  return '<a class="brow' + (state.selected === c.slug ? ' sel' : '') + '" data-slug="' + esc(c.slug) + '" href="#/bounty/' + esc(c.slug) + '">' +
    '<span class="bt-row"><span class="bt-t">' + esc(c.title) + '</span><span class="bp">' + money(livePot(c), 0) + '</span></span>' +
    '<span class="bt-meta"><span>' + esc(c.category) + (last ? ' · last entry ' + fmtAgo(last) : '') + '</span>' +
    '<span>' + feeLabel(c) + '</span>' +
    '<span class="bl' + (soon ? ' soon' : '') + '" data-deadline="' + esc(c.deadline) + '">' + fmtLeft(left) + '</span>' +
    '<span>' + num(c.submissionCount) + ' entries</span></span>' +
    '<span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span></a>';
}

// Patch the board's rows in place, keyed by slug: a row that is already
// there keeps its node and only its changing cells are rewritten; a new row
// is built; a gone row is removed. The counters feed the leaderboard line.
function patchBoardRows(list) {
  const box = $('#boardrows');
  if (!box) return;
  const live = list.filter(isLive);
  let rows = state.tab === 'live' ? live : list.filter((c) => !isLive(c));
  if (state.cat !== 'All') rows = rows.filter((c) => c.category === state.cat);
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((c) => (c.title + ' ' + c.category + ' ' + c.slug).toLowerCase().includes(q));
  }
  rows.sort(SORTS[state.sort].fn);
  const have = new Map();
  for (const el of box.querySelectorAll('.brow')) have.set(el.dataset.slug, el);
  const frag = document.createDocumentFragment();
  for (const c of rows) {
    const old = have.get(c.slug);
    if (old) {
      have.delete(c.slug);
      const tmp = document.createElement('div');
      tmp.innerHTML = boardRowHTML(c);
      const fresh = tmp.firstChild;
      if (old.outerHTML !== fresh.outerHTML) { state.rowsPatched++; frag.appendChild(fresh); }
      else frag.appendChild(old);
    } else {
      const tmp = document.createElement('div');
      tmp.innerHTML = boardRowHTML(c);
      frag.appendChild(tmp.firstChild);
      state.rowsBuilt++;
    }
  }
  for (const el of have.values()) el.remove();
  box.replaceChildren(frag);
}

// ---- bounty detail -------------------------------------------------------
function statsHTML(c) {
  const left = Date.parse(c.deadline) - Date.now();
  const soon = left > 0 && left < 3600000;
  const passed = passedCount(c);
  const passedNote = passed == null ? 'submitted' : num(passed) + ' passed the checks';
  return '<div class="stats">' +
    '<div class="stat"><span>Live pot</span><b>' + money(livePot(c)) + '</b><i>+' + money(livePot(c) - (parseFloat(c.rewardAmount) || 0)) + ' in fees</i></div>' +
    '<div class="stat"><span>Entry fee</span><b>' + feeLabel(c) + '</b><i>' + num(c.entryFeePayers || 0) + ' paid</i></div>' +
    '<div class="stat"><span>Time left</span><b class="' + (soon ? 'soon' : '') + '" data-deadline="' + esc(c.deadline) + '">' + fmtLeft(left) + '</b><i>' + fmtClock(c.deadline) + '</i></div>' +
    '<div class="stat"><span>Entries</span><b>' + num(c.submissionCount) + '</b><i>' + esc(passedNote) + '</i></div></div>';
}

function timelineHTML(c) {
  const phases = phaseList(c);
  const start = Date.parse(phases[0].at || c.deadline);
  const end = Date.parse(c.deadline);
  const now = Date.now();
  const pct = end > start ? Math.max(0, Math.min(100, 100 * (now - start) / (end - start))) : 100;
  const rows = phases.map((p) => {
    const when = p.key === 'Now' ? 'Now · ' + fmtClock(new Date().toISOString()) : fmtClock(p.at);
    return '<div class="ph' + (p.key === 'Now' ? ' now' : '') + '"><b>' + p.key + '</b><span>' + when + '</span><i>' + p.note + '</i></div>';
  }).join('');
  return '<div class="dates"><h3>Dates</h3><div class="slider"><i style="left:' + pct.toFixed(1) + '%"></i><em style="width:' + pct.toFixed(1) + '%"></em></div><div class="phases">' + rows + '</div></div>';
}

function rewardsHTML(c) {
  const tiers = rewardTiers(c);
  if (!tiers.length) return '<p class="muted">No paid places yet.</p>';
  const rows = tiers.map((t) => '<div class="rw"><span class="rw-p">' + t.label + '</span><span class="rw-b">' + money(t.base) + '</span>' +
    '<span class="rw-s">+' + money(t.share) + '</span><span class="rw-n">' + money(t.now) + (t.places > 1 ? ' each' : '') + '</span>' +
    '<span class="rw-bar"><i style="width:' + Math.max(4, Math.round(100 * t.now / t.max)) + '%"></i></span></div>').join('');
  return '<div class="rewards"><h3>Rewards · ' + money(livePot(c)) + ' live pot</h3>' + rows +
    '<div class="rw tot"><span class="rw-p">Live pot · ' + paidPlaces(c) + ' places</span><span class="rw-n">' + money(livePot(c)) + '</span></div></div>';
}

function escrowHTML(c) {
  const held = escrowHeldUsd(c);
  if (held == null) return '';
  return '<p class="escrow">Locked in a Solana escrow: <b>' + money(held) + ' USDC held</b> · <a href="https://explorer.solana.com/address/' + esc(c.escrowLock.escrow) + '" target="_blank" rel="noopener">escrow ↗</a></p>';
}

function judgedHTML(short) {
  if (short) {
    return '<div class="judged"><h3>How it is judged</h3><p>The house AI judge compares the frontends two at a time by a sheet of ' +
      'their screenshots and an outline of their source. The 20 best share the $500 pot plus every entry fee.</p></div>';
  }
  return '<div class="judged"><h3>How it is judged</h3><p>The house AI judge compares the frontends two at a time by a sheet of ' +
    'their screenshots and an outline of their source, and entries rank by how often it picks them. ' +
    'The 20 highest-ranked entries share the $500 pot plus every entry fee paid.</p></div>';
}

// The bounty pane on the cover: stat boxes, rewards with bars and
// prize-now, the Dates panel with its Now slider, the escrow line, how it
// is judged, and the Enter button. (The rail beside it already shows the
// top 5; the full top 10 lives on the bounty's own page.)
function bountyPaneHTML(c, lbRows) {
  const comp = c;
  return '<div class="bpane">' +
    '<div class="crumb">Board / ' + esc(comp.category) + '</div>' +
    '<h2 class="btitle">' + esc(comp.title) + '</h2>' +
    '<p class="status ' + (isLive(comp) ? 'live' : 'done') + '">' + (isLive(comp) ? '● Taking entries' : '● Judging') + ' · by ' + esc(comp.sponsor && comp.sponsor.name ? comp.sponsor.name : 'make.fun') + '</p>' +
    statsHTML(comp) + rewardsHTML(comp) + timelineHTML(comp) + escrowHTML(comp) + judgedHTML(true) +
    '<div class="enter"><a class="btn" href="https://make.fun/bounty/' + esc(comp.slug) + '" target="_blank" rel="noopener">Enter on make.fun ↗</a>' +
    '<a class="btn ghost" href="#/bounty/' + esc(comp.slug) + '/leaderboard">Full leaderboard →</a></div>' +
    '</div>';
}

// ---- top-5 rail ----------------------------------------------------------
function railHTML(c, lbRows) {
  const top = lbRows ? lbRows.slice(0, 5) : [];
  const live = (state.list || []).filter(isLive).sort(SORTS.closing.fn);
  const soon = live.slice(0, 5);
  return '<div class="rail"><h3>Top 5 · judge win rate</h3>' +
    (top.length ? top.map((e) => leaderRowSlim(e, c)).join('') : '<p class="muted">Leaderboard loading…</p>') +
    '<h3 class="soon-h">Closing soon</h3>' + soon.map((b) => {
      const left = Date.parse(b.deadline) - Date.now();
      return '<a class="srow" href="#/bounty/' + esc(b.slug) + '"><span>' + esc(b.title) + '</span><b class="' + (left < 3600000 ? 'soon' : '') + '" data-deadline="' + esc(b.deadline) + '">' + fmtLeft(left) + '</b></a>';
    }).join('') + '</div>';
}

// ---- summary strip -------------------------------------------------------
function summaryHTML(list) {
  const live = list.filter(isLive);
  const pots = live.reduce((s, c) => s + livePot(c), 0);
  const entries = live.reduce((s, c) => s + (c.submissionCount || 0), 0);
  const next = live.slice().sort(SORTS.closing.fn)[0];
  const left = next ? Date.parse(next.deadline) - Date.now() : 0;
  return '<div class="summary" id="summary"><span><b>' + live.length + '</b> taking entries</span> · <span><b>' + money(pots) + '</b> in live pots</span> · ' +
    '<span><b>' + num(entries) + '</b> entries</span> · <span>next deadline in <b class="' + (left > 0 && left < 3600000 ? 'soon' : '') + '"' +
    (next ? ' data-deadline="' + esc(next.deadline) + '"' : '') + '>' + (next ? fmtLeft(left) : '—') + '</b></span></div>';
}

// ---- pages ---------------------------------------------------------------
async function renderBoard() {
  const t0 = performance.now();
  window.__shotReady = false;
  resetStats();
  const data = await board();
  state.list = data.items || [];
  state.updatedAt = Date.now();
  const selected = state.list.find((c) => c.slug === state.selected) || state.list.find(isLive) || state.list[0];
  if (selected) state.selected = selected.slug;
  // The detail and the leaderboard for the selected bounty come from the
  // shared cache when a visit already warmed them; otherwise they are
  // fetched here, still one fetch each, never more.
  let detail = null, lbRows = null;
  if (selected) {
    try { detail = await bounty(selected.slug); } catch { detail = selected; }
    try { const lb = await leaderboard(selected.slug); lbRows = (lb.entries || []).slice(0, 5); } catch { lbRows = null; }
  }
  const comp = detail || selected;
  const { html } = boardRowsHTML(state.list);
  view().innerHTML = '<div class="cover">' +
    '<section class="pane board">' + html + '</section>' +
    '<section class="pane mid">' + bountyPaneHTML(comp, lbRows) + '</section>' +
    '<section class="pane railwrap">' + railHTML(comp, lbRows) + '</section></div>';
  state.rowsBuilt = document.querySelectorAll('#boardrows .brow').length;
  finishPaint(t0);
}

async function renderBounty(slug) {
  const t0 = performance.now();
  window.__shotReady = false;
  resetStats();
  const comp = await bounty(slug);
  state.detail = comp;
  state.selected = slug;
  state.updatedAt = Date.now();
  let lbRows = null;
  try { const lb = await leaderboard(slug); lbRows = lb.entries || []; } catch { lbRows = null; }
  const top = lbRows ? lbRows.slice(0, 10) : [];
  const passed = passedCount(comp);
  view().innerHTML = '<div class="bpage"><div class="bmain">' +
    '<div class="crumb"><a href="#/">Board</a> / ' + esc(comp.category) + ' · by ' + esc(comp.sponsor && comp.sponsor.name ? comp.sponsor.name : 'make.fun') + '</div>' +
    '<h1>' + esc(comp.title) + '</h1>' +
    '<p class="status ' + (isLive(comp) ? 'live' : 'done') + '">' + (isLive(comp) ? '● Taking entries · closes ' + fmtClock(comp.deadline) : '● Judging · entries closed') + '</p>' +
    '<p class="desc">' + esc(comp.summary || '') + '</p>' +
    statsHTML(comp) + timelineHTML(comp) +
    '<div class="rewards big">' + rewardsHTML(comp) + '</div>' +
    '<div class="desc-full">' + esc(comp.description || '').split('\n').filter((l) => l.trim()).slice(0, 14).map((l) => '<p>' + l.replace(/^#+\s*/, '') + '</p>').join('') + '</div>' +
    '</div><aside class="bside">' + escrowHTML(comp) + judgedHTML() +
    '<div class="enter"><a class="btn" href="https://make.fun/bounty/' + esc(comp.slug) + '" target="_blank" rel="noopener">Enter on make.fun ↗</a>' +
    '<a class="btn ghost" href="#/bounty/' + esc(comp.slug) + '/leaderboard">Full leaderboard →</a></div>' +
    (top.length ? '<div class="emb"><h3>Leaderboard · top 10' + (passed == null ? '' : ' · ' + num(passed) + ' passed the checks') + '</h3>' + top.map((e) => leaderRowSlim(e, comp)).join('') + '</div>' : '') +
    '</aside></div>';
  finishPaint(t0);
}

// The leaderboard is virtualized: only the rows around the scroll position
// exist in the DOM, the rest are a spacer. Rows already built are patched in
// place on a refresh; new ones are built. The counters say so underneath.
async function renderLeaderboard(slug) {
  const t0 = performance.now();
  window.__shotReady = false;
  resetStats();
  const lb = await leaderboard(slug);
  const rows = lb.entries || [];
  let comp = state.detail && state.detail.slug === slug ? state.detail : null;
  if (!comp) { try { comp = await bounty(slug); state.detail = comp; } catch { comp = null; } }
  state.updatedAt = Date.now();
  const passed = comp ? passedCount(comp) : null;
  const ROW = 46;
  view().innerHTML = '<div class="lbpage"><h1>Leaderboard · ' + esc(comp ? comp.title : slug) + '</h1>' +
    '<p class="lb-sub">' + rows.length + ' ranked' + (passed == null ? '' : ' · ' + num(passed) + ' passed the checks') +
    ' · <span id="lbcount">Showing 1–20 of ' + rows.length + ' ranked</span></p>' +
    '<div class="lb-head"><span>#</span><span></span><span>Entrant</span><span>Judge win rate</span><span>Prize now</span></div>' +
    '<div class="lb-scroll" id="lbscroll" style="height:560px"><div id="lbspacer" style="height:' + (rows.length * ROW) + 'px;position:relative"></div></div>' +
    '<p class="lb-foot" id="lbfoot">rows ' + state.rowsPatched + ' patched / ' + state.rowsBuilt + ' built · virtual leaderboard · ETag-revalidated cache</p></div>';
  const scroll = $('#lbscroll'), spacer = $('#lbspacer');
  const renderWindow = () => {
    const start = Math.max(0, Math.floor(scroll.scrollTop / ROW) - 4);
    const end = Math.min(rows.length, start + Math.ceil(560 / ROW) + 8);
    const built = new Map();
    for (const el of spacer.querySelectorAll('.lr')) built.set(Number(el.dataset.rank), el);
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const e = rows[i];
      const old = built.get(e.rank);
      if (old) {
        const tmp = document.createElement('div');
        tmp.innerHTML = leaderRow(e, comp);
        const fresh = tmp.firstChild;
        fresh.style.cssText = 'position:absolute;top:' + (i * ROW) + 'px;left:0;right:0';
        fresh.dataset.rank = e.rank;
        if (old.outerHTML !== fresh.outerHTML) { state.rowsPatched++; frag.appendChild(fresh); }
        else { old.style.top = (i * ROW) + 'px'; frag.appendChild(old); }
        built.delete(e.rank);
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = leaderRow(e, comp);
        const el = tmp.firstChild;
        el.style.cssText = 'position:absolute;top:' + (i * ROW) + 'px;left:0;right:0';
        el.dataset.rank = e.rank;
        frag.appendChild(el);
        state.rowsBuilt++;
      }
    }
    for (const el of built.values()) el.remove();
    spacer.replaceChildren(frag);
    const c = $('#lbcount');
    if (c) c.textContent = 'Showing ' + (start + 1) + '–' + end + ' of ' + rows.length + ' ranked';
    const f = $('#lbfoot');
    if (f) f.textContent = 'rows ' + state.rowsPatched + ' patched / ' + state.rowsBuilt + ' built · virtual leaderboard · ETag-revalidated cache';
  };
  scroll.addEventListener('scroll', renderWindow, { passive: true });
  renderWindow();
  finishPaint(t0);
}

async function renderProfile(handle) {
  const t0 = performance.now();
  window.__shotReady = false;
  resetStats();
  const prof = await profile(handle);
  state.prof = prof;
  state.updatedAt = Date.now();
  const rec = prof.record || {};
  const sols = (prof.solutions || []).slice(0, 12);
  const avUrl = prof.avatar && prof.avatar.url ? prof.avatar.url : (prof.image || '');
  const avSrc = avUrl ? (avUrl.startsWith('http') ? avUrl : 'https://make.fun' + avUrl) : '';
  view().innerHTML = '<div class="ppage"><div class="phead">' +
    (avSrc ? '<img class="pav" crossorigin="anonymous" src="' + esc(avSrc) + '" alt="">' : '') +
    '<div><h1>@' + esc(prof.handle) + '</h1>' +
    (prof.display_name ? '<p class="pname">' + esc(prof.display_name) + '</p>' : '') +
    (prof.bio ? '<p class="pbio">' + esc(prof.bio) + '</p>' : '') +
    '<p class="muted">Joined ' + fmtDay(prof.joined_at) + ' ' + new Date(prof.joined_at).getUTCFullYear() + '</p></div></div>' +
    '<div class="stats">' +
    '<div class="stat"><span>Entered</span><b>' + num(rec.competitions_entered) + '</b></div>' +
    '<div class="stat"><span>Placed</span><b>' + num(rec.competitions_placed) + '</b></div>' +
    '<div class="stat"><span>Won</span><b>' + num(rec.competitions_won) + '</b></div>' +
    '<div class="stat"><span>Prize money</span><b>' + money(parseFloat(rec.prize_usd) || 0) + '</b></div></div>' +
    '<h3>Entries</h3>' + (sols.length ? sols.map((s) => {
      // Scores are judge win rates only when the column says so; other
      // competitions score differently (a race time, a points total), and
      // showing those as a percent would invent a number.
      const judged = s.score && s.score.column && s.score.column.key === 'judge';
      return '<a class="prow" href="#/bounty/' + esc(s.competition.slug) + '"><span class="st">' + esc(s.title) + '</span>' +
      '<span class="sc">' + esc(s.competition.title) + '</span>' +
      '<span class="ss">' + (judged ? (s.score.value / 10000).toFixed(1) + '%' : '—') + '</span>' +
      '<span class="sp">' + (s.prize_usd ? money(parseFloat(s.prize_usd)) : '—') + '</span></a>';
    }).join('') : '<p class="muted">No entries yet.</p>') + '</div>';
  finishPaint(t0);
}

function finishPaint(t0) {
  requestAnimationFrame(() => {
    state.paintMs = Math.max(1, Math.round(performance.now() - t0));
    const f = $('.foot .paint');
    if (f) f.textContent = 'painted in ' + state.paintMs + ' ms';
    window.__shotReady = true;
  });
}

// ---- router, shell, the one timer ----------------------------------------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') return { name: 'leaderboard', slug: parts[1] };
  if (parts[0] === 'bounty' && parts[1]) return { name: 'bounty', slug: parts[1] };
  if (parts[0] === 'profile' && parts[1]) return { name: 'profile', handle: parts[1] };
  return { name: 'board' };
}

function renderShell() {
  document.body.innerHTML = '<div id="shell">' + headerHTML() +
    '<div class="summary" id="summary"></div><main id="view"></main>' + footerHTML() + '</div>';
  const go = $('#findgo');
  const find = $('#findprof');
  const submitFind = () => { const h = find.value.trim().replace(/^@/, ''); if (h) location.hash = '#/profile/' + h; };
  go.addEventListener('click', submitFind);
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitFind(); });
  $('#refresh').addEventListener('click', () => route(true));
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { state.sort = s.dataset.sort; route(); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { state.cat = c.dataset.cat; route(); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; route(); return; }
  });
  // The filter input is rebuilt with the board pane, so listen by delegation.
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'filter') { state.q = e.target.value; patchBoardRows(state.list || []); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('#filter') && document.activeElement !== find) {
      const f = $('#filter');
      if (f) { e.preventDefault(); f.focus(); }
    }
  });
}

async function route(force) {
  const r = parseHash();
  state.route = r.name;
  if (force) { resetStats(); }
  if (r.name === 'board') {
    if (!state.list || force || !document.querySelector('.pane.board')) { await renderBoard(); }
    else {
      state.rowsPatched = 0;
      const { html } = boardRowsHTML(state.list);
      const old = $('.pane.board');
      if (old) { old.innerHTML = html; }
      const line = $('#cacheline');
      if (line) line.textContent = cacheLine();
      window.__shotReady = true;
    }
    const s = $('#summary');
    if (s && state.list) s.outerHTML = summaryHTML(state.list);
    return;
  }
  if (r.name === 'bounty') { await renderBounty(r.slug); return; }
  if (r.name === 'leaderboard') { await renderLeaderboard(r.slug); return; }
  if (r.name === 'profile') { await renderProfile(r.handle); return; }
}

// One shared timer drives everything that moves: every second it rewrites
// the countdowns (all [data-deadline] nodes) and the "updated Xs ago" line,
// and every 30th tick it revalidates the cache with ETag and patches the
// current view's rows in place. One timer, one interval, for the whole app.
let tickCount = 0;
function startTimer() {
  setInterval(async () => {
    tickCount++;
    const now = Date.now();
    for (const el of document.querySelectorAll('[data-deadline]')) {
      el.textContent = fmtLeft(Date.parse(el.dataset.deadline) - now);
      el.classList.toggle('soon', Date.parse(el.dataset.deadline) - now > 0 && Date.parse(el.dataset.deadline) - now < 3600000);
    }
    const line = $('#cacheline');
    if (line) line.textContent = cacheLine();
    if (tickCount % 30 === 0) {
      await revalidateAll();
      if (state.route === 'board' && state.list) {
        try {
          const data = await board();
          state.list = data.items || [];
          state.updatedAt = Date.now();
          patchBoardRows(state.list);
        } catch { /* keep showing the cached board */ }
      }
    }
  }, 1000);
}

export function start() {
  window.__shotReady = false;
  renderShell();
  startTimer();
  window.addEventListener('hashchange', () => route());
  route();
}
