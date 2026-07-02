# 2. Data schemas

Every file lives in **`sites/<slug>/data/`** (one database per site — §1.2). All
generated files share three conventions:

1. **Keyed by `(tekken_id, character)`.** The composite string
   `pairId = \`${tekken_id}:${character}\`` (`makePairId`) is the stable join key
   across ranks, glicko, and history. `character` is always the **canonical** slug (§2.1).
2. **Envelope, not bare array.** Each generated file is an object with a
   `generatedAt`/`updatedAt` ISO-8601 UTC timestamp plus `source`/`schemaVersion`
   metadata, so the UI can show "last updated" and we can migrate schemas safely.
3. **Deterministic serialization.** `atomicWrite.ts` recursively sorts object keys and
   pretty-prints (2-space) before writing, so diffs are minimal and `git` only sees
   real changes (enables the "commit only if changed" gate — §determinism).

`schemaVersion` is **`1`** for `players`, `ranks`, `glicko`, and the history files;
**`2`** for `matches` and `stats` (and the match archives), which changed shape after
the pipeline moved to tknow. Bump on breaking changes; the loader tolerates unknown
newer minor fields.

## 2.1 Canonical characters (`src/data/characters.ts`)

> **📌 Decision — the canonical key is the display name, with a `slug` for URLs.**
> tknow returns a numeric `char_id`; ewgf and Wavu return the **display name**
> (`"Devil Jin"`, `"Jack-8"`). Both resolve to the same canonical `CharacterSlug`:
> `fromCharacterId(id)` for tknow, `canonicalizeCharacter(name)` / `fromWavu(name)` /
> `fromEwgf(name)` for the name-based sources. The character-id table matches EWGF's
> (`+44 Armor King, 45 Miary Zo, 46 Kunimitsu`); see [§7.6](./07-external-api-reference.md#76-character-list--display-names-ewgf-public-api--wavu-agree).
> An unrecognized name/id is logged and skipped (never silently mis-joined) — this
> includes tknow's reserved ids for unreleased characters.

## 2.2 Tekken 8 rank ladder (`src/data/ranks.ts`)

Tekken's in-game rank is an ordered tier. We store it as a canonical slug plus an
integer `tier` for sorting; display name, color, and icon are UI concerns.

```ts
export interface RankTier {
  slug: string;        // "tekken_god_supreme"
  display: string;     // "Tekken God Supreme"
  tier: number;        // 0-based ordinal, higher = better
  colorVar: string;    // CSS custom property token, e.g. "--rank-god"
  icon: string;        // asset path
}
export const RANK_LADDER: RankTier[];          // ordered low → high
export function rankByTier(tier: number): RankTier | null;
export function rankBySlug(slug: string): RankTier | null;
export function rankFromDanRank(dan: number): { slug; tier } | null;  // tknow integer ladder
export function rankFromName(name: string): { slug; tier } | null;    // ewgf/Wavu display names
```

> **📌 Decision — store the rank *slug* + our own `tier` ordinal.** tknow's
> `current_rank` is the same integer ladder EWGF documents (`rankOrderMap`, [§7.5](./07-external-api-reference.md#75-rank-ladder--verified-rankordermap-from-ewgf-frontend)):
> `27 = Tekken God`, `31 = God of Destruction II`, etc. `rankFromDanRank` maps the
> integer; `rankFromName` reverse-maps the display-name form (ewgf/Wavu). Two encodings
> of "God of Destruction …" (`29..37` and `100..107`/`765`) are normalized onto one
> ordering. `RANK_LADDER` is generated from that map.

## 2.3 `players.json` — roster (hand-maintained), schemaVersion 1

Player-level identity only. Characters are **not** enumerated here; they're
auto-discovered by the pipeline (brief §5 core concept).

```jsonc
{
  "schemaVersion": 1,
  "players": [
    {
      "id": "matt",                 // stable internal slug, used in URLs + join key
      "tekken_id": "3fee-J699-M7An",// dashed Tekken/Polaris id (§7.1); null if unknown
      "player_tag": "SugarFree",    // display name
      "platform": "steam",          // "steam" | "playstation" | "xbox"
      "main_character": "jin",      // CharacterSlug, or null → derive from ranks (§conventions)
      "peak_rank": null,            // rank slug override/fallback, or null → derive (§2.4)
      "avatar": "avatars/matt.png"  // optional; path under public/
    }
  ]
}
```

**Invariants**

- `id` is unique, URL-safe, and **immutable** (the profile URL and the join key).
- `tekken_id` may be `null` for a player not yet resolved — they show in the
  roster/profiles but have no ranks/MMR/matches until an id is filled in. Confirm an
  id with `resolve-id` before committing.
- `main_character: null` ⇒ the UI derives the "main" as the player's highest
  dan-ranked character from `ranks.json` (`resolveMainCharacters`).
- `peak_rank: null` ⇒ "derive it" (§2.4). A non-null value is a hand-set fallback.

> **📌 Decision — `id` (internal slug) is the canonical player key everywhere;
> `player_tag` is display-only.** The pipeline resolves a battle's `polarisId` → `id`
> (§4.2), so nothing downstream depends on a tag that can be renamed.

## 2.4 `ranks.json` — current in-game rank (generated, tknow, schemaVersion 1)

One row per qualifying `(player, character)` pair.

```jsonc
{
  "schemaVersion": 1,
  "source": "tknow",
  "generatedAt": "2026-06-30T08:00:12Z",
  "pairs": [
    {
      "pairId": "3feeJ699M7An:jin",
      "playerId": "matt",
      "tekken_id": "3feeJ699M7An",
      "character": "jin",
      "rank": "tekken_god",       // rank slug (§2.2), or null if unranked
      "rankTier": 27,             // ordinal cache for sorting; null if unranked
      "rankedGames": 1432,        // LIFETIME ranked games (tknow total_games)
      "region": "Americas",       // from region_id; may be null
      "characterPeakRank": "tekken_god_supreme", // running max we accumulate, or null
      "lastSeen": "2026-06-29T21:14:00Z"          // tknow latest_at, or null
    }
  ]
}
```

**Field sources** (verified, [§7.9](./07-external-api-reference.md#79-tknowgg--the-live-source-for-ranks--matches-verified-2026-07-01)):
from tknow `GET /player/info/{polarisId}` → `current_ranks[]`. `rank`/`rankTier` =
`rankFromDanRank(current_rank)`; `rankedGames` = `total_games` (**lifetime**, unlike
EWGF's old windowed count); `region` = `region_id` name; `lastSeen` = `latest_at`.

**Threshold** (config §1.4): a pair is written only if `rankedGames >= minRankedGames`
**and** (`requireAssignedRank` ⇒ `rank != null`). The threshold games count is
`max(tknow rankedGames, Wavu games)`, so an established player is kept on the board
even if one source is thin. Pairs below threshold are dropped, not zeroed.

**Peak rank derivation:** no source exposes an all-time per-character peak, so
`characterPeakRank` is **accumulated by us** as the running max of `rankTier` observed
across daily snapshots. A player's displayed `peak_rank` = max over their pairs, with
the hand-set `players.json` value as the floor/fallback. Peak is tracked **per pair**
and **rolled up per player** in the UI.

## 2.5 `glicko.json` — current MMR (generated, Wavu Wank, schemaVersion 1)

Fields verified against the Wavu profile HTML — see
[§7.3](./07-external-api-reference.md#73-wavu-wank--glicko-2-mmr-μ--σ2). Wavu
publishes **μ** (rating) and **σ²** (rating *variance*, not RD), and buckets each
character into confidence groups itself.

```jsonc
{
  "schemaVersion": 1,
  "source": "wavu",
  "generatedAt": "2026-06-30T08:01:40Z",
  "pairs": [
    {
      "pairId": "3feeJ699M7An:jin",
      "playerId": "matt",
      "character": "jin",
      "rating": 1715,             // Wavu μ (Glicko rating / MMR), or null if no data
      "sigmaSquared": 68,         // Wavu σ² (variance); null if unknown
      "confidence": "leaderboard", // "leaderboard" | "unqualified" | "provisional"
      "provisional": false,        // confidence === "provisional"
      "games": 559,                // Wavu games for this character
      "lastUpdated": "2026-06-20T00:00:00Z"  // from the per-char printDate() timestamp
    }
  ]
}
```

> **📌 Decision (§7.3):** the field is `sigmaSquared` (raw σ²), not `deviation`, and
> confidence comes from Wavu's own bucket, not an invented RD cutoff.
> `provisional = confidence === "provisional"` drives the UI's uncertain-rating
> styling. `rating: null` ⇒ the leaderboard/profile shows `—` for MMR without breaking
> the row.

## 2.6 `rankhistory.json` — append-only rank snapshots (tknow), schemaVersion 1

Compact, append-only. One entry per pair per day, stored as **per-pair series of
`[date, tier]` tuples**.

```jsonc
{
  "schemaVersion": 1,
  "source": "tknow",
  "updatedAt": "2026-06-30T08:00:12Z",
  "series": {
    "3feeJ699M7An:jin": {
      "playerId": "matt",
      "character": "jin",
      "points": [
        ["2026-06-28", 26],
        ["2026-06-29", 27],
        ["2026-06-30", 27]
      ]
    }
  }
}
```

**Append rule:** each run appends today's `[date, tier]` to each pair's series **only
if** the date isn't already present (idempotent re-runs). A day with no data for a pair
appends nothing (gaps allowed; the chart steps).

> **📌 Decision — history is bounded (issue #10, `scripts/online-stats/history.ts`).**
> The live file keeps only the last `history.maxDaysInline` days (default 730 ≈ 2yr);
> older points roll into per-year cold-storage archives `rankhistory.<year>.json`
> (the frontend charts load only the live file). History files are written with
> `{ inlineArrays: true }` so each `[date, value]` tuple is one line (~5–6× smaller)
> while the surrounding structure stays readable. Archives only appear once data
> exceeds the window, so today there are none.

## 2.7 `mmrhistory.json` — append-only MMR snapshots (Wavu), schemaVersion 1

Identical shape to §2.6 but `source: "wavu"` and the tuple value is the Glicko rating
(float): `["2026-06-30", 1875.4]`. Bounded/archived the same way
(`mmrhistory.<year>.json`).

This is the **headline visualization** (brief §5.5): a line chart of each pair's rating
trajectory; a profile overlays a player's characters on one chart.

## 2.8 `matches.json` — gathered from battles (generated, §4), schemaVersion 2

One object per **battle** (= one online match to 3 rounds). Matches are harvested
automatically — no manual entry. Each side is a structured object so a **non-crew
opponent** is first-class; `playerId` is set only for tracked crew.

```jsonc
{
  "schemaVersion": 2,
  // Which providers fed this file: tknow (quick/ranked) always; "tknow+ewgf" when a
  // site has H2H enabled and EWGF_API_KEY is set (ewgf adds group/player).
  "source": "tknow+ewgf",
  "generatedAt": "2026-06-30T08:00:00Z",
  "crewMatchCount": 4,              // both sides are roster players (head-to-head)
  "feedMatchCount": 3,              // exactly one crew side (activity feed)
  "matches": [
    {
      "id": "0x1a2b3c4d5e6f",       // tknow battle_id (globally unique) OR "ewgf:lo-hi:epoch" (§8)
      "playedAt": "2026-06-29T21:30:00Z",
      "battleType": "ranked",        // "quick" | "ranked" | "player" | "group" | null
      "a": {
        "playerId": "matt",          // roster id iff a tracked crew member, else null
        "name": "SugarFree",
        "polarisId": "3feeJ699M7An",
        "character": "jin",          // CharacterSlug, or null
        "rank": "tekken_god"         // rank slug, or null
      },
      "b": { "playerId": "nick", "name": "NickTheKnife", "polarisId": "2b3c4d5e6f70",
             "character": "kazuya", "rank": "tekken_king" },
      "roundsA": 3, "roundsB": 1,
      "winner": "a",
      "crew": true                   // both sides are roster players
    }
  ]
}
```

**Invariants**

- Every match has **≥ 1 crew side** (we only fetch tracked players' battles).
- **`id` dedups a battle seen from both feeds.** For tknow it's the real
  `battle_id`; for ewgf (which carries no id) it's a deterministic
  `ewgf:{loPolaris}-{hiPolaris}:{epochSeconds}` in canonical orientation (§8). Both
  are orientation-independent, so a crew-vs-crew battle in *both* players' feeds
  collapses to one match.
- **Retention (issue #19).** Crew matches (both sides roster) stay in the live feed
  **forever**. Non-crew "feed" matches are bounded by `matches.recentWindowDays` +
  `feedMaxPerPlayer`; those pruned out of the window roll into cold-storage archives
  (§2.8.1) rather than being dropped.

### 2.8.1 `matches.<year>.json` — cold-storage archive, schemaVersion 2

Feed matches pruned out of the live window are appended (by id) to per-year archives.
Build-time only: the pipeline reads them so `stats.json` spans the full dataset, but
the **frontend never downloads them**. An archive is only rewritten when it actually
gains matches (preserving the commit-if-changed gate), so today there are none.

```jsonc
{ "schemaVersion": 2, "year": "2026", "generatedAt": "…", "matches": [ /* Match[] */ ] }
```

## 2.9 `stats.json` — derived head-to-head + usage (generated), schemaVersion 2

Computed from the **full** match set (live feed + crew + all archives, deduped by id),
so per-player rollups aren't limited to the recent window. **Head-to-head is
crew-vs-crew, counted by matches won** (each battle = one match); rounds kept for
drill-down.

```jsonc
{
  "schemaVersion": 2,
  "generatedAt": "2026-06-30T08:00:00Z",
  "basedOnMatchCount": 7,

  // person-vs-person record (crew only). Key "idA|idB" with idA < idB.
  "headToHead": {
    "matt|nick": { "matchesA": 1, "matchesB": 1, "roundsA": 5, "roundsB": 4 }
  },

  // per-player rollups over ALL tracked matches (crew + feed + archives)
  "players": {
    "matt": {
      "totalMatches": 4, "matchWins": 3, "matchLosses": 1, "winRate": 0.75,
      "charUsage": { "jin": 3, "devil_jin": 1 },
      "mostPlayedCharacter": "jin"
    }
  },

  // per-character matchup breakdown (crew), matches won. Key "idA:charA|idB:charB".
  "charMatchups": {
    "matt:jin|nick:kazuya": { "matchesA": 1, "matchesB": 1 }
  }
}
```

> **📌 Decision — H2H is person-vs-person by matches won; per-character matchups are
> also computed (`charMatchups`).** Note the crew-vs-crew caveat: H2H only populates
> when two roster members actually meet — in tknow that's ranked/quick matchmaking; the
> deliberate custom-lobby crew sets come from ewgf (§8), which is why H2H is gated on it.

## 2.10 Shared TypeScript types

All of the above are declared once in `src/types/data-files.ts` (with core domain
types in `src/types/domain.ts`) and imported by both the app and the pipeline scripts
(§1.3). Example:

```ts
export interface RanksFile {
  schemaVersion: 1;
  source: 'tknow';
  generatedAt: string;              // ISO-8601 UTC
  pairs: RankPair[];
}
export interface RankPair {
  pairId: string;                   // `${tekken_id}:${character}`
  playerId: string;
  tekken_id: string;
  character: CharacterSlug;
  rank: string | null;              // rank slug
  rankTier: number | null;
  rankedGames: number;
  region: string | null;
  characterPeakRank: string | null;
  lastSeen: string | null;
}
// …GlickoFile, HistoryFile, MatchesFile, MatchArchiveFile, StatsFile, PlayersFile, AppConfig…
```

`tests/data-files.test.ts` validates each committed `sites/<SITE>/data/*.json` against
these types so a malformed pipeline output fails CI before it can break the site.
</content>
