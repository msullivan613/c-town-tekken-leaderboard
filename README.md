# Tekken Leaderboard

A free, serverless, self-updating Tekken 8 leaderboard. One React + Vite codebase
renders **N independently-deployed sites** on GitHub Pages; committed JSON under
`sites/<slug>/data/` is the only "database." A scheduled GitHub Action refreshes it.
There is no backend, no runtime call to a third party from the browser, no auth.

Currently two sites live in this repo: **`c-town`** (the default) and **`area-256`**.

> **Docs vs. code:** [`spec/`](./spec) and [`PROJECT-BRIEF.md`](./PROJECT-BRIEF.md)
> are design records. Where they and the code disagree, the code wins — the specs
> have been brought back in line here, but [`CLAUDE.md`](./CLAUDE.md) is the
> fastest orientation to the *current* system.

## Quick start

```bash
npm install
npm run dev          # dev server for the default site (SITE=c-town)
npm run build        # tsc --noEmit, then build every site into dist/<slug>/
npm test             # vitest (pipeline math + committed-data validation)
npm run lint
npm run format

# Work against a specific site (default is c-town):
SITE=area-256 npm run dev
```

## How it works

| Piece | What |
|---|---|
| `sites/<slug>/data/*.json` | the database — roster + generated stats, keyed per `(player, character)` pair |
| `config/config.json` + `sites/<slug>/config.json` | shared defaults + per-site branding/overrides, deep-merged; **neither alone is a complete config** |
| `scripts/online-stats/` | the refresh job: per player, tknow in-game rank + match history, Wavu Glicko MMR, and (opt-in) ewgf custom-lobby matches → `ranks/glicko/*history/matches/stats.json` |
| `src/` | the React app (leaderboard, profiles, head-to-head, matches), shared with the pipeline via `@/` modules |
| `public/` | **shared** static assets only (character icons, avatars) — *not* data |

### Data sources (all free; only ewgf needs a key)

- **[tknow.gg](https://www.tknow.gg)** (`api.tk8now.pe.kr`, no API key — gated only by
  an `Origin`/`Referer` check) — per-character in-game rank + quick/ranked match history.
- **[Wavu Wank](https://wank.wavu.wiki)** (HTML scrape, no key) — Glicko-2 MMR (μ / σ²).
- **[ewgf.gg](https://ewgf.gg)** public API (`Bearer` key) — **group/player
  (custom-lobby) matches only**, which tknow doesn't surface. This is the *only*
  place crew members meet head-to-head, so it powers the H2H feature. It is
  **opt-in per site** (`headToHead.enabled` + `EWGF_API_KEY`); with the gate off a
  site never touches ewgf and hides the H2H page. See [`spec/08`](./spec/08-ewgf-group-player-matches.md).

Matches are **gathered automatically** (no manual entry, no spreadsheet). Data flow
and every schema live in [`spec/`](./spec) — start with
[`spec/01-architecture.md`](./spec/01-architecture.md).

## Running the pipeline locally

```bash
npm run online-stats                       # SITE=c-town by default
SITE=area-256 npm run online-stats         # a specific site
EWGF_API_KEY=<key> npm run online-stats    # also gather group/player matches (c-town only, opt-in)
npm run resolve-id -- "3fee-J699-M7An"     # verify a tekken_id resolves on tknow
```

Output is written deterministically (recursively key-sorted, pretty-printed) and
each file is only rewritten when its data actually changed, so the commit-if-changed
gate in CI produces no-op-free history.

## Deployment

- `.github/workflows/online-stats.yml` — cron every 6h + manual dispatch. Loops
  over `sites/*/`, runs the pipeline per site, stages only generated JSON (never the
  hand-maintained `players.json`), and commits/pushes only if changed. That push to
  `main` triggers the deploy.
- `.github/workflows/deploy.yml` — on push to `main` touching app/data/config, runs
  `npm test && npm run build` and publishes `dist/` to Pages. Set the Pages source to
  "GitHub Actions". Vite `base` is `/<PAGES_REPO>/<slug>/`; routing uses `HashRouter`
  so deep links survive a refresh.

## Human action items (not code)

1. **Roster** — add crew members by hand-editing `sites/<slug>/data/players.json`.
   Each member's `tekken_id` is the id in their `tknow.gg/player/<id>` URL;
   `resolve-id` verifies it before you commit. A player without a `tekken_id` shows
   in the roster but has no ranks/MMR/matches. `main_character` may be a slug or
   `null` (then the UI derives their highest-ranked character as their main).
   Optional `avatar` is a path under `public/` (e.g. `"avatars/nick.png"`); without
   it the UI uses the character portrait, then a colored initial.
2. **`EWGF_API_KEY`** *(optional)* — only needed for a site with
   `headToHead.enabled: true`. Get a free key from ewgf.gg (account → API) and add
   it as a repository Actions secret. Without it, everything else still works; that
   site just gathers no custom-lobby matches. See
   [`spec/08`](./spec/08-ewgf-group-player-matches.md).
</content>
</invoke>
