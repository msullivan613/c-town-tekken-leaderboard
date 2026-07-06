# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A free, serverless, self-updating Tekken 8 leaderboard. A static React + Vite SPA on
GitHub Pages; committed JSON files are the only "database." A scheduled GitHub Action
refreshes the JSON. There is no backend, no runtime API call from the browser, no auth.

## Commands

```bash
npm install
npm run dev              # dev server for the default site (SITE=c-town)
npm run build            # tsc --noEmit, then scripts/build-all.ts (builds every site)
npm test                 # vitest run (pipeline math + committed-data validation)
npm run test:watch
npm run lint             # eslint . --ext .ts,.tsx
npm run format           # prettier --write .

# Run one test file:
npx vitest run tests/matches.test.ts

# Work against a specific site (default is c-town):
SITE=area-256 npm run dev
SITE=area-256 npx vitest run tests/data-files.test.ts

# Pipelines (write into sites/<SITE>/data/):
npm run online-stats                       # SITE=c-town by default
SITE=area-256 npm run online-stats
npm run resolve-id -- "3fee-J699-M7An"     # verify a tekken_id resolves on tknow
```

## Docs status — code is still ground truth

`spec/` and `README.md` were reconciled with the current design in issue #4, so they
now describe the real system. **`PROJECT-BRIEF.md` is intentionally left as a historical
concept record** (it still shows the original EWGF + Google-Sheet single-site idea) — do
not treat it as current. When any doc and the code disagree, the code is correct. The two
biggest evolutions the brief predates (see `spec/06`):

1. **Data source is tknow.gg, not EWGF.** The pipeline uses `scripts/online-stats/tknow.ts`
   (unofficial JSON API at `api.tk8now.pe.kr`, gated by an Origin/Referer check, **no API
   key**) for in-game ranks and quick/ranked match history, plus Wavu Wank for Glicko MMR.
   `scripts/online-stats/ewgf.ts` **does** exist, but only for **opt-in group/player
   (custom-lobby) matches** (issue #3) — see below — not as the primary rank/match source.
2. **Multi-site.** Data lives in `sites/<slug>/data/*.json`, **not** `public/data/`. There
   are currently two sites: `c-town` and `area-256`. `public/` holds only shared static
   assets (character icons, avatars). If an old comment says "public/data/", read
   "sites/<SITE>/data/".

## Architecture

### Multi-site model

One codebase (`src/`) renders N independently-deployed sites. A build produces
`dist/<slug>/` per site plus a root `dist/index.html` linking to them all.

- **`SITE` env var** (default `c-town`) selects the active site everywhere: `vite.config.ts`,
  `vitest.config.ts`, `scripts/shared/config.ts`, and `scripts/build-all.ts` all read it.
- Each `sites/<slug>/` has a `config.json` (site branding + optional config overrides) and a
  `data/` folder (the per-site JSON database).
- **Config layering:** `config/config.json` holds shared defaults; `sites/<slug>/config.json`
  supplies the `site` block and any overrides. `src/lib/config-merge.ts#mergeAppConfig`
  deep-merges them (override wins, arrays replace). **Neither file alone satisfies `AppConfig`
  — only the merged result does.** The frontend imports config as a module (baked into the
  bundle at build time); pipelines load it from disk at runtime via `loadConfig()`.
- The `@site-config` import alias resolves to the SITE-selected `sites/<slug>/config.json`
  (aliased in both `vite.config.ts` and `vitest.config.ts`). `@` aliases `src/`.
- `vite.config.ts` sets `base` to `/<PAGES_REPO>/<SITE>/` and copies `sites/<SITE>/data/` into
  `dist/<SITE>/data/` at build; in dev, a middleware serves `.../data/<file>` straight from
  `sites/<SITE>/data/`. The app fetches data via `import.meta.env.BASE_URL`.

### Shared types & data modules (app ↔ pipeline)

Everything is TypeScript (strict). Pipeline scripts run under `tsx` and import the **same**
`@/` modules the frontend uses — e.g. `tknow.ts` imports `@/data/characters` and
`@/data/ranks`, and both sides share `@/types/domain.ts` and `@/types/data-files.ts`. A schema
change is therefore a compile error in both places at once. Keep types in `src/types/` and
canonical character/rank tables in `src/data/`.

### Data pipeline (`scripts/online-stats/index.ts`)

Daily-ish job (cron every 6h), run once per site. For each roster player with a `tekken_id`:
fetch tknow player info (per-character dan rank + games) and match history, and Wavu Glicko
MMR per character. It then:

- Keys everything by **(player, character) pair** (`makePairId`). Pairs only appear once they
  clear `config.pairThreshold` (min ranked games + optionally a non-null rank).
- Writes `ranks.json`, `glicko.json`; **appends** today's point to `rankhistory.json` /
  `mmrhistory.json` (idempotent per date); rebuilds `matches.json` + derived `stats.json`.
- **History is bounded (issue #10, `scripts/online-stats/history.ts`).** The live
  `rankhistory.json` / `mmrhistory.json` keep only the last `config.history.maxDaysInline`
  days; older points roll into per-year archives `rankhistory.<year>.json` /
  `mmrhistory.<year>.json` (cold storage — the frontend charts load only the live file).
  History files are written with `writeDataFile(..., { inlineArrays: true })` so each
  `[date, value]` tuple is one line (~5–6× smaller than the default pretty-print) while
  the surrounding structure stays readable. Archives only appear once data exceeds the
  window (≈2yr at the default 730), so today there are none.
- **Matches are gathered automatically from tknow battles** — no manual entry, no Google
  Sheet (the sheet in the brief was never built). Matches accumulate append-only; known
  battle ids are fed back so the fetch stops early at already-seen battles.
- **`matches.json` is a bounded recent feed; pruned matches are archived, not dropped
  (issues #19/#30, mirrors #10/#17).** Both crew (both-sides-roster) and non-crew "feed"
  matches are bounded by `config.matches.recentWindowDays`; non-crew matches are
  additionally capped per player by `feedMaxPerPlayer`. Matches pruned out of that window
  roll into per-year cold-storage archives `matches.<year>.json` (`buildMatches` returns
  them as `archived`; the caller merges them in by id via `mergeMatches`) instead of being
  discarded. Archives are build-time only — the frontend never downloads them. `deriveStats`
  runs over the **full** set (live feed + all archives, deduped by id) so head-to-head and
  per-player rollups aren't limited to the recent window — head-to-head totals survive crew
  matches aging out. An archive is only rewritten when it actually gains matches, so the
  commit-if-changed gate holds. Archives only appear once matches age past the window, so
  today there are none.
- **Group/player (custom-lobby) matches come from ewgf, opt-in per site** (`scripts/online-stats/ewgf.ts`,
  issue #3). tknow only surfaces quick/ranked, so the crew-vs-crew lobby matches are pulled
  from ewgf.gg's public API (`GET /external/battles/{id}`, `Authorization: Bearer <EWGF_API_KEY>`).
  Gated by **`config.headToHead.enabled` (per-site) AND `EWGF_API_KEY`** (a GitHub Actions secret) —
  ewgf's free tier is ~100 req/day and the job spends 1 req/player/run, so only opted-in sites query
  it (currently c-town; area-256 off). Disabled ⇒ that site never touches ewgf and hides the h2h
  page/nav + profile h2h section. With the gate off the pipeline is byte-identical to before. ewgf
  battles carry no id, so a deterministic `ewgf:`-prefixed id is
  synthesized (canonical orientation + timestamp) for cross-feed/run dedup. Only group/player are
  taken from ewgf — quick/ranked stay with tknow (real battle ids, no 50-match cap). Both feed into
  the same `buildMatches`. Free tier = 50 most-recent battles/player, ~24h staleness lag, sliding
  window (6h cron + append-only captures all but extreme grinders). See
  [`spec/08`](./spec/08-ewgf-group-player-matches.md).
- **Graceful degradation:** if tknow is wholly unreachable, it keeps yesterday's committed
  ranks/matches/stats rather than clobbering them with empties (Wavu still updates MMR). Matches
  rebuild when _either_ tknow or ewgf was reachable; a source being down preserves its
  previously-committed matches (buildMatches merges fresh battles onto priorMatches by id).

### Determinism / commit-if-changed

`scripts/shared/atomicWrite.ts` recursively **sorts object keys** and pretty-prints (2-space)
so re-runs are byte-identical and `git` only sees real data changes. `writeDataFile` returns
`false` when nothing changed. CI stages only generated files and commits only if the diff is
non-empty — so no-op runs produce no commits. **Preserve this determinism** when touching any
JSON-writing code; non-deterministic output breaks the whole no-op-commit gate.

### Frontend

`src/App.tsx` uses **HashRouter** (GitHub Pages has no server rewrites, so `/#/...` deep links
survive refresh — don't switch to BrowserRouter without adding the 404 redirect hack).
`src/data/DataProvider.tsx` fetches all JSON files via `useJson` and exposes them through
`useData()`. `players.json` is the only required file; the rest degrade to null/empty. The
(player, character) collapse, sorting, and best-pair logic live in `src/lib/leaderboard.ts`.

### CI (`.github/workflows/`)

- `online-stats.yml` — cron every 6h + manual dispatch. Loops `for dir in sites/*/`, runs the
  pipeline per site, stages only generated JSON (never the hand-maintained `players.json`),
  and commits/pushes only if changed. That push to `main` then triggers deploy.
- `deploy.yml` — on push to `main` touching app/data/config, runs `npm test && npm run build`
  and publishes `dist/` to Pages. Set `PAGES_REPO` if the repo slug differs from
  `tekken-leaderboard` (it feeds Vite `base`).

## Conventions

- Add a crew member by hand-editing `sites/<slug>/data/players.json`. Their `tekken_id` is the
  id in their `tknow.gg/player/<id>` URL; use `resolve-id` to confirm it before committing.
- `main_character` may be set to a slug or left `null`. When `null`, the UI derives the player's
  "main" as their highest dan-ranked character from `ranks.json` (`resolveMainCharacters` in
  `src/lib/leaderboard.ts`, exposed via `useData().mainCharacterByPlayer`).
- Reference spec sections in code comments (`§3.4` etc.) as the existing code does — but the
  spec is a design record, not ground truth for the tknow/multi-site points above.
