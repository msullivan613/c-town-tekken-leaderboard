# 4. Match pipeline (tknow + ewgf battles → matches + stats)

**Goal:** with no manual entry, gather each tracked player's online matches, write
`matches.json` (a bounded recent feed of crew + non-crew matches, with pruned matches
archived, not dropped), then derive `stats.json` (head-to-head + usage) over the full
dataset. This runs **inside the same `online-stats` job** (§3) — the per-player tknow
match fetch and the optional ewgf fetch already return the battles, so no separate
workflow is needed.

Entry points: `scripts/online-stats/matches.ts` (build/dedup/classify/retain/archive) +
`scripts/online-stats/stats.ts` (derive), orchestrated by `index.ts`.

> **📌 Decision — matches come from the APIs, not a spreadsheet.** The crew never
> hand-logs results. This supersedes the brief's Google-Sheet design. Two providers
> feed the _same_ `buildMatches`:
>
> - **tknow** — quick + ranked matchmaking, with real globally-unique `battle_id`s
>   (§7.9). No 50-match cap.
> - **ewgf** _(opt-in, §8)_ — group + player (custom-lobby) matches only, which tknow
>   doesn't surface. This is where crew members deliberately play each other, so it's
>   what actually powers head-to-head.

## 4.1 What we gather

- **Crew-vs-crew** matches (both `polarisId`s resolve to roster players) → the
  head-to-head / rivalry feature. **Kept as a rolling window**, then archived (§4.4,
  issue #30). Head-to-head totals survive aging because `stats.json` derives over the
  full retained set (live + archives), so nothing is lost from the aggregate.
- **Non-crew** matches (a tracked player vs a random) → the recent-activity feed and
  per-player recent form. **Kept as a rolling window** (with a per-player cap), then
  archived (§4.4).

Since we only fetch tracked players' battles, every battle has ≥ 1 crew side.

## 4.2 Building `matches.json` (`scripts/online-stats/matches.ts`)

`buildMatches(battles, players, priorMatches, config, now) → { matches, archived,
crewMatchCount, feedMatchCount }`:

1. **Roster join.** `polarisId` → roster `id` via an **undashed** map. A side is crew
   iff it resolves; otherwise it's a first-class external opponent (name only, no link).
2. **Field mapping.** character → slug (`fromCharacterId` for tknow, name-based for
   ewgf, §7.6); `dan_rank`/`current_rank` → rank slug; `battle_at` → ISO `playedAt`;
   `battle_type` → `MatchType` (`quick`/`ranked` from tknow, `player`/`group` from ewgf).
   Each battle is normalized to a canonical orientation (`p1.polarisId ≤ p2.polarisId`).
3. **Dedup.** By `id` — tknow's real `battle_id`, or ewgf's synthetic
   `ewgf:{lo}-{hi}:{epoch}` (§8). A crew-vs-crew battle in _both_ players' feeds, and
   the same battle re-fetched on later runs, collapse to one `Match`. Fresh battles are
   **merged onto** `priorMatches` by id (append-only history + incremental catch-up).
4. **Retention (issues #19, #30).** Both crew and non-crew matches are bounded by
   `matches.recentWindowDays`; non-crew "feed" matches are additionally capped per player
   by `feedMaxPerPlayer`. Matches pruned out of the live window are returned as `archived`
   (not discarded — §4.4). Sort by `playedAt`.

## 4.3 Deriving `stats.json` (`scripts/online-stats/stats.ts`)

Pure `deriveStats(matches, generatedAt): StatsFile`, unit-tested. **Run over the full
retained set** — live feed + crew + every `matches.<year>.json` archive, deduped by id —
so per-player rollups aren't limited to the recent window:

- `headToHead` (crew only), key `idA|idB` (idA<idB): **matches won** (`matchesA/B`) +
  rounds won (`roundsA/B`).
- `players[id]` over all tracked matches: `matchWins`/`matchLosses`/`winRate`,
  `charUsage`, `mostPlayedCharacter`.
- `charMatchups` (crew), per `id:char` pair, by matches won.

## 4.4 Archiving pruned matches (issues #19, #30)

Matches pruned out of the live window this run — crew and non-crew alike — roll into
per-year cold-storage archives `matches.<year>.json` (`buildMatches` returns them as
`archived`; the caller merges them into the right year's archive by id via
`mergeMatches`). These are **build-time only** — `deriveStats` reads them, but the
frontend never downloads them. An archive is only rewritten when it actually gains
matches, so the commit-if-changed gate holds and archives appear only once matches age
past the window (none today).

## 4.5 Degradation & writing

`matches.json`/`stats.json` are (re)built when **either** tknow or ewgf was reachable;
a source being down preserves its previously-committed matches (merge by id, §3.6). The
`source` field records which providers fed the file (`tknow`, `ewgf`, or `tknow+ewgf`).
Both files are written deterministically and staged by `online-stats.yml` under the
commit-if-changed gate.

## 4.6 Recent-matches feed & the H2H caveat

The site sorts `matches.json` by `playedAt` and slices the most recent N for the
home-page feed (crew + non-crew); external opponents render by name. **Head-to-head
only populates when two roster members actually meet.** In tknow that's
ranked/quick matchmaking; the intentional custom-lobby crew sets come from ewgf — which
is exactly why the H2H feature is gated on `headToHead.enabled` + `EWGF_API_KEY` (§8).
A site without ewgf shows 0 crew matches unless members happen to meet in matchmaking.
</content>
