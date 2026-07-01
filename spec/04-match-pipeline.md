# 4. Match pipeline (EWGF battles → matches + stats)

**Goal:** with no manual entry, gather each tracked player's recent online matches
from EWGF, write `matches.json`, then derive `stats.json` (head-to-head + usage).
This runs **inside the daily `online-stats` job** (§3) — the per-player
`GET /player-stats/{polarisId}` call already returns the player's `battles`, so no
extra request or separate workflow is needed.

Entry points: `scripts/online-stats/matches.ts` (build) + `scripts/online-stats/stats.ts`
(derive), orchestrated by `scripts/online-stats/index.ts`.

> **📌 Decision — matches come from EWGF, not a spreadsheet.** The crew never
> hand-logs results. Each `BattleDTO` (verified, [§7.2](./07-external-api-reference.md#72-ewgf--in-game-rank-winslosses-tekken-power))
> is one match to 3 rounds and carries both sides' name/polarisId/characterId/danRank,
> `player1RoundsWon`/`player2RoundsWon`, `winner`, `battleType`, and a UTC `date`
> string. This supersedes the earlier Google-Sheet design.

## 4.1 What we gather

- **Crew-vs-crew** matches (both `polarisId`s resolve to roster players) → the
  head-to-head / rivalry feature. **Kept forever.**
- **Non-crew** matches (a tracked player vs a random) → the recent-activity feed and
  per-player recent form. **Kept as a rolling window.**

Since we only fetch tracked players' battles, every battle has ≥ 1 crew side.

## 4.2 Building `matches.json` (`scripts/online-stats/matches.ts`)

`buildMatches(battles, players, priorMatches, config, now) → { matches, crewMatchCount, feedMatchCount }`:

1. **Roster join.** `polarisId` → roster `id` via an **undashed** `tekken_id` map
   (strip `-` on both sides, §7.1). A side is crew iff it resolves.
2. **Field mapping.** `characterId` (int) → slug via `characterIdMap` + `fromCharacterId()`
   ([§7.6](./07-external-api-reference.md#76-character-list--verified-characteridmap-ewgf-wavu-uses-same-names));
   `danRank` → rank slug via `rankFromDanRank()` (§7.5); `date`
   (`"MM/dd/yyyy HH:mm:ss UTC"`) → ISO `playedAt`; `battleType` int → slug.
3. **Dedup.** Synthetic `id = ${p1Polaris}:${p2Polaris}:${epochSeconds}`. A
   crew-vs-crew battle appears in *both* players' feeds → same id → one match.
   Fresh data is **merged** with `priorMatches` (append-only crew history).
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
