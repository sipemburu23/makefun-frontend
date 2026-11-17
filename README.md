[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/sipemburu23/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# make.fun board — fast read-only frontend

A fast, read-only web client for [make.fun](https://make.fun), built from static files with no build step and no framework. It reads only make.fun's public API (`GET https://make.fun/api/...`), caches answers with ETags, and renders four surfaces, each with its own URL.

## Surfaces

- **Board** — `#/`: every live bounty with its reward and live pot, entry fee, time left and entry count. Open bounties first, soonest deadline first.
- **Bounty page** — `#/bounty/<slug>`: summary, rules, rewards table with the live pot, dates and status. Whether it still takes entries is judged by its deadline, not its status alone.
- **Leaderboard** — `#/bounty/<slug>/leaderboard`: ranked entries with judge win rate and dossier size.
- **Profile** — `#/profile/<handle>`: public account, record (entered / placed / won / prize money) and entries.

## How it works

- `app/index.html` — the shell; loads one stylesheet and one module.
- `app/api.js` — fetch layer: ETag / `If-None-Match` revalidation plus a `sessionStorage` cache, so a revisit inside the same minute costs a 304, and a failed fetch falls back to the last good answer.
- `app/views.js` — all four surfaces, built with DOM methods and `textContent` (no `innerHTML` from API data). Long lists are capped at 50 rows; countdowns are spans updated in place once a minute, never a page rebuild.
- `app/app.js` — hash router; sets `window.__shotReady` to `false` while a route loads and `true` once it has rendered.
- `main.ts` — copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with `buildDossier` from `vendor/makefun-frontend.ts`. All paths resolve from `import.meta.url`, so it runs from any working directory.

First load is five files (HTML + CSS + three small modules), no webfonts, no framework.

## Run it

```sh
# serve app/ on http://localhost:8080 (any static server works)
cd app && python3 -m http.server 8080
```

Then open http://localhost:8080 in a desktop browser.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
