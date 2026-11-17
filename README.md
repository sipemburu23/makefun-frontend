# make.fun board — a fast, light make.fun frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

An unofficial, read-only frontend for [make.fun](https://make.fun), built
for the makefun-frontend-01 bounty ($500). Static files, no build step,
no framework, no webfonts, no trackers: one small stylesheet and three
small ES modules, served by any static file server with `app/` at its
root.

## The four surfaces

Each is reachable by a link and by its own URL (hash routes):

- `#/` — the bounty board: live bounties with each one's live pot
  (reward + entry fees), entry fee where one is set, deadline and time
  left, and entry count. Filter by text, sort by deadline, reward or
  entries. Open rows are enriched with each bounty's live pot after the
  first paint.
- `#/bounty/<slug>` — a bounty's page: summary, live pot, entry fee,
  deadline, entries, the rewards table with the live pot split (base +
  fee share), and the full description with its rules.
- `#/bounty/<slug>/leaderboard` — that bounty's leaderboard: rank,
  entrant (linked to their profile), entry, and the judge win rate with
  its interval, validity and size.
- `#/profile/<handle>` — an account's public profile: avatar, record
  (entered / placed / won / best place / prize money) and their entries
  with scores, places and prizes.

## How it works

- Read-only: `GET` requests to `https://make.fun/api/...` only. No
  sign-in, no writes. Avatars and entry images use
  `crossorigin="anonymous"`.
- Caching: API answers are cached in memory and `sessionStorage` and
  revalidated with `If-None-Match` (the API sends ETags bound to the
  minute), so a second view or a reload usually costs a 304, not a
  download. Countdowns refresh in place every 30 seconds without
  rebuilding the page.
- `window.__shotReady` is `false` while a route loads and `true` once
  its data has rendered.
- A bounty past its deadline is shown as closed from the deadline,
  not from its status alone.

## Run it locally

```sh
cd app && python3 -m http.server 8080
# open http://localhost:8080/
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
make.fun data (1280×800): `1-board.jpg` (the cover), `2-bounty.jpg`,
`3-leaderboard.jpg`. See `shots.json` for each shot's route and
viewport.
