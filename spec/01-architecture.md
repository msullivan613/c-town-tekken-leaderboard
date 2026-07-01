# 1. Architecture

## 1.1 System overview

A static front end plus two scheduled data pipelines, all on free GitHub
infrastructure. Nothing runs a server; JSON files committed to the repo are the
only "database."

```
                    ┌───────────────── GitHub repo (main) ─────────────────┐
                    │                                                       │
 EWGF.gg API ─┐     │  .github/workflows/online-stats.yml  (cron, daily)    │
              ├────▶│    → public/data/ranks.json                           │
 Wavu Wank ───┘     │    → public/data/glicko.json                          │
 (Glicko-2)         │    → append public/data/rankhistory.json              │
                    │    → append public/data/mmrhistory.json               │
                    │                                                       │
 Google Sheet ─────▶│  .github/workflows/match-sync.yml    (cron, 6h)       │
 (matches only)     │    → public/data/matches.json                         │
                    │    → public/data/stats.json (derived)                 │
                    │                                                       │
 hand edit ────────▶│  public/data/players.json  (roster, committed)       │
                    │                                                       │
                    │  push to main ─▶ deploy.yml ─▶ build ─▶ GitHub Pages   │
                    └───────────────────────────────────────────────────────┘
                                              │
                                              ▼
                              React + Vite SPA (reads /data/*.json)
```

Both pipelines write JSON under `public/data/` and `git commit` the changes. Any
commit to `main` that touches the app or its data triggers `deploy.yml`, which
rebuilds the site and publishes it to Pages. The data is therefore always part of
the deployed build — no runtime fetch to a third party, no CORS, no secrets in the
browser.

> **📌 Decision — data lives in `public/data/` and ships with the build.**
> Vite copies everything in `public/` to `dist/` verbatim, so `public/data/*.json`
> is fetchable at runtime as `${BASE_URL}data/foo.json`. This keeps a single source
> of truth (the repo) and avoids a separate data host/CDN. The cost is a rebuild per
> data update, which is free and fast on Actions. Resolves brief §6 "JSON as the
> database" and §7 "where to store snapshots."

## 1.2 Tech stack

> **📌 Decision — one language (TypeScript) for app *and* pipelines.**
> Pipeline scripts run under [`tsx`](https://github.com/privatenumber/tsx) so they
> can import the exact same type definitions (`src/types/`) the frontend uses. A
> schema change is caught at compile time in both places. No Python.

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | shared types between app + pipelines |
| Build / dev | Vite 5 | fast, first-class GitHub Pages support via `base` |
| UI | React 18 | function components + hooks |
| Routing | React Router 6, **HashRouter** | see decision below |
| Styling | Tailwind CSS + CSS custom-property design tokens | distinctive theme per brief §4.1 |
| Charts | [Recharts](https://recharts.org) | line charts for rank/MMR history |
| Data fetch | native `fetch` + a small `useJson<T>()` hook | no React Query needed for static JSON |
| Pipeline runtime | Node 20 + `tsx` | run inside GitHub Actions |
| Sheet parsing | `csv-parse` | reads the published-CSV export |
| Lint / format | ESLint + Prettier | |
| Tests | Vitest | unit tests for pipeline transforms + stats math |

> **📌 Decision — HashRouter for routing.**
> GitHub Pages has no server-side rewrite, so a deep link like `/player/matt` served
> by `BrowserRouter` 404s on refresh. The common `404.html` redirect hack works but
> is fragile. `HashRouter` (`/#/player/matt`) is zero-config and robust for a
> crew-internal site where URL aesthetics are secondary. Revisit if we later want
> clean shareable URLs (then adopt the `spa-github-pages` 404 trick).

## 1.3 Repository layout

```
c-town-tekken-leaderboard/
├── PROJECT-BRIEF.md
├── spec/                          # these docs
├── config/
│   └── config.json                # single source of tunables (§1.4)
├── public/
│   └── data/                      # THE database — committed JSON
│       ├── players.json           # hand-maintained roster
│       ├── ranks.json             # generated: EWGF
│       ├── glicko.json            # generated: Wavu
│       ├── rankhistory.json       # generated: append-only
│       ├── mmrhistory.json        # generated: append-only
│       ├── matches.json           # generated: Google Sheet
│       └── stats.json             # generated: derived from matches
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # router + layout
│   ├── types/                     # shared TS types (frontend + pipeline)
│   │   ├── domain.ts              # Player, Pair, Character, Rank...
│   │   └── data-files.ts          # shape of each *.json file
│   ├── data/
│   │   ├── characters.ts          # canonical character list + alias maps
│   │   ├── ranks.ts               # Tekken 8 rank tier ladder + colors/icons
│   │   └── useJson.ts             # fetch hook
│   ├── lib/
│   │   ├── leaderboard.ts         # players⇄pairs collapse, sorting, best-pair
│   │   └── format.ts
│   ├── pages/                     # route-level components
│   ├── components/                # reusable UI
│   └── styles/
├── scripts/                       # pipeline entrypoints (run via tsx)
│   ├── online-stats/
│   │   ├── index.ts               # orchestrates the daily job
│   │   ├── ewgf.ts                # EWGF client + mapping
│   │   └── wavu.ts                # Wavu Wank client + mapping
│   ├── match-sync/
│   │   ├── index.ts
│   │   ├── sheet.ts               # fetch + parse published CSV
│   │   └── stats.ts               # derive head-to-head / win rates
│   └── shared/
│       ├── config.ts              # loads config/config.json
│       ├── characters.ts          # re-exports src/data/characters.ts
│       └── atomicWrite.ts         # write + stable-sort + pretty-print JSON
├── .github/workflows/
│   ├── online-stats.yml
│   ├── match-sync.yml
│   └── deploy.yml
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## 1.4 Configuration

> **📌 Decision — all tunables in `config/config.json`, imported by pipelines and app.**
> Changing the play threshold or cron cadence is a one-line edit, no code change.

```jsonc
{
  "pairThreshold": {
    "minRankedGames": 10,        // a (player,character) pair must have ≥ this many
    "requireAssignedRank": true  // ...AND a non-null current rank to appear
  },
  "leaderboard": {
    "defaultView": "players",    // "players" | "pairs"
    "defaultSort": "rank",       // "rank" | "mmr"
    "bestPairMetric": "mmr"      // how "best pair" is chosen for Players view
  },
  "sheet": {
    // Google Sheet → File → Share → Publish to web → CSV. Public, read-only.
    "csvUrl": "https://docs.google.com/spreadsheets/d/e/…/pub?gid=0&single=true&output=csv"
  },
  "sources": {
    "ewgfBaseUrl": "https://api.ewgf.gg",        // verified — see 07-external-api-reference.md
    "ewgfPlayerPath": "/player-stats",           // GET /player-stats/{polarisId}, needs Bearer key
    "wavuProfileUrl": "https://wank.wavu.wiki"   // verified — per-player is HTML scrape, no key
  },
  // EWGF_API_KEY is NOT stored here — it's a GitHub Actions secret (§1.5, §7.4).
  "history": {
    "granularity": "daily",
    "maxDaysInline": 730         // >2yr → roll older snapshots into yearly files
  }
}
```

The app reads config at build time (imported module), so the deployed bundle bakes
in `defaultView`/`defaultSort`. The pipelines read it at runtime.

## 1.5 Deploy model

- `deploy.yml` triggers on `push` to `main` (paths: `src/**`, `public/**`,
  `config/**`, `index.html`, build config). It runs `npm ci && npm run build` and
  publishes `dist/` with `actions/deploy-pages`.
- Vite `base` is set to `/c-town-tekken-leaderboard/` (the repo name) so asset URLs
  resolve under the Pages sub-path. Data is fetched via `import.meta.env.BASE_URL`.
- The data pipelines (`online-stats.yml`, `match-sync.yml`) commit to `main`, which
  in turn fires `deploy.yml`. To avoid infinite loops, pipelines commit with
  `[skip ci]`-style path scoping is *not* needed because `deploy.yml` is
  path-filtered to only run on content changes and pipelines never touch each other's
  triggers — but each pipeline **only commits when its output JSON actually changed**
  (see §3.5 / §4.5).

See [`03-online-stats-pipeline.md`](./03-online-stats-pipeline.md) and
[`04-match-pipeline.md`](./04-match-pipeline.md) for the workflow YAML.

## 1.6 Secrets

Only one secret exists, and it never reaches the browser:

- **`EWGF_API_KEY`** — GitHub Actions repository secret. EWGF's API is fully gated
  (every endpoint returns 401 without a Bearer key — verified,
  [§7.4](./07-external-api-reference.md#74-ewgf-api-key-decision-resolves-the-biggest-open-risk)).
  `online-stats.yml` passes it as an env var to the pipeline. Because the pipeline
  runs in Actions and only commits derived JSON, the key stays server-side. If it's
  absent, the pipeline degrades to Wavu-only (MMR, no in-game rank) — see §7.4.

Wavu Wank and the Google Sheet (published CSV) need **no** secret — both are read
anonymously.
