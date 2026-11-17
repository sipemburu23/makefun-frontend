// Hash router for the four surfaces: #/ board, #/bounty/<slug>,
// #/bounty/<slug>/leaderboard and #/profile/<handle>.
// window.__shotReady is false while a route loads and true once its data
// has rendered, so screenshots always catch the finished page.

import { listCompetitions, getCompetition, getLeaderboard, getProfile } from "./api.js";
import {
  el,
  timeLeftText,
  boardView,
  bountyView,
  leaderboardView,
  profileView,
  loadingView,
  errorView,
} from "./views.js";

const view = document.getElementById("view");
const footNote = document.getElementById("foot-note");
window.__shotReady = false;

function show(node) {
  view.replaceChildren(node);
  window.scrollTo(0, 0);
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "board" };
  if (parts[0] === "bounty" && parts[1] && parts[2] === "leaderboard") {
    return { name: "leaderboard", slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "bounty" && parts[1]) {
    return { name: "bounty", slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "profile" && parts[1]) {
    return { name: "profile", handle: decodeURIComponent(parts[1]) };
  }
  return { name: "board" };
}

async function render() {
  const route = parseRoute();
  window.__shotReady = false;
  show(loadingView("Loading…"));
  try {
    if (route.name === "board") {
      show(boardView(await listCompetitions()));
    } else if (route.name === "bounty") {
      show(bountyView(await getCompetition(route.slug)));
    } else if (route.name === "leaderboard") {
      show(leaderboardView(route.slug, await getLeaderboard(route.slug, 50)));
    } else {
      show(profileView(await getProfile(route.handle)));
    }
    footNote.textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (err) {
    show(errorView(err && err.message));
  }
  window.__shotReady = true;
}

// Countdowns tick in place once a minute: only the text of each
// [data-deadline] span changes, the page is never rebuilt for it.
setInterval(() => {
  const now = Date.now();
  for (const span of document.querySelectorAll("[data-deadline]")) {
    const iso = span.dataset.deadline;
    if (!iso) continue;
    const next = timeLeftText(iso);
    if (span.textContent !== next) span.textContent = next;
    span.classList.toggle("soon", new Date(iso).getTime() - now < 3600000);
  }
}, 60000);

window.addEventListener("hashchange", render);
render();

