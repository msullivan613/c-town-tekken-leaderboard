# 4. Match pipeline (EWGF battles → matches + stats)

**Goal:** with no manual entry, gather each tracked player's recent online matches
from EWGF, write `matches.json`, then derive `stats.json` (head-to-head + usage).
This runs **inside the daily `online-stats` job** (§3) — the per-player
`GET /external/battles/{tekkenId}` call already returns the player's battles, so no
extra request or separate workflow is needed.

Entry points: `scripts/online-stats/matches.ts` (build) + `scripts/online-stats/stats.ts`
(derive), orchestrated by `scripts/online-stats/index.ts`.

> **📌 Decision — matches come from EWGF, not a spreadsheet.** The crew never
> hand-logs results. Each `EwgfBattle` (verified live, [§7.2](./07-external-api-reference.md#72-ewgf--recent-battles-drives-ranks--matches))
> is one match to 3 rounds and carries both sides' `name`/`tekken_id`/`char`/`dan_rank`,
> `p1_rounds_won`/`p2_rounds_won`, `winner`, `battle_type`, and an ISO `battle_at`.
> This supersedes the earlier Google-Sheet design.

## 4.1 What we gather

- **Crew-vs-crew** matches (both `polarisId`s resolve to roster players) → the
  head-to-head / rivalry feature. **Kept forever.**
- **Non-crew** matches (a tracked player vs a random) → the recent-activity feed and
  per-player recent form. **Kept as a rolling window.**

Since we only fetch tracked players' battles, every battle has ≥ 1 crew side.

## 4.2 Building `matches.json` (`scripts/online-stats/matches.ts`)

`buildMatches(battles, players, priorMatches, config, now) → { matches, crewMatchCount, feedMatchCount }`:

1. **Roster join.** `tekken_id` → roster `id` via an **undashed** map (strip `-` on
   both sides, §7.1; the API's ids are already undashed). A side is crew iff it resolves.
2. **Field mapping.** `p{1,2}_char` (name) → slug via `canonicalizeCharacter()`
   ([§7.6](./07-external-api-reference.md#76-character-list--display-names-ewgf-public-api--wavu-agree));
   `dan_rank` (name) → rank slug via `rankFromName()` (§7.5); `battle_at` is already
   ISO → `playedAt`; `battle_type` string enum → slug.
3. **Dedup.** Synthetic `id = ${p1_tekken_id}:${p2_tekken_id}:${epochSeconds}`. A
   crew-vs-crew battle appears in *both* players' feeds with identical orientation →
   same id → one match. Fresh data is **merged** with `priorMatches` (append-only crew
   history).
4. **Retention.** Keep every crew match; drop non-crew matches older than
   `config.matches.recentWindowDays` and cap each player's non-crew matches at
   `config.matches.feedMaxPerPlayer`. Sort by `playedAt`.

## 4.3 Deriving `stats.json` (`scripts/online-stats/stats.ts`)

Pure `deriveStats(matches, generatedAt): StatsFile`, unit-tested:

- `headToHead` (crew only), key `idA|idB` (idA<idB): **matches won** (`matchesA/B`)
  and rounds won (`roundsA/B`).
- `players[id]` over all tracked matches: `matchWins`/`matchLosses`/`winRate`,
  `charUsage` (matches played per character), `mostPlayedCharacter`.
- `charMatchups` (crew), per `id:char` pair, by matches won.

## 4.4 Degradation & writing

`matches.json`/`stats.json` are (re)built only when `EWGF_API_KEY` is present (matches
come solely from EWGF). If the key is absent, the job keeps yesterday's committed
matches — same graceful posture as ranks (§3.2). Both files are written
deterministically and staged by `online-stats.yml` under the commit-if-changed gate.

## 4.5 Recent-matches feed

The site sorts `matches.json` by `playedAt` and slices the most recent N for the
home-page feed (crew + non-crew). Opponents without a `playerId` render by EWGF name.
