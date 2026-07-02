# Tekken Leaderboard — Implementation Spec

This directory turns [`PROJECT-BRIEF.md`](../PROJECT-BRIEF.md) into a buildable
specification. The brief captures the *goal* and *features*; these docs capture
the *how* — schemas, contracts, pipelines, and component design.

> **⚠️ Read this first.** The brief and the earliest spec drafts described an
> **EWGF-primary, single-site, `public/data/`** design. The project since moved to:
> **tknow.gg** as the primary source (in-game rank + quick/ranked matches, no API
> key), **Wavu Wank** for MMR, and **ewgf.gg** for group/player custom-lobby matches
> only (opt-in per site); plus a **multi-site** layout with data under
> `sites/<slug>/data/`. These docs have been reconciled with the code, but where any
> doubt remains, **the code is ground truth** — [`CLAUDE.md`](../CLAUDE.md) has the
> current orientation.

## Spec files

| # | File | Covers |
|---|------|--------|
| 1 | [`01-architecture.md`](./01-architecture.md) | System overview, multi-site model, tech stack, repo layout, config layering, deploy |
| 2 | [`02-data-schemas.md`](./02-data-schemas.md) | Every JSON file: schema, example, invariants + shared TS types |
| 3 | [`03-online-stats-pipeline.md`](./03-online-stats-pipeline.md) | The refresh job: tknow + Wavu (+ ewgf) → ranks/glicko/history JSON |
| 4 | [`04-match-pipeline.md`](./04-match-pipeline.md) | tknow (+ ewgf) battles → `matches.json` + derived `stats.json`, with cold-storage archives |
| 5 | [`05-frontend.md`](./05-frontend.md) | React/Vite app: routes, views, components, lazy data loading |
| 6 | [`06-decisions-and-open-questions.md`](./06-decisions-and-open-questions.md) | Decision log resolving brief §7; what evolved after research |
| 7 | [`07-external-api-reference.md`](./07-external-api-reference.md) | **Verified** tknow + Wavu (+ historical EWGF) contracts, rank/character maps, scrape DOM |
| 8 | [`08-ewgf-group-player-matches.md`](./08-ewgf-group-player-matches.md) | Group/player (custom-lobby) matches via ewgf.gg — the current, accurate H2H source |

## How to read this

- **Decisions** are marked with a **📌 Decision** callout and logged in file 6.
  Where research changed one, the callout notes the revision.
- **Config-driven** values (thresholds, cron cadence, match/history retention,
  per-site H2H toggle) live in [`config`](./01-architecture.md#14-configuration) so
  they change without code edits. Config is **layered**: `config/config.json`
  (shared) + `sites/<slug>/config.json` (branding + overrides).
- The tknow / Wavu / ewgf response shapes, rank/character maps, and Wavu DOM are
  **verified against the live services** — see [`07-external-api-reference.md`](./07-external-api-reference.md).

## Guiding constraints (from the brief, non-negotiable)

- **$0 running cost** — static hosting (GitHub Pages) + GitHub Actions only. No
  server, no database. Every data source is free (tknow/Wavu need no key; ewgf's
  free tier suffices for the one opted-in site).
- **Self-updating** — data refreshes on a schedule; no manual babysitting.
- **JSON is the database** — the site reads committed JSON at runtime; nothing else.
- **Crew-first, no auth** — closed roster, no accounts, no write-back from the browser.
- **(player, character) pair is the unit** — see brief §5 core concept; the data
  model is keyed on it end to end.
</content>
