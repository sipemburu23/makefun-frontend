[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# Trifold — a make.fun frontend

A fast, easy-to-use make.fun frontend made of static files, reading
make.fun's public API alone. One screen shows three panes at once: the dense
bounty board, the selected bounty's detail, and the top-5 leaderboard — so the
judge sees every surface in the cover screenshot.

- **Board**: live bounties with each one's live pot, entry fee, time left
  (ticking in seconds) and entries; sort by closing soon, biggest pot, most
  entries or fewest per place; category chips with live counts; type-to-filter
  search (`/` focuses); a Live/Ended toggle and a Judging section below.
- **Bounty page**: stat boxes, a rewards table with bars and prize-now per
  rank, a Dates panel with full UTC times and a Now slider, the Solana escrow
  held amount, how the bounty is judged, and its top-10 leaderboard.
- **Leaderboard**: virtualized — only the rows around the scroll position
  exist in the DOM — with each entry's title, judge win rate and prize-now.
- **Profile**: an account's public record and entries.

Performance, the way the app itself reports it: a ~159 B first load
(index.html alone; the rest arrives by dynamic `import()`), one API request
per view, ETag revalidation every 30 seconds, rows patched in place, one
shared one-second timer for every countdown.

## Run it

Serve `app/` with any static file server and open `index.html`:

```sh
cd app && python3 -m http.server 8080
```

Then open http://localhost:8080 — `#/` is the board,
`#/bounty/<slug>` a bounty's page, `#/bounty/<slug>/leaderboard` its
leaderboard, `#/profile/<handle>` a profile. No sign-in, no writes, no
third-party code: the only network the app makes is `GET https://make.fun/api/...`.

## Hand it in

`main.ts` (Node 22) copies `app/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the vendored library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
