// Router + shell. Hash routes, one per surface:
//   #/                          bounty board
//   #/bounty/<slug>             a bounty's page
//   #/bounty/<slug>/leaderboard that bounty's leaderboard
//   #/profile/<handle>          an account's public profile
// window.__shotReady is false while a route loads and true once its
// data has rendered, so screenshot tooling can wait on it.
import { boardView, bountyView, leaderboardView, profileView, el, startClock } from "./views.js";

const view = document.getElementById("view");
let token = 0;

function showError(root, err) {
  const p = el("p", "error", "Could not load this page: " + err.message + ". ");
  const retry = el("a", null, "Try again");
  retry.href = location.hash || "#/";
  p.appendChild(retry);
  root.appendChild(p);
}

async function route() {
  const my = ++token;
  window.__shotReady = false;
  view.replaceChildren();
  view.appendChild(el("p", "loading", "Loading…"));
  document.querySelectorAll(".top nav a").forEach((a) => a.removeAttribute("aria-current"));
  const hash = location.hash.slice(1) || "/";
  const parts = hash.split("/").filter(Boolean);
  try {
    if (parts.length === 0) {
      await boardView(view, null);
    } else if (parts[0] === "bounty" && parts[1] && parts[2] === "leaderboard") {
      await leaderboardView(view, decodeURIComponent(parts[1]));
    } else if (parts[0] === "bounty" && parts[1]) {
      await bountyView(view, decodeURIComponent(parts[1]));
    } else if (parts[0] === "profile" && parts[1]) {
      await profileView(view, decodeURIComponent(parts[1]));
    } else {
      view.replaceChildren();
      view.appendChild(el("h1", null, "Page not found"));
      view.appendChild(el("p", null, "That address does not match a board, bounty, leaderboard or profile."));
      view.appendChild(el("p", null, "")).appendChild(Object.assign(document.createElement("a"), { href: "#/", textContent: "Back to the board" }));
    }
  } catch (err) {
    if (my !== token) return;
    view.replaceChildren();
    showError(view, err);
  }
  if (my === token) window.__shotReady = true;
}

window.addEventListener("hashchange", route);
startClock();
route();
