# C-Town Tekken Leaderboard

A free, serverless, self-updating Tekken 8 scoreboard for the crew. Static
React + Vite app on GitHub Pages; committed JSON under `public/data/` is the only
"database." A scheduled GitHub Action refreshes it. Built to the spec in
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
| `scripts/online-stats/` | daily job: one EWGF call per player → in-game rank + Wavu MMR (`ranks/glicko/*history.json`) **and** matches from EWGF battles (`matches.json` + derived `stats.json`) |
| `src/` | the React app (leaderboard, profiles, head-to-head, matches) |
| `config/config.json` | all tunables (thresholds, cron, match retention) — read by both app and pipelines |

Matches are **gathered automatically** from EWGF's battle data (no manual entry):
crew-vs-crew games power head-to-head, and each player's recent games vs anyone
power the activity feed.

Data flow and every schema are documented in [`spec/`](./spec) — start with
[`spec/01-architecture.md`](./spec/01-architecture.md).

## Running the pipelines locally

```bash
EWGF_API_KEY=<key> npm run online-stats       # ranks + MMR + history + matches + stats
EWGF_API_KEY=<key> npm run resolve-id -- "3fee-J699-M7An"  # verify a tekken_id resolves
```

The job writes deterministically and only changes files when the data actually
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
   for in-game rank and sorts by MMR, and no matches/head-to-head are gathered
   (matches come from EWGF battles). See [`spec/07`](./spec/07-external-api-reference.md#74-ewgf-api-key-decision-resolves-the-biggest-open-risk).
2. **Roster** — add crew members to `public/data/players.json`. Each member's
   `tekken_id` is the id in their ewgf.gg profile URL
   (`https://ewgf.gg/player/<tekken_id>`); `resolve-id` verifies it resolves. A
   player without a `tekken_id` shows in the roster but has no
   ranks/MMR/matches. Optional per-player `avatar` (a path
   under `public/`, e.g. `"avatars/nick.svg"`) overrides the default
   main-character portrait shown next to their name; without it the UI uses
   the character portrait, then a colored initial.

## Status

The current `public/data/*.json` are **fixtures** (four sample players) so the
app renders against real shapes. The first real pipeline runs replace them.
