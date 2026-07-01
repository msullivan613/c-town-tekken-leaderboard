# C-Town Tekken Leaderboard — Implementation Spec

This directory turns [`PROJECT-BRIEF.md`](../PROJECT-BRIEF.md) into a buildable
specification. The brief captures the *goal* and *features*; these docs capture
the *how* — schemas, contracts, pipelines, and component design — and **resolve
the open design questions** from brief §7 with concrete defaults.

## Spec files

| # | File | Covers |
|---|------|--------|
| 1 | [`01-architecture.md`](./01-architecture.md) | System overview, tech stack, repo layout, deploy model |
| 2 | [`02-data-schemas.md`](./02-data-schemas.md) | Every JSON file: schema, example, invariants + shared TS types |
| 3 | [`03-online-stats-pipeline.md`](./03-online-stats-pipeline.md) | Daily EWGF + Wavu Wank job → ranks/glicko/history JSON |
| 4 | [`04-match-pipeline.md`](./04-match-pipeline.md) | Google Sheet → `matches.json` + derived `stats.json` |
| 5 | [`05-frontend.md`](./05-frontend.md) | React/Vite app: routes, views, components, data loading |
| 6 | [`06-decisions-and-open-questions.md`](./06-decisions-and-open-questions.md) | Decision log resolving brief §7; what's still genuinely TBD |
| 7 | [`07-external-api-reference.md`](./07-external-api-reference.md) | **Verified** EWGF + Wavu contracts, rank/character maps, scrape DOM (supersedes the ⚠️ placeholders) |

## How to read this

- **Decisions** made in this spec are marked with a **📌 Decision** callout and
  recorded in the log in file 6. They resolve brief §7 with sensible v1 defaults;
  nothing here is irreversible.
- **Config-driven** values (thresholds, cron cadence, sheet URL) live in a single
  [`config`](./01-architecture.md#configuration) so they can change without code edits.
- The EWGF / Wavu response shapes, rank/character maps, and scrape DOM have now been
  **verified against the live services** — see [`07-external-api-reference.md`](./07-external-api-reference.md),
  which supersedes the earlier ⚠️ placeholders. The one unresolved external
  dependency is obtaining an **`EWGF_API_KEY`** (EWGF's API is gated); the system
  degrades to MMR-only without it.

## Guiding constraints (from the brief, non-negotiable for v1)

- **$0 running cost** — static hosting (GitHub Pages) + GitHub Actions only. No
  server, no database, no paid API tier.
- **Self-updating** — data refreshes on a schedule; no manual babysitting.
- **JSON is the database** — the site reads committed JSON at runtime; nothing else.
- **Crew-first, no auth** — closed roster, no accounts, no write-back from the browser.
- **(player, character) pair is the unit** — see brief §5 core concept; the data
  model is keyed on it end to end.
