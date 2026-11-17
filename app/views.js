// Views: every surface is built with DOM methods and textContent, never
// innerHTML from API data, so a bounty title or a handle can never inject
// markup. Countdowns are plain spans updated in place by app.js.

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// The API sometimes answers an avatar as a path on make.fun itself
// (/api/avatars/….webp). A bare path would resolve against this app's own
// server and 404, so root it on make.fun; absolute URLs pass through.
export function avatarUrl(src) {
  if (!src) return "";
  if (src.startsWith("/")) return "https://make.fun" + src;
  return src;
}

export function money(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const cents = Number.isInteger(v) ? 0 : 2;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: 2 });
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "2d 4h 12m" until the deadline; past deadlines read "closed".
export function timeLeftText(iso) {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "closed";
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
  return m + "m";
}

// A bounty still takes entries while its deadline is in the future, even
// when its status still reads open after the results were published.
export function isOpen(bounty) {
  if (!bounty || !bounty.deadline) return false;
  return new Date(bounty.deadline).getTime() > Date.now();
}

function countdownSpan(iso) {
  const s = el("span", "time-left", timeLeftText(iso));
  s.dataset.deadline = iso || "";
  return s;
}

function metaRow(label, valueNode) {
  const wrap = el("div", "meta");
  wrap.append(el("span", null, label + ": "), valueNode);
  return wrap;
}

export function loadingView(text) {
  const view = el("div", "loading", text || "Loading…");
  return view;
}

export function errorView(message) {
  const wrap = el("div", "error");
  wrap.append(el("h1", null, "Something went wrong"));
  wrap.append(el("p", null, message || "make.fun did not answer. Please try again."));
  const back = el("a", null, "← Back to the board");
  back.href = "#/";
  wrap.append(back);
  return wrap;
}

// ---- Board: every live bounty, open ones first, soonest deadline first. ----
export function boardView(data) {
  const items = (data && data.items) || [];
  const open = items.filter(isOpen).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const closed = items.filter((b) => !isOpen(b)).sort((a, b) => new Date(b.deadline) - new Date(a.deadline));
  const all = open.concat(closed);
  const pot = open.reduce((sum, b) => sum + (Number(b.potUsd ?? b.rewardAmount) || 0), 0);

  const wrap = el("div");
  wrap.append(el("h1", null, "Bounty board"));
  wrap.append(el("p", "sub", "Live bounties on make.fun — reward, live pot, entry fee, time left and entries."));

  const stats = el("div", "stats");
  const stat = (value, label) => {
    const s = el("div", "stat");
    s.append(el("b", null, value), el("span", null, label));
    return s;
  };
  stats.append(
    stat(String(open.length), "open now"),
    stat(money(pot), "open pot"),
    stat(String(items.length), "bounties listed"),
  );
  wrap.append(stats);

  const grid = el("div", "grid");
  for (const b of all) {
    const card = el("article", "card");
    const h = el("h3");
    const link = el("a", null, b.title || b.slug);
    link.href = "#/bounty/" + b.slug;
    h.append(link);
    card.append(h);
    if (b.category) card.append(el("span", "chip", b.category));
    const meta = el("div", "meta");
    const potEl = el("b", "pot", money(b.potUsd ?? b.rewardAmount));
    meta.append(potEl);
    if (b.entryFeeUsd !== null && b.entryFeeUsd !== undefined) {
      meta.append(el("span", null, "fee " + money(b.entryFeeUsd)));
    }
    meta.append(countdownSpan(b.deadline));
    meta.append(el("span", null, (b.submissionCount ?? 0) + " entries"));
    card.append(meta);
    if (b.summary) card.append(el("p", null, b.summary));
    grid.append(card);
  }
  wrap.append(grid);
  if (!all.length) wrap.append(el("p", "sub", "No bounties right now."));
  return wrap;
}

// ---- Bounty page: summary, rules, rewards table, dates and status. ----
export function bountyView(b) {
  const wrap = el("div");
  const chip = el("span", "chip " + (isOpen(b) ? "open" : "closed"), isOpen(b) ? "Open for entries" : "Closed");
  wrap.append(chip);
  wrap.append(el("h1", null, b.title || b.slug));
  if (b.summary) wrap.append(el("p", "sub", b.summary));

  const facts = el("div", "facts");
  const fact = (label, valueNode) => {
    const f = el("div", "fact");
    f.append(el("span", null, label), valueNode);
    return f;
  };
  facts.append(
    fact("Live pot", el("b", "pot", money(b.potUsd ?? b.rewardAmount))),
    fact("Reward", el("b", null, money(b.rewardAmount))),
    fact("Entry fee", el("b", null, b.entryFeeUsd ? money(b.entryFeeUsd) : "Free")),
    fact("Time left", timeLeftHolder(b.deadline)),
    fact("Entries", el("b", null, String(b.submissionCount ?? 0))),
    fact("Deadline", el("b", null, fmtDate(b.deadline))),
  );
  wrap.append(facts);

  const nav = el("p");
  const lb = el("a", null, "View the leaderboard →");
  lb.href = "#/bounty/" + b.slug + "/leaderboard";
  nav.append(lb);
  wrap.append(nav);

  const rewards = b.rewards || b.rewardsNow || null;
  if (rewards && typeof rewards === "object") {
    wrap.append(el("h2", null, "Rewards"));
    const table = el("table");
    const head = el("tr");
    head.append(el("th", null, "Place"), el("th", "num", "Prize"));
    table.append(head);
    const places = Object.keys(rewards).sort((a, c) => Number(a) - Number(c));
    for (const place of places) {
      const row = el("tr");
      row.append(el("td", null, placeLabel(place)), el("td", "num", money(rewards[place])));
      table.append(row);
    }
    wrap.append(table);
  }

  if (b.description) {
    wrap.append(el("h2", null, "Rules"));
    // The description is markdown from the API; show it as plain text so
    // no markup in it can run. Trimmed to keep the page readable.
    wrap.append(el("div", "desc", b.description.slice(0, 4000)));
  }
  wrap.append(el("p", "sub", "Status: " + (b.status || "—") + " · Published " + fmtDate(b.publishedAt)));
  return wrap;
}

function timeLeftHolder(iso) {
  const holder = el("b");
  holder.append(countdownSpan(iso));
  return holder;
}

function placeLabel(place) {
  const n = Number(place);
  if (!Number.isFinite(n)) return place;
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return n + suffix;
}

// ---- Leaderboard: ranked entries, win rate and dossier size. ----
export function leaderboardView(slug, data) {
  const entries = (data && data.entries) || [];
  const comp = (data && data.competition) || {};
  const wrap = el("div");
  wrap.append(el("h1", null, (comp.title || slug) + " — leaderboard"));
  wrap.append(el("p", "sub", entries.length + " ranked entries · judge win rate, with dossier size as the tie-break."));

  const back = el("p");
  const bl = el("a", null, "← Back to the bounty");
  bl.href = "#/bounty/" + slug;
  back.append(bl);
  wrap.append(back);

  if (!entries.length) {
    wrap.append(el("p", "sub", "No ranked entries yet."));
    return wrap;
  }
  const table = el("table");
  const head = el("tr");
  head.append(
    el("th", null, "#"),
    el("th", null, "Entrant"),
    el("th", "num", "Win rate"),
    el("th", "num", "Size"),
  );
  table.append(head);
  for (const row of entries) {
    const tr = el("tr");
    tr.append(el("td", null, String(row.rank ?? "—")));
    const who = el("td");
    const whoWrap = el("div", "who");
    if (row.image) {
      const img = document.createElement("img");
      img.setAttribute("crossorigin", "anonymous");
      img.src = avatarUrl(row.image);
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      whoWrap.append(img);
    }
    const name = el("a", null, row.handle || "—");
    name.href = "#/profile/" + (row.handle || "");
    whoWrap.append(name);
    who.append(whoWrap);
    tr.append(who);
    const rate = row.values && row.values.judge !== undefined ? row.values.judge / 10000 : null;
    tr.append(el("td", "num", rate === null ? "—" : rate.toFixed(2) + "%"));
    const bytes = row.values && row.values.bytes;
    tr.append(el("td", "num", bytes ? Math.round(bytes / 1024) + " KB" : "—"));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

// ---- Profile: public account, record and entries. ----
export function profileView(p) {
  const wrap = el("div");
  const head = el("div", "profile-head");
  if (p.image) {
    const img = document.createElement("img");
    img.setAttribute("crossorigin", "anonymous");
    img.src = avatarUrl(p.image);
    img.alt = "";
    img.onerror = () => img.remove();
    head.append(img);
  }
  const nameBox = el("div");
  nameBox.append(el("h1", null, p.display_name || p.handle));
  if (p.bio) nameBox.append(el("p", "bio", p.bio));
  nameBox.append(el("p", "sub", "@" + p.handle + " · joined " + fmtDate(p.joined_at)));
  head.append(nameBox);
  wrap.append(head);

  const rec = p.record || {};
  const facts = el("div", "facts");
  const fact = (label, value) => {
    const f = el("div", "fact");
    f.append(el("span", null, label), el("b", null, value));
    return f;
  };
  facts.append(
    fact("Entered", String(rec.competitions_entered ?? 0)),
    fact("Placed", String(rec.competitions_placed ?? 0)),
    fact("Won", String(rec.competitions_won ?? 0)),
    fact("Prize money", money(rec.prize_usd)),
  );
  wrap.append(facts);

  const solutions = p.solutions || [];
  wrap.append(el("h2", null, "Entries (" + solutions.length + ")"));
  if (!solutions.length) {
    wrap.append(el("p", "sub", "No entries yet."));
    return wrap;
  }
  const list = el("div", "entry-list");
  for (const s of solutions) {
    const card = el("article", "card");
    card.append(el("h3", null, s.title || "Untitled entry"));
    const meta = el("div", "meta");
    if (s.competition) {
      const cl = el("a", null, s.competition.title || s.competition.slug);
      cl.href = "#/bounty/" + s.competition.slug;
      meta.append(cl);
      meta.append(el("span", null, fmtDate(s.competition.deadline)));
    }
    if (s.placement) meta.append(el("span", "chip", "Placed #" + s.placement));
    if (s.prize_usd) meta.append(el("span", "pot", money(s.prize_usd)));
    card.append(meta);
    list.append(card);
  }
  wrap.append(list);
  return wrap;
}
