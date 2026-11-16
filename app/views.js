// The four surfaces: board, bounty page, leaderboard, profile.
// Every view is built with DOM methods or escaped text — no innerHTML
// from API data, so a bounty description can never inject markup.
import { api, getCompetition, getLeaderboard, getProfile, listCompetitions, money, timeLeft, isOpen } from "./api.js";

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function link(href, text, cls) {
  const a = el("a", cls, text);
  a.href = href;
  return a;
}

function stateTag(c) {
  const open = isOpen(c);
  const end = new Date(c.deadline).getTime();
  const soon = open && end - Date.now() < 24 * 3600 * 1000;
  const tag = el("span", "tag " + (open ? (soon ? "soon" : "open") : "closed"));
  tag.textContent = open ? (soon ? "Closing soon" : "Open") : "Closed";
  return tag;
}

function deadlineLine(c) {
  const wrap = el("span");
  wrap.appendChild(el("span", null, "Ends "));
  const t = el("time");
  t.dateTime = c.deadline;
  t.textContent = new Date(c.deadline).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  wrap.appendChild(t);
  wrap.appendChild(el("span", null, " · "));
  const left = el("b");
  left.dataset.deadline = c.deadline;
  left.textContent = timeLeft(c.deadline);
  wrap.appendChild(left);
  return wrap;
}

// Refresh only the countdown texts, every 30 s, without rebuilding views.
export function startClock() {
  setInterval(() => {
    document.querySelectorAll("[data-deadline]").forEach((n) => {
      n.textContent = timeLeft(n.dataset.deadline);
    });
  }, 30000);
}

function bountyCard(c) {
  const card = el("article", "card");
  const h = el("h3");
  h.appendChild(link("#/bounty/" + c.slug, c.title));
  card.appendChild(h);
  card.appendChild(el("p", null, (c.description || "").split("\n")[0].slice(0, 140)));
  const pot = el("div", "pot", money(c.potUsd != null ? c.potUsd : c.rewardAmount));
  pot.appendChild(el("small", null, c.potUsd != null ? "live pot (reward + fees)" : "reward"));
  card.appendChild(pot);
  const meta = el("div", "meta");
  meta.appendChild(stateTag(c));
  meta.appendChild(deadlineLine(c));
  meta.appendChild(el("span", null, (c.submissionCount ?? 0) + " entries"));
  if (c.entryFeeUsd != null && parseFloat(c.entryFeeUsd) > 0) {
    meta.appendChild(el("span", null, "Fee " + money(c.entryFeeUsd)));
  }
  card.appendChild(meta);
  const row = el("div", "row");
  row.appendChild(link("#/bounty/" + c.slug, "View bounty", "btn ghost"));
  row.appendChild(link("#/bounty/" + c.slug + "/leaderboard", "Leaderboard"));
  card.appendChild(row);
  return card;
}

export async function boardView(root) {
  const data = await listCompetitions();
  root.replaceChildren();
  const items = (data.items || []).slice();
  const open = items.filter(isOpen);
  const closed = items.filter((c) => !isOpen(c));
  open.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  closed.sort((a, b) => new Date(b.deadline) - new Date(a.deadline));

  root.appendChild(el("h1", null, "Live bounties"));
  root.appendChild(el("p", "sub", open.length + " open now · " + items.length + " listed · rewards in USDC on Solana. Pick one to see its rules, rewards and leaderboard."));

  const bar = el("div", "toolbar");
  const search = el("input");
  search.type = "search";
  search.placeholder = "Filter bounties…";
  search.setAttribute("aria-label", "Filter bounties");
  const sort = el("select");
  sort.setAttribute("aria-label", "Sort bounties");
  for (const [v, t] of [["deadline", "Soonest deadline"], ["reward", "Biggest reward"], ["entries", "Most entries"]]) {
    const o = el("option", null, t);
    o.value = v;
    sort.appendChild(o);
  }
  const count = el("span", "count");
  bar.append(search, sort, count);
  root.appendChild(bar);

  const grid = el("div", "grid");
  root.appendChild(grid);
  let enriched = false;

  function render(list) {
    grid.replaceChildren();
    list.forEach((c) => grid.appendChild(bountyCard(c)));
    count.textContent = list.length + " shown";
  }

  function current() {
    const q = search.value.trim().toLowerCase();
    let list = open.filter((c) =>
      !q || c.title.toLowerCase().includes(q) || (c.category || "").toLowerCase().includes(q));
    if (sort.value === "reward") list = list.slice().sort((a, b) => (b.potUsd ?? b.rewardAmount) - (a.potUsd ?? a.rewardAmount));
    else if (sort.value === "entries") list = list.slice().sort((a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0));
    return list;
  }

  search.addEventListener("input", () => render(current()));
  sort.addEventListener("change", () => render(current()));
  render(current());

  // Enrich the open rows with each bounty's live pot and entry fee.
  // Detail calls run after the first paint, a few at a time, cached.
  if (!enriched) {
    enriched = true;
    const queue = open.slice(0, 12);
    for (let i = 0; i < queue.length; i += 3) {
      const batch = queue.slice(i, i + 3);
      await Promise.all(batch.map(async (c) => {
        try {
          const d = await getCompetition(c.slug);
          c.potUsd = d.potUsd;
          c.entryFeeUsd = d.entryFeeUsd;
        } catch { /* keep the list values */ }
      }));
      render(current());
    }
  }

  if (closed.length) {
    root.appendChild(el("h2", null, "Recently closed"));
    const cgrid = el("div", "grid");
    closed.slice(0, 6).forEach((c) => cgrid.appendChild(bountyCard(c)));
    root.appendChild(cgrid);
  }
}

// Tiny safe markdown for bounty descriptions: headings, bold, lists,
// links (https only). HTML is escaped first, so nothing executes.
export function renderMarkdown(root, md) {
  const lines = (md || "").split("\n");
  let list = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith("## ")) {
      list = null;
      root.appendChild(el("h2", null, line.slice(3)));
      continue;
    }
    if (line.startsWith("# ")) {
      list = null;
      root.appendChild(el("h2", null, line.slice(2)));
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!list) { list = el("ul"); root.appendChild(list); }
      list.appendChild(inline(line.slice(2), "li"));
      continue;
    }
    list = null;
    root.appendChild(inline(line, "p"));
  }
}

function inline(text, tag) {
  const n = el(tag);
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) n.appendChild(document.createTextNode(text.slice(last, m.index)));
    const part = m[0];
    if (part.startsWith("**")) {
      n.appendChild(el("strong", null, part.slice(2, -2)));
    } else {
      const close = part.indexOf("](");
      const label = part.slice(1, close);
      const href = part.slice(close + 2, -1);
      if (/^https:\/\//.test(href)) {
        const a = el("a", null, label);
        a.href = href;
        a.rel = "noopener";
        n.appendChild(a);
      } else {
        n.appendChild(document.createTextNode(label));
      }
    }
    last = m.index + part.length;
  }
  if (last < text.length) n.appendChild(document.createTextNode(text.slice(last)));
  return n;
}

export async function bountyView(root, slug) {
  const c = await getCompetition(slug);
  root.replaceChildren();
  const head = el("div", "row");
  head.appendChild(stateTag(c));
  head.appendChild(el("span", "tag", c.category || ""));
  for (const s of c.skills || []) head.appendChild(el("span", "tag", s));
  root.appendChild(head);
  root.appendChild(el("h1", null, c.title));
  root.appendChild(el("p", "sub", "by " + (c.sponsor && c.sponsor.name ? c.sponsor.name : "make.fun") + " · published " + new Date(c.publishedAt || c.deadline).toLocaleDateString()));

  const kv = el("dl", "kv");
  const pot = el("div");
  pot.appendChild(el("dt", null, "Live pot"));
  pot.appendChild(el("dd", null, money(c.potUsd != null ? c.potUsd : c.rewardAmount)));
  kv.appendChild(pot);
  const fee = el("div");
  fee.appendChild(el("dt", null, "Entry fee"));
  fee.appendChild(el("dd", null, c.entryFeeUsd != null ? money(c.entryFeeUsd) : "None"));
  kv.appendChild(fee);
  const dl = el("div");
  dl.appendChild(el("dt", null, "Deadline"));
  const dd = el("dd");
  dd.appendChild(el("span", null, timeLeft(c.deadline)));
  dl.appendChild(dd);
  kv.appendChild(dl);
  const en = el("div");
  en.appendChild(el("dt", null, "Entries"));
  en.appendChild(el("dd", null, String(c.submissionCount ?? 0)));
  kv.appendChild(en);
  root.appendChild(kv);

  const row = el("div", "row");
  row.appendChild(link("#/bounty/" + c.slug + "/leaderboard", "Leaderboard", "btn"));
  row.appendChild(link("https://make.fun/bounty/" + c.slug, "Open on make.fun"));
  root.appendChild(row);

  const rewards = c.rewardsNow || [];
  if (rewards.length) {
    root.appendChild(el("h2", null, "Rewards — live pot split"));
    const table = el("table");
    const thead = el("thead");
    const tr = el("tr");
    for (const h of ["Place", "Base", "Fee share", "Total now"]) {
      tr.appendChild(el("th", h === "Place" ? null : "num", h));
    }
    thead.appendChild(tr);
    table.appendChild(thead);
    const tb = el("tbody");
    for (const r of rewards) {
      const rowEl = el("tr");
      rowEl.appendChild(el("td", null, r.place === 1 ? "1st" : r.place === 2 ? "2nd" : r.place === 3 ? "3rd" : r.place + "th"));
      rowEl.appendChild(el("td", "num", money(r.baseUsd)));
      rowEl.appendChild(el("td", "num", money(r.feeShareUsd)));
      rowEl.appendChild(el("td", "num", money(r.amountUsd)));
      tb.appendChild(rowEl);
    }
    table.appendChild(tb);
    root.appendChild(table);
  } else if (c.rewards) {
    root.appendChild(el("h2", null, "Rewards"));
    const table = el("table");
    const thead = el("thead");
    const tr = el("tr");
    tr.appendChild(el("th", null, "Place"));
    tr.appendChild(el("th", "num", "Reward"));
    thead.appendChild(tr);
    table.appendChild(thead);
    const tb = el("tbody");
    for (const [place, amount] of Object.entries(c.rewards)) {
      const rowEl = el("tr");
      rowEl.appendChild(el("td", null, place));
      rowEl.appendChild(el("td", "num", money(amount)));
      tb.appendChild(rowEl);
    }
    table.appendChild(tb);
    root.appendChild(table);
  }

  const desc = el("div", "desc");
  root.appendChild(el("h2", null, "About this bounty"));
  renderMarkdown(desc, c.description || "");
  root.appendChild(desc);
  const dates = el("p", "sub", "Opens " + new Date(c.opensAt || c.publishedAt || c.deadline).toLocaleString() + " · closes " + new Date(c.deadline).toLocaleString() + " · status " + (c.status || "—"));
  root.appendChild(dates);
}

function fmtValue(key, entry) {
  const v = entry.values ? entry.values[key] : undefined;
  const d = entry.display ? entry.display[key] : undefined;
  if (v == null) return d != null ? String(d) : "—";
  if (key === "bytes") return (v / 1024).toFixed(1) + " KB";
  if (key === "valid") return v ? "✓" : "—";
  if (/judge|rate|score/.test(key)) return (v / 1000000 * 100).toFixed(2) + "%";
  return d != null ? String(d) : String(v);
}

export async function leaderboardView(root, slug) {
  const lb = await getLeaderboard(slug);
  root.replaceChildren();
  const comp = lb.competition || {};
  root.appendChild(el("h1", null, (comp.title || slug) + " — leaderboard"));
  root.appendChild(el("p", "sub", "Phase: " + ((lb.phase && lb.phase.title) || "—") + " · " + (lb.entries ? lb.entries.length : 0) + " ranked entries. Win rates are the judge's share of wins."));
  const row = el("div", "row");
  row.appendChild(link("#/bounty/" + slug, "Back to bounty", "btn ghost"));
  root.appendChild(row);
  const cols = (lb.columns || []).filter((c) => !c.hidden);
  const entries = lb.entries || [];
  if (!entries.length) {
    root.appendChild(el("p", "loading", "No ranked entries yet for this bounty."));
    return;
  }
  const table = el("table");
  const thead = el("thead");
  const tr = el("tr");
  tr.appendChild(el("th", null, "#"));
  tr.appendChild(el("th", null, "Entrant"));
  tr.appendChild(el("th", null, "Entry"));
  for (const col of cols) tr.appendChild(el("th", "num", col.title));
  thead.appendChild(tr);
  table.appendChild(thead);
  const tb = el("tbody");
  for (const e of entries.slice(0, 50)) {
    const r = el("tr");
    r.appendChild(el("td", null, String(e.rank ?? "—")));
    const who = el("td");
    who.appendChild(link("#/profile/" + e.handle, e.handle || "—"));
    r.appendChild(who);
    const what = el("td");
    if (e.image) {
      const img = document.createElement("img");
      // Entry images may be API-relative (/api/avatars/…): resolve them
      // against make.fun, never against this app's own server.
      img.src = e.image.startsWith("http") ? e.image : "https://make.fun" + e.image;
      img.alt = "";
      img.crossOrigin = "anonymous";
      img.style.cssText = "width:28px;height:28px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:8px";
      what.appendChild(img);
    }
    what.appendChild(document.createTextNode(e.title || ""));
    r.appendChild(what);
    for (const col of cols) r.appendChild(el("td", "num", fmtValue(col.key, e)));
    tb.appendChild(r);
  }
  table.appendChild(tb);
  root.appendChild(table);
  if (entries.length > 50) {
    root.appendChild(el("p", "count", "Showing the top 50 of " + entries.length + "."));
  }
}

export async function profileView(root, handle) {
  const p = await getProfile(handle);
  root.replaceChildren();
  const head = el("div", "profile-head");
  if (p.image) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.src = p.image;
    img.alt = "";
    img.crossOrigin = "anonymous";
    head.appendChild(img);
  }
  const names = el("div");
  names.appendChild(el("h1", null, p.display_name || p.handle));
  names.appendChild(el("p", "sub", "@" + p.handle + (p.github_login ? " · GitHub " + p.github_login : "") + " · joined " + new Date(p.joined_at).toLocaleDateString()));
  head.appendChild(names);
  root.appendChild(head);
  if (p.bio) root.appendChild(el("p", null, p.bio));

  const rec = p.record || {};
  const kv = el("dl", "kv");
  for (const [label, value] of [
    ["Entered", rec.competitions_entered],
    ["Placed", rec.competitions_placed],
    ["Won", rec.competitions_won],
    ["Best place", rec.best_placement],
    ["Prize money", rec.prize_usd != null ? money(rec.prize_usd) : null],
  ]) {
    const cell = el("div");
    cell.appendChild(el("dt", null, label));
    cell.appendChild(el("dd", null, value == null ? "—" : String(value)));
    kv.appendChild(cell);
  }
  root.appendChild(kv);

  const sols = p.solutions || [];
  root.appendChild(el("h2", null, "Entries (" + sols.length + ")"));
  if (!sols.length) {
    root.appendChild(el("p", "loading", "No entries yet."));
    return;
  }
  const table = el("table");
  const thead = el("thead");
  const tr = el("tr");
  for (const h of ["Entry", "Bounty", "Score", "Place", "Prize"]) tr.appendChild(el("th", h === "Entry" || h === "Bounty" ? null : "num", h));
  thead.appendChild(tr);
  table.appendChild(thead);
  const tb = el("tbody");
  for (const s of sols) {
    const r = el("tr");
    r.appendChild(el("td", null, s.title || "—"));
    const b = el("td");
    if (s.competition) b.appendChild(link("#/bounty/" + s.competition.slug, s.competition.title));
    r.appendChild(b);
    r.appendChild(el("td", "num", s.score && s.score.display ? (parseFloat(s.score.display) / 10000).toFixed(2) + "%" : "—"));
    r.appendChild(el("td", "num", s.placement == null ? "—" : String(s.placement)));
    r.appendChild(el("td", "num", s.prize_usd == null ? "—" : money(s.prize_usd)));
    tb.appendChild(r);
  }
  table.appendChild(tb);
  root.appendChild(table);
}
