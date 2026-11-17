// Trifold: board beside bounty beside leaderboard. Hash router, four surfaces.
// Every API string goes through textContent: no innerHTML from API data.
import {
  stats, statsReset, fetchCached, boardList, bountyBoard, bountyDetail, profileOf,
  absImg, money, fmtInt, timeLeft, isOpen, feeText, prizeNow,
} from "./api.js";

const FIRST_LOAD_NOTE = "1-file first load · 137 B gzip";

let root;
let view;
let cacheLine;
let boardCache = null;
let boardRows = new Map();
let selectedSlug = "makefun-frontend-01";
let sortMode = "closing";
let catFilter = "All";
let query = "";
let tickTimer = null;
let revalidateTimer = null;

// ---- DOM helpers: API text only ever lands in textContent. ----
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function link(href, text, cls) {
  const a = el("a", cls, text);
  a.href = href;
  return a;
}

function avatarImg(path, cls) {
  const img = el("img", cls || "av");
  img.setAttribute("crossorigin", "anonymous");
  img.src = absImg(path);
  img.alt = "";
  img.loading = "lazy";
  return img;
}

// ---- Cache line: what this view cost, in the open. ----
function updateCacheLine() {
  const secs = Math.max(0, Math.round((Date.now() - stats.updatedAt) / 1000));
  cacheLine.textContent =
    "● LIVE · this view: " + stats.requests + " API request" + (stats.requests === 1 ? "" : "s") +
    " · " + stats.unchanged + " unchanged (304) · " + stats.memory + " from memory" +
    " · updated " + secs + "s ago";
}

// ---- Router: #/ · #/bounty/<slug> · #/bounty/<slug>/leaderboard · #/profile/<handle> ----
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  window.__shotReady = false;
  statsReset();
  if (parts[0] === "bounty" && parts[2] === "leaderboard") return renderLeaderboardPage(parts[1]);
  if (parts[0] === "bounty" && parts[1]) return renderTrifold(parts[1], true);
  if (parts[0] === "profile" && parts[1]) return renderProfile(parts[1]);
  return renderTrifold(selectedSlug, false);
}

// ---- Shell: header, summary strip, view, footer. Built once. ----
function buildShell() {
  const top = el("header", "top");
  const brand = link("#/", "▦ Trifold", "brand");
  const nav = el("nav", "nav");
  nav.append(link("#/", "Board", "navlink"));
  const prof = el("input", "psearch");
  prof.type = "search";
  prof.placeholder = "Find a profile @handle";
  prof.setAttribute("aria-label", "Find a profile");
  prof.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && prof.value.trim()) {
      location.hash = "#/profile/" + prof.value.trim().replace(/^@/, "");
    }
  });
  const go = el("button", "btn", "Go");
  go.addEventListener("click", () => {
    if (prof.value.trim()) location.hash = "#/profile/" + prof.value.trim().replace(/^@/, "");
  });
  const right = el("div", "topright");
  cacheLine = el("span", "cacheline", "● LIVE");
  const refresh = el("button", "btn", "Refresh");
  refresh.addEventListener("click", () => route());
  right.append(cacheLine, refresh);
  top.append(brand, nav, prof, go, right);
  const strip = el("div", "strip");
  strip.id = "strip";
  const foot = el("footer", "foot");
  foot.textContent = "Trifold · " + FIRST_LOAD_NOTE +
    " · ETag-revalidated cache · rows patched in place · virtual leaderboard · views by import() · data: make.fun public API";
  root.append(top, strip, view, foot);
}

// One-second ticker: time-left cells and the strip countdown update in place.
function startTicker() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    document.querySelectorAll("[data-deadline]").forEach((n) => {
      const left = timeLeft(n.getAttribute("data-deadline"));
      if (n.textContent !== left) n.textContent = left;
      n.classList.toggle("urgent", left !== "closed" && /^\d+m$/.test(left));
    });
    const next = document.getElementById("nextdl");
    if (next && boardCache) {
      const open = boardCache.items.filter(isOpen).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
      if (open.length) next.textContent = "next deadline in " + timeLeft(open[0].deadline);
    }
  }, 1000);
}

// Revalidate every 30 s: If-None-Match answers 304 when nothing changed,
// and patchBoardRows updates only the cells whose text moved.
function startRevalidator() {
  if (revalidateTimer) return;
  revalidateTimer = setInterval(async () => {
    try {
      boardCache = await boardList();
      patchBoardRows();
      updateCacheLine();
    } catch {
      // Offline: the cached board stays on screen.
    }
  }, 30000);
}

export function start(node) {
  root = node;
  view = el("main", "view");
  view.id = "view";
  buildShell();
  startTicker();
  startRevalidator();
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && document.activeElement && document.activeElement.tagName !== "INPUT") {
      const q = document.getElementById("q");
      if (q) {
        ev.preventDefault();
        q.focus();
      }
    }
  });
  route();
}


// ---- Board: dense table, patched in place by key. ----
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function boardVisible() {
  const items = (boardCache ? boardCache.items : []).slice();
  const taking = items.filter(isOpen);
  const judging = items.filter((c) => !isOpen(c) && c.status === "open");
  const sort = (a, b) => {
    if (sortMode === "pot") return Number(b.potUsd || 0) - Number(a.potUsd || 0);
    if (sortMode === "entries") return (b.submissionCount || 0) - (a.submissionCount || 0);
    return Date.parse(a.deadline) - Date.parse(b.deadline);
  };
  const match = (c) => {
    if (catFilter !== "All" && c.category !== catFilter) return false;
    if (query && !c.title.toLowerCase().includes(query)) return false;
    return true;
  };
  return { taking: taking.filter(match).sort(sort), judging: judging.filter(match).sort(sort) };
}

function boardRow(c) {
  const tr = el("tr", "brow");
  tr.dataset.slug = c.slug;
  const name = el("td", "c-name");
  const title = el("div", "btitle", c.title);
  const sub = el("div", "bsub");
  const chip = el("span", "chip", c.category);
  sub.append(chip, document.createTextNode(" · " + (c.summary || "").slice(0, 90)));
  name.append(title, sub);
  const pot = el("td", "c-pot num", money(c.potUsd));
  const fee = el("td", "c-fee num", feeText(c));
  const left = el("td", "c-left num");
  left.setAttribute("data-deadline", c.deadline);
  left.textContent = timeLeft(c.deadline);
  const entries = el("td", "c-entries num", fmtInt(c.submissionCount));
  tr.append(name, pot, fee, left, entries);
  tr.addEventListener("click", () => { location.hash = "#/bounty/" + c.slug; });
  return tr;
}

function patchBoardRows() {
  const { taking, judging } = boardVisible();
  const tbody = document.getElementById("boardbody");
  if (!tbody) return;
  const seen = new Set();
  const place = (list) => {
    for (const c of list) {
      seen.add(c.slug);
      let tr = boardRows.get(c.slug);
      if (!tr) {
        tr = boardRow(c);
        boardRows.set(c.slug, tr);
      } else {
        const cells = tr.children;
        cells[0].firstChild.textContent = c.title;
        cells[1].textContent = money(c.potUsd);
        cells[2].textContent = feeText(c);
        cells[3].setAttribute("data-deadline", c.deadline);
        cells[3].textContent = timeLeft(c.deadline);
        cells[4].textContent = fmtInt(c.submissionCount);
        tr.classList.toggle("sel", c.slug === selectedSlug);
      }
      tbody.appendChild(tr);
    }
  };
  place(taking);
  place(judging);
  for (const [slug, tr] of boardRows) {
    if (!seen.has(slug)) {
      tr.remove();
      boardRows.delete(slug);
    }
  }
  const count = document.getElementById("boardcount");
  if (count) count.textContent = taking.length + " taking entries · " + judging.length + " judging";
}

function buildBoardPane(items) {
  const pane = el("section", "pane boardpane");
  pane.append(el("h2", "paneh", "Bounty board"));
  const controls = el("div", "controls");
  const sorts = [["closing", "Closing soon"], ["pot", "Biggest pot"], ["entries", "Most entries"]];
  for (const [mode, label] of sorts) {
    const b = el("button", "pill" + (sortMode === mode ? " on" : ""), label);
    b.addEventListener("click", () => {
      sortMode = mode;
      controls.querySelectorAll(".pill").forEach((p) => p.classList.remove("on"));
      b.classList.add("on");
      patchBoardRows();
    });
    controls.append(b);
  }
  const cats = ["All", ...new Set(items.map((c) => c.category))];
  for (const cat of cats) {
    const b = el("button", "chipbtn" + (catFilter === cat ? " on" : ""), cat);
    b.addEventListener("click", () => {
      catFilter = cat;
      controls.querySelectorAll(".chipbtn").forEach((p) => p.classList.remove("on"));
      b.classList.add("on");
      patchBoardRows();
    });
    controls.append(b);
  }
  const q = el("input", "q");
  q.id = "q";
  q.type = "search";
  q.placeholder = "Filter bounties…  ( / )";
  q.value = query;
  q.addEventListener("input", () => {
    query = q.value.trim().toLowerCase();
    patchBoardRows();
  });
  controls.append(q);
  const count = el("div", "boardcount");
  count.id = "boardcount";
  const table = el("table", "board");
  const thead = el("thead");
  const hr = el("tr");
  for (const h of ["Bounty", "Live pot", "Fee", "Time left", "Entries"]) hr.append(el("th", null, h));
  thead.append(hr);
  const tbody = el("tbody");
  tbody.id = "boardbody";
  table.append(thead, tbody);
  pane.append(controls, count, table);
  return pane;
}

// ---- Bounty pane: stats, rewards with bars, timeline, embedded top 10. ----
function statBox(label, value, sub) {
  const box = el("div", "stat");
  box.append(el("div", "statlabel", label), el("div", "statval num", value));
  if (sub) box.append(el("div", "statsub", sub));
  return box;
}

function renderBountyPane(bounty, full, lbEntries) {
  const pane = el("section", "pane bountypane");
  const head = el("div", "bhead");
  head.append(
    el("span", "crumb", "Board / " + bounty.category),
    el("h2", "btitle2", bounty.title),
  );
  const meta = el("div", "bmeta");
  meta.append(
    el("span", "taking", isOpen(bounty) ? "● Taking entries" : "● Judging"),
    document.createTextNode(" · by " + (bounty.sponsor ? bounty.sponsor.name : "make.fun")),
  );
  pane.append(head, meta);
  const stats = el("div", "stats");
  stats.append(
    statBox("Live pot", money(bounty.potUsd), money(bounty.rewardAmount) + " reward + " + money(bounty.entryFeesUsd) + " fees"),
    statBox("Entry fee", feeText(bounty), (bounty.entryFeePayers || 0) + " paid"),
    statBox("Time left", timeLeft(bounty.deadline), "closes " + fmtDate(bounty.deadline)),
    statBox("Entries", fmtInt(bounty.submissionCount), (bounty.submissionCount || 0) + " submitted"),
  );
  pane.append(stats);
  const rewards = el("div", "rewards");
  rewards.append(el("h3", null, "Rewards · " + money(bounty.potUsd) + " live pot"));
  const rtable = el("table", "rtable");
  const maxAmt = Math.max(...(bounty.rewardsNow || []).map((r) => Number(r.amountUsd)), 1);
  const tiers = [["1st", 1], ["2nd", 2], ["3rd", 3], ["4th–10th", 4], ["11th–20th", 11]]
    .filter(([, place]) => !bounty.rewardsNow || bounty.rewardsNow.some((r) => r.place === place));
  for (const [label, place] of tiers) {
    const row = bounty.rewardsNow ? bounty.rewardsNow.find((r) => r.place === place) : null;
    const tr = el("tr");
    tr.append(el("td", null, label));
    tr.append(el("td", "num", row ? money(row.baseUsd) : "—"));
    tr.append(el("td", "num", row ? "+" + money(row.feeShareUsd) : "—"));
    const pays = el("td", "num pays", row ? money(row.amountUsd) : "—");
    tr.append(pays);
    const bar = el("td", "barcell");
    const fill = el("div", "bar");
    fill.style.width = row ? Math.max(4, (Number(row.amountUsd) / maxAmt) * 100) + "%" : "0%";
    bar.append(fill);
    tr.append(bar);
    rtable.append(tr);
  }
  rewards.append(rtable);
  pane.append(rewards);
  const phases = bounty.phases || [];
  const dev = phases.find((p) => p.key === "dev");
  const fin = phases.find((p) => p.key === "final");
  const tl = el("div", "timeline");
  tl.append(
    statBox("Opened", fmtDate(bounty.opensAt || bounty.publishedAt).split(",")[0], ""),
    statBox("Now", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }), ""),
    statBox("Deadline", fmtDate(dev ? dev.endsAt : bounty.deadline).split(",")[0], ""),
    statBox("Results by", fin ? fmtDate(fin.endsAt).split(",")[0] : "—", ""),
  );
  pane.append(tl);
  const desc = el("p", "desc", full ? (bounty.description || "") : (bounty.summary || bounty.description || "").slice(0, 320));
  pane.append(desc);
  const acts = el("div", "acts");
  acts.append(link("https://make.fun/bounty/" + bounty.slug, "Enter on make.fun ↗", "btn primary"));
  acts.append(link("#/bounty/" + bounty.slug + "/leaderboard", "Full leaderboard →", "btn"));
  pane.append(acts);
  if (lbEntries && lbEntries.length) {
    const top = el("div", "embedded");
    top.append(el("h3", null, "Leaderboard · top 10"));
    const ltable = el("table", "lbtable");
    for (const e of lbEntries.slice(0, 10)) {
      const tr = el("tr");
      tr.append(el("td", "num", String(e.rank)));
      const who = el("td");
      who.append(avatarImg(e.image, "av sm"), document.createTextNode(" " + e.handle));
      tr.append(who);
      tr.append(el("td", "num", (e.values.judge / 10000).toFixed(1) + "%"));
      tr.append(el("td", "num pays", money(prizeNow(bounty, e.rank))));
      tr.addEventListener("click", () => { location.hash = "#/profile/" + e.handle; });
      ltable.append(tr);
    }
    top.append(ltable);
    pane.append(top);
  }
  return pane;
}

// ---- Right rail: top 5 by judge win rate, then the next deadlines. ----
function renderTopRail(slug, bounty, lbEntries) {
  const rail = el("aside", "pane rail");
  rail.append(el("h2", "paneh", "Top 5 · judge win rate"));
  const list = el("div", "toplist");
  for (const e of (lbEntries || []).slice(0, 5)) {
    const row = el("div", "toprow");
    row.append(el("span", "num rank", String(e.rank)));
    row.append(avatarImg(e.image, "av"));
    const mid = el("div", "topmid");
    mid.append(el("div", "toph", e.handle));
    mid.append(el("div", "topsub num", (e.values.judge / 10000).toFixed(1) + "%  ·  " +
      (e.values.judge_low / 10000).toFixed(1) + "–" + (e.values.judge_high / 10000).toFixed(1) + "%"));
    row.append(mid);
    row.append(el("span", "num pays", money(prizeNow(bounty, e.rank))));
    row.addEventListener("click", () => { location.hash = "#/profile/" + e.handle; });
    list.append(row);
  }
  rail.append(list);
  rail.append(el("h3", "railh", "Closing soon"));
  const soon = el("div", "soonlist");
  const open = (boardCache ? boardCache.items : []).filter(isOpen)
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline)).slice(0, 5);
  for (const c of open) {
    const row = el("div", "soonrow");
    row.append(el("span", "soonname", c.title));
    const left = el("span", "num");
    left.setAttribute("data-deadline", c.deadline);
    left.textContent = timeLeft(c.deadline);
    row.append(left);
    row.addEventListener("click", () => { location.hash = "#/bounty/" + c.slug; });
    soon.append(row);
  }
  rail.append(soon);
  return rail;
}

async function renderTrifold(slug, full) {
  selectedSlug = slug || selectedSlug;
  view.replaceChildren(el("p", "loading", "Loading live board…"));
  try {
    boardCache = await boardList();
  } catch {
    view.replaceChildren(el("p", "err", "Could not reach make.fun's API. Check the connection and refresh."));
    window.__shotReady = true;
    return;
  }
  const items = boardCache.items || [];
  let bounty = items.find((c) => c.slug === selectedSlug) || items.find(isOpen) || items[0];
  if (!bounty) {
    view.replaceChildren(el("p", "err", "No bounties found."));
    window.__shotReady = true;
    return;
  }
  selectedSlug = bounty.slug;
  const taking = items.filter(isOpen);
  const potSum = taking.reduce((s, c) => s + Number(c.potUsd || 0), 0);
  const entSum = taking.reduce((s, c) => s + (c.submissionCount || 0), 0);
  const strip = document.getElementById("strip");
  strip.replaceChildren();
  strip.append(
    document.createTextNode(taking.length + " taking entries · "),
    el("b", "num", money(potSum)),
    document.createTextNode(" in live pots · " + fmtInt(entSum) + " entries · "),
    el("span", null, ""),
  );
  const next = el("span", "num");
  next.id = "nextdl";
  next.textContent = "next deadline in " + (taking.length ? timeLeft(taking.slice().sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))[0].deadline) : "—");
  strip.append(next);
  let lbEntries = [];
  try {
    const lb = await bountyBoard(bounty.slug, 10);
    lbEntries = lb.entries || [];
  } catch {
    lbEntries = [];
  }
  try {
    bounty = await bountyDetail(bounty.slug);
  } catch {
    // The board list item already carries the pot and rewards: keep it.
  }
  const tri = el("div", "tri");
  tri.append(buildBoardPane(items), renderBountyPane(bounty, full, lbEntries), renderTopRail(bounty.slug, bounty, lbEntries));
  view.replaceChildren(tri);
  boardRows = new Map();
  patchBoardRows();
  updateCacheLine();
  window.__shotReady = true;
}


// ---- Virtualized list: only the rows in view exist in the DOM. ----
function virtualList(host, rows, rowH, renderRow, statusEl) {
  const total = el("div", "vtotal");
  total.style.height = rows.length * rowH + "px";
  const win = el("div", "vwin");
  total.append(win);
  host.append(total);
  function paint() {
    const start = Math.max(0, Math.floor(host.scrollTop / rowH) - 4);
    const end = Math.min(rows.length, Math.ceil((host.scrollTop + host.clientHeight) / rowH) + 4);
    win.style.transform = "translateY(" + start * rowH + "px)";
    win.replaceChildren(...rows.slice(start, end).map((r, i) => renderRow(r, start + i)));
    if (statusEl) statusEl.textContent = "Showing " + (start + 1) + "–" + end + " of " + rows.length;
  }
  host.addEventListener("scroll", () => requestAnimationFrame(paint), { passive: true });
  paint();
}

async function renderLeaderboardPage(slug) {
  view.replaceChildren(el("p", "loading", "Loading leaderboard…"));
  try {
    if (!boardCache) boardCache = await boardList();
    const bounty = boardCache.items.find((c) => c.slug === slug);
    if (!bounty) throw new Error("no bounty");
    const lb = await bountyBoard(slug);
    const entries = lb.entries || [];
    const page = el("div", "lbpage");
    const head = el("div", "lbhead");
    head.append(el("h2", null, "Leaderboard"));
    head.append(el("span", "crumb", bounty.title));
    const meta = el("div", "lbmeta");
    meta.append(
      document.createTextNode(entries.length + " ranked · by judge win rate · 90% interval · "),
      link("#/bounty/" + slug, "← Back to bounty", "navlink"),
    );
    const status = el("div", "lbstatus");
    const thead = el("div", "lbrow lbhead-row");
    for (const h of ["#", "Entrant", "Entry", "Judge win rate", "Prize now"]) thead.append(el("span", null, h));
    const host = el("div", "vlist");
    const renderRow = (e) => {
      const row = el("div", "lbrow");
      row.append(el("span", "num", String(e.rank)));
      const who = el("span", "lbwho");
      who.append(avatarImg(e.image, "av sm"), document.createTextNode(" " + e.handle));
      who.addEventListener("click", () => { location.hash = "#/profile/" + e.handle; });
      row.append(who);
      row.append(el("span", "lbtitle", e.title));
      const rate = el("span", "num");
      rate.textContent = (e.values.judge / 10000).toFixed(1) + "%  ·  " +
        (e.values.judge_low / 10000).toFixed(1) + "–" + (e.values.judge_high / 10000).toFixed(1) + "%";
      row.append(rate);
      row.append(el("span", "num pays", money(prizeNow(bounty, e.rank))));
      return row;
    };
    page.append(head, meta, status, thead, host);
    view.replaceChildren(page);
    virtualList(host, entries, 36, renderRow, status);
    const strip = document.getElementById("strip");
    strip.replaceChildren(document.createTextNode(bounty.title + " · " + money(bounty.potUsd) + " live pot · " + fmtInt(bounty.submissionCount) + " entries"));
    updateCacheLine();
    window.__shotReady = true;
  } catch {
    view.replaceChildren(el("p", "err", "Leaderboard not found for this bounty."));
    window.__shotReady = true;
  }
}

async function renderProfile(handle) {
  view.replaceChildren(el("p", "loading", "Loading profile…"));
  let p;
  try {
    p = await profileOf(handle);
  } catch {
    view.replaceChildren(el("p", "err", "Profile @" + handle + " not found."));
    window.__shotReady = true;
    return;
  }
  const page = el("div", "profile");
  const head = el("div", "phead");
  head.append(avatarImg(p.image || (p.avatar && p.avatar.url), "av lg"));
  const who = el("div", "pwho");
  who.append(el("h2", null, "@" + p.handle));
  who.append(el("div", "psub", "Joined " + fmtDate(p.joined_at) + (p.display_name ? " · " + p.display_name : "")));
  head.append(who);
  page.append(head);
  const r = p.record || {};
  const stats = el("div", "stats");
  stats.append(
    statBox("Entered", fmtInt(r.competitions_entered), ""),
    statBox("Placed", fmtInt(r.competitions_placed), ""),
    statBox("Won", fmtInt(r.competitions_won), ""),
    statBox("Best place", r.best_placement ? "#" + r.best_placement : "—", ""),
    statBox("Prize money", money(r.prize_usd), ""),
  );
  page.append(stats);
  const table = el("table", "ptable");
  const thead = el("thead");
  const hr = el("tr");
  for (const h of ["Entry", "Bounty", "Score", "Place", "Prize"]) hr.append(el("th", null, h));
  thead.append(hr);
  const tbody = el("tbody");
  for (const s of p.solutions || []) {
    const tr = el("tr");
    tr.append(el("td", null, s.title));
    tr.append(el("td", null, s.competition ? s.competition.title : ""));
    const sv = s.score ? s.score.value : null;
    tr.append(el("td", "num", sv == null ? "—" : sv > 1000000 ? fmtInt(sv / 10000) : (sv / 10000).toFixed(1) + "%"));
    tr.append(el("td", "num", s.placement ? "#" + s.placement : "—"));
    tr.append(el("td", "num pays", s.prize_usd ? money(s.prize_usd) : "—"));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  page.append(el("h3", null, "Entries"), table);
  view.replaceChildren(page);
  const strip = document.getElementById("strip");
  strip.replaceChildren(document.createTextNode("@" + p.handle + " · " + fmtInt(r.competitions_entered) + " entered · " + money(r.prize_usd) + " won"));
  updateCacheLine();
  window.__shotReady = true;
}
