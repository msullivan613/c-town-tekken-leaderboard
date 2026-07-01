# C-Town Tekken Leaderboard

A free, serverless, self-updating Tekken 8 scoreboard for the crew. Static
React + Vite app on GitHub Pages; committed JSON under `public/data/` is the only
"database." Two scheduled GitHub Actions refresh it. Built to the spec in
[`spec/`](./spec).

## Quick start

```bash
npm install
npm run dev          # local dev server (reads public/data/*.json fixtures)
npm run build        # typecheck + production build → dist/
npm test             # vitest (pipeline math + committed-data validation)
npm run lint
```

## How it works

| Piece | What |
|---|---|
| `public/data/*.json` | the database — roster + generated stats, keyed per `(player, character)` pair |
| `scripts/online-stats/` | daily job: EWGF in-game rank + Wavu Glicko MMR → `ranks/glicko/*history.json` |
| `scripts/match-sync/` | 6-hourly job: Google Sheet of set scores → `matches.json` + derived `stats.json` |
| `src/` | the React app (leaderboard, profiles, head-to-head, matches) |
| `config/config.json` | all tunables (thresholds, cron, sheet URL) — read by both app and pipelines |

Data flow and every schema are documented in [`spec/`](./spec) — start with
[`spec/01-architecture.md`](./spec/01-architecture.md).

## Running the pipelines locally

```bash
EWGF_API_KEY=<key> npm run online-stats   # writes ranks/glicko/history JSON
npm run match-sync                         # needs config.sheet.csvUrl set
npm run resolve-id -- "SomeTag"            # look up a player's tekken_id (EWGF search)
```

Both jobs write deterministically and only change files when the data actually
changed, so the commit-if-changed gate in CI produces no-op-free history.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main` that touches app/data/config. Set the Pages source to
"GitHub Actions" in repo settings. Vite `base` is `/c-town-tekken-leaderboard/`;
routing uses `HashRouter` so deep links survive a refresh.

## Human action items (not code)

These are the only things the code can't do for itself:

1. **`EWGF_API_KEY`** — EWGF's API is fully gated (every endpoint 401s). Add a
   read key as a repository Actions secret. Without it the online-stats job
   degrades gracefully to **MMR-only** (Wavu needs no key); the board shows `—`
   for in-game rank and sorts by MMR. See [`spec/07`](./spec/07-external-api-reference.md#74-ewgf-api-key-decision-resolves-the-biggest-open-risk).
2. **`config.sheet.csvUrl`** — publish the crew's matches tab (Sheets →
   File → Share → Publish to web → CSV) and paste the URL into
   `config/config.json`. Until it's set, `match-sync` no-ops.
3. **Roster** — add crew members to `public/data/players.json` (use
   `resolve-id` to fill `tekken_id`). Optional per-player `avatar` (a path
   under `public/`, e.g. `"avatars/nick.svg"`) overrides the default
   main-character portrait shown next to their name; without it the UI uses
   the character portrait, then a colored initial.

## Status

The current `public/data/*.json` are **fixtures** (four sample players) so the
app renders against real shapes. The first real pipeline runs replace them.
