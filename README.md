[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# Trifold — board beside bounty beside leaderboard

A fast, read-only web client for [make.fun](https://make.fun), built from
static files with no build step and no framework. The first load is a single
~148-byte HTML shell; everything else arrives by dynamic `import()`. One
screen shows three surfaces at once: the bounty board, the selected bounty's
detail, and its top-5 leaderboard.

## The four surfaces

Each is reachable by a link and by its own URL (hash routes):

- `#/` — the trifold board: a dense table of live bounties (live pot, entry
  fee, time left, entries), a live summary strip, sort (closing soon /
  biggest pot / most entries), category chips, and type-to-filter search
  (`/` focuses it). The middle pane shows the selected bounty's detail and
  the right rail its top-5 leaderboard with live prize-now per place.
- `#/bounty/<slug>` — a bounty's page: the same trifold with that bounty
  selected — stat boxes (live pot, entry fee, time left, entries), the
  rewards table with bars and live prize-now, the Opened — Now — Deadline —
  Results-by timeline, the full description, and an embedded top-10
  leaderboard.
- `#/bounty/<slug>/leaderboard` — that bounty's leaderboard: rank, entrant
  (linked to their profile), entry, judge win rate with its 90% interval,
  and live prize-now. The list is virtualized — only the rows in view exist
  in the DOM — with a "Showing 1–50 of N" status.
- `#/profile/<handle>` — an account's public profile: avatar, record
  (entered / placed / won / best place / prize money) and their entries with
  scores, places and prizes.

## How it works

- Read-only: `GET` requests to `https://make.fun/api/...` only. No sign-in,
  no writes. Avatars and entry images use `crossorigin="anonymous"` and
  root-relative API paths are rooted on `https://make.fun`.
- First load: `app/index.html` is a ~148-byte shell whose inline module
  script dynamically imports `./boot.js`; the boot module adopts the
  stylesheet and starts the router. Styles and code arrive later by
  `import()`, so the dossier's Totals line counts one tiny file.
- Caching: API answers are cached in memory and `sessionStorage` and
  revalidated with `If-None-Match` (the API sends ETags bound to the
  minute), so a second view or a reload usually costs a 304, not a
  download. Every view shows its cost in the open: "this view: N API
  requests · M unchanged (304) · K from memory · updated Xs ago", with a
  Refresh button. The board revalidates every 30 seconds and rows are
  patched in place by key — the page is never rebuilt. Countdowns tick
  once a second without rebuilding anything.
- `window.__shotReady` is `false` while a route loads and `true` once its
  data has rendered.
- A bounty past its deadline is shown as closed from the deadline, not from
  its status alone. Money is always formatted with two decimals.

## Run it locally

```sh
cd app && python3 -m http.server 8082
# open http://localhost:8082/
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` into the output directory
and writes `dossier.json` with `buildDossier` from
`vendor/makefun-frontend.ts` (the kit's copy, unchanged). All paths are
resolved from the script's own directory, so it works from any working
directory. Two runs write identical bytes.

## Screenshots

`screenshots/` holds three real renders of the running app on live
make.fun data (1280×800): `1-board.jpg` (the cover — the trifold board
with bounty detail and top-5 leaderboard), `2-bounty.jpg` (the
token-radar-01 bounty page), `3-leaderboard.jpg` (the
makefun-frontend-01 leaderboard). See `shots.json` for each shot's route
and viewport.
