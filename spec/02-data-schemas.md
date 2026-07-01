# 2. Data schemas

Every file lives in `public/data/`. All generated files share three conventions:

1. **Keyed by `(tekken_id, character)`.** The composite string
   `pairId = \`${tekken_id}:${character}\`` is the stable join key across ranks,
   glicko, and history. `character` is always the **canonical** slug (§2.1).
2. **Envelope, not bare array.** Each generated file is an object with a
   `generatedAt` ISO-8601 UTC timestamp plus `source`/`schemaVersion` metadata, so
   the UI can show "last updated" (brief §5.1) and we can migrate schemas safely.
3. **Deterministic serialization.** Rows are sorted by a stable key and
   pretty-printed with 2-space indent before writing, so diffs are minimal and
   `git` only sees real changes (enables the "commit only if changed" gate).

`schemaVersion` starts at `1`. Bump on breaking changes; the loader tolerates
unknown newer minor fields.

## 2.1 Canonical characters (`src/data/characters.ts`)

> **📌 Decision (updated after research — see [§7.6](./07-external-api-reference.md#76-character-list--verified-characteridmap-ewgf-wavu-uses-same-names)).**
> Verified: **EWGF and Wavu use the same character display names** (`"Devil Jin"`,
> `"Jack-8"`, `"Yoshimitsu"`). So the heavy per-provider alias machinery below is
> **not needed** — the canonical key is the display name, with a `slug` only for URLs.
> The verified full roster (`characterIdMap`) is in §7.6. Keep the alias arrays as an
> escape hatch, but in practice both resolve directly. An unrecognized name is still
> logged and skipped (never silently mis-joined).

```ts
export type CharacterSlug =
  | 'jin' | 'kazuya' | 'king' | 'paul' | 'law' | 'jack8' | 'devil_jin'
  | 'lars' | 'xiaoyu' | 'nina' | 'leroy' | 'asuka' | /* …full T8 roster… */ ;

export interface CharacterMeta {
  slug: CharacterSlug;
  displayName: string;      // "Devil Jin"
  ewgfAliases: string[];    // names EWGF may return
  wavuAliases: string[];    // names Wavu may return
}

export const CHARACTERS: Record<CharacterSlug, CharacterMeta> = { /* … */ };

// helpers used by the pipeline
export function fromEwgf(name: string): CharacterSlug | null;
export function fromWavu(name: string): CharacterSlug | null;
```

The full roster is verified and enumerated in [§7.6](./07-external-api-reference.md#76-character-list--verified-characteridmap-ewgf-wavu-uses-same-names)
(EWGF `characterIdMap`; Wavu uses the same names). No spike needed.

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
export function rankByTier(tier: number): RankTier;
export function rankBySlug(slug: string): RankTier | null;
```

> **📌 Decision — store the rank *slug* + our own `tier` ordinal.** Verified: EWGF
> returns `currentSeasonDanRank` as an **integer**; the full integer→name map
> (`rankOrderMap`) and the normalization for the duplicate "God of Destruction"
> encodings are in [§7.5](./07-external-api-reference.md#75-rank-ladder--verified-rankordermap-from-ewgf-frontend).
> `tier` = the normalized dan integer (higher = better); sorting and peak both use it.
> `RANK_LADDER` is generated from `rankOrderMap`.

## 2.3 `players.json` — roster (hand-maintained)

Player-level identity only. Characters are **not** enumerated here; they're
auto-discovered by the pipeline (brief §5 core concept).

```jsonc
{
  "schemaVersion": 1,
  "players": [
    {
      "id": "matt",                 // stable internal slug, used in URLs
      "tekken_id": "3fee-J699-M7An",// dashed Tekken/Polaris id (§7.1); null if unknown
      "player_tag": "SugarFree",    // display name (matches EWGF/Wavu handle)
      "platform": "steam",          // "steam" | "playstation" | "xbox"
      "main_character": "jin",      // CharacterSlug (player-level, declared)
      "peak_rank": null,            // rank slug, or null → derive from EWGF (§2.4)
      "socials": {                  // all optional
        "twitch": "https://twitch.tv/…",
        "twitter": "https://x.com/…"
      }
    }
  ]
}
```

**Invariants**

- `id` is unique, URL-safe, and **immutable** (it's the profile URL and the join key
  the match sheet references by tag→id; see §4).
- `tekken_id` may be `null` for a player not yet resolved on EWGF — such a player
  shows in the roster/profiles but has no ranks/MMR until an id is filled in.
- `peak_rank: null` means "derive it" (§2.4 note). A non-null value is a hand-set
  override / fallback.

> **📌 Decision — `id` (internal slug) is the canonical player key everywhere;
> `player_tag` is display-only.** The match sheet is authored with human tags, so the
> match pipeline resolves tags → `id` (§4.3). This isolates the site from tag renames.

## 2.4 `ranks.json` — current in-game rank (generated, EWGF, daily)

One row per qualifying `(player, character)` pair.

```jsonc
{
  "schemaVersion": 1,
  "source": "ewgf",
  "generatedAt": "2026-06-30T08:00:12Z",
  "pairs": [
    {
      "pairId": "1A2B3C4D:jin",
      "playerId": "matt",
      "tekken_id": "1A2B3C4D",
      "character": "jin",
      "rank": "tekken_god",       // rank slug (§2.2), or null if unranked
      "rankTier": 22,             // ordinal cache for sorting; null if unranked
      "rankedGames": 143,         // used for the play threshold
      "region": "us",             // best-effort; may be null
      "characterPeakRank": "tekken_god_supreme", // EWGF per-char peak, or null
      "lastSeen": "2026-06-29T21:14:00Z"          // EWGF's last-activity, or null
    }
  ]
}
```

**Field sources** (verified, [§7.2](./07-external-api-reference.md#72-ewgf--in-game-rank-winslosses-tekken-power)):
`rankTier` = normalized `currentSeasonDanRank`; `rankedGames` = `wins + losses` (EWGF
exposes no separate ranked-games count); `lastSeen` = player-level `latestBattle`
(EWGF gives no per-character timestamp).

**Threshold** (config §1.4): a pair is written to `ranks.json` only if
`rankedGames >= minRankedGames` **and** (`requireAssignedRank` ⇒ `rank != null`).
Pairs below threshold are dropped, not zeroed. Resolves brief §7 "exact threshold."

**Peak rank derivation** (revised — [§7.2](./07-external-api-reference.md#72-ewgf--in-game-rank-winslosses-tekken-power)):
EWGF does **not** expose an all-time per-character peak (only current + previous
season). So `characterPeakRank` is **accumulated by us** as the running max of
`rankTier` observed across daily snapshots (`rankhistory.json`); a player's displayed
`peak_rank` = max over their pairs, with the hand-set `players.json` value as the
floor/fallback. Peak is thus tracked **per pair** and **rolled up per player** in the UI.

## 2.5 `glicko.json` — current MMR (generated, Wavu Wank, daily)

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
      "pairId": "1A2B3C4D:jin",
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

> **📌 Decision (revised, §7.3):** the field is `sigmaSquared` (raw σ²), not
> `deviation`, and confidence comes from Wavu's own bucket (`confidence`), not an
> invented RD cutoff. `provisional = confidence === "provisional"` drives the UI's
> uncertain-rating styling (brief §5.5). `volatility` is dropped (not published).

`rating: null` ⇒ the leaderboard/profile shows `—` for MMR (brief §5.1/§5.5 graceful
fallback) without breaking the row.

## 2.6 `rankhistory.json` — append-only rank snapshots (EWGF)

Compact, append-only. One entry per pair per day. To keep diffs and file size sane,
history is stored as **per-pair series of `[date, tier]` tuples**, not a row per
(pair×day) object.

```jsonc
{
  "schemaVersion": 1,
  "source": "ewgf",
  "updatedAt": "2026-06-30T08:00:12Z",
  "series": {
    "1A2B3C4D:jin": {
      "playerId": "matt",
      "character": "jin",
      "points": [
        ["2026-06-28", 21],
        ["2026-06-29", 22],
        ["2026-06-30", 22]
      ]
    }
  }
}
```

**Append rule:** each daily run appends today's `[date, tier]` to each pair's series
**only if** the date isn't already present (idempotent re-runs). A day with no data
for a pair appends nothing (gaps are allowed; the chart interpolates/steps).

> **📌 Decision — daily granularity; series-of-tuples layout; roll to yearly files at
> `maxDaysInline`.** Resolves brief §7 "where to store snapshots without bloating the
> repo." Tuples (vs objects) roughly halve the byte size and produce append-only
> single-line-ish diffs. When any series exceeds `history.maxDaysInline` days, the
> pipeline moves the overflow into `rankhistory.<year>.json` and keeps the live file
> to the recent window. (Deferred until we actually approach the limit.)

## 2.7 `mmrhistory.json` — append-only MMR snapshots (Wavu)

Identical shape to §2.6 but the tuple value is the Glicko rating (float):

```jsonc
{
  "schemaVersion": 1, "source": "wavu", "updatedAt": "…",
  "series": {
    "1A2B3C4D:jin": {
      "playerId": "matt", "character": "jin",
      "points": [ ["2026-06-29", 1868.1], ["2026-06-30", 1875.4] ]
    }
  }
}
```

This is the **headline visualization** (brief §5.5): line chart of each pair's rating
trajectory; a profile overlays a player's characters on one chart.

## 2.8 `matches.json` — set log (generated from Google Sheet)

One object per **set** (not per game). Game totals for head-to-head are *derived*
from the set score (§4.4), so the sheet only records set scores.

```jsonc
{
  "schemaVersion": 1,
  "source": "google-sheet",
  "generatedAt": "2026-06-30T12:00:00Z",
  "rowCount": 128,
  "rejectedCount": 2,
  "matches": [
    {
      "id": "2026-06-28#0",         // deterministic: `${date}#${indexOnDate}`
      "date": "2026-06-28",
      "playerA": "matt",            // resolved player id (from tag)
      "playerB": "alex",
      "charA": "jin",               // CharacterSlug, or null if not recorded
      "charB": "king",
      "scoreA": 3,                  // games won by A in the set
      "scoreB": 1,
      "matchType": "ranked"         // "quick" | "ranked" | "player" | "group" | null (offline not tracked)
    }
  ],
  "rejected": [
    { "rowNumber": 57, "reason": "unknown player tag 'Aelx'", "raw": { /*…*/ } }
  ]
}
```

**Invariants**

- `playerA`/`playerB` are resolved roster `id`s; rows referencing unknown tags go to
  `rejected` (not `matches`) with a human-readable `reason` (brief §7 "typo'd names").
- `scoreA`/`scoreB` are non-negative integers, not both zero.
- `id` is stable across re-ingests so the "recent matches" feed doesn't reshuffle.

## 2.9 `stats.json` — derived head-to-head + usage (generated)

Computed purely from `matches.json` (brief §5.3). **Counted by individual games**: a
`3–1` set contributes 3 wins + 1 loss.

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-30T12:00:01Z",
  "basedOnMatchCount": 128,

  // person-vs-person game record. Key is "idA|idB" with idA < idB lexicographically.
  "headToHead": {
    "alex|matt": { "gamesA": 31, "gamesB": 47, "setsA": 9, "setsB": 14 }
    //            gamesA = games won by the lexicographically-first id (alex)
  },

  // per-player rollups
  "players": {
    "matt": {
      "totalGames": 210, "gameWins": 132, "gameLosses": 78, "gameWinRate": 0.629,
      "totalSets": 64, "setWins": 41, "setLosses": 23,
      "charUsage": { "jin": 180, "devil_jin": 30 },   // games played per character
      "mostPlayedCharacter": "jin"
    }
  },

  // OPTIONAL per-character matchup breakdown (brief §7 stretch). Populated in v1
  // because the data is free to compute; UI may hide it. Key adds characters.
  "charMatchups": {
    "matt:jin|alex:king": { "gamesA": 12, "gamesB": 8 }
  }
}
```

> **📌 Decision — H2H is person-vs-person by default; per-character matchups are
> also computed into `stats.json` (`charMatchups`) but surfaced as a secondary UI.**
> Resolves brief §7 "H2H … per-character breakdowns." Computing both costs nothing;
> the default rivalry table uses `headToHead`, and profiles can drill into
> `charMatchups`.

## 2.10 Shared TypeScript types

All of the above are declared once in `src/types/data-files.ts` and imported by both
the app and the pipeline scripts (§1.2 decision). Example:

```ts
export interface RanksFile {
  schemaVersion: 1;
  source: 'ewgf';
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
// …RanksFile, GlickoFile, HistoryFile, MatchesFile, StatsFile, PlayersFile…
```

A Vitest test validates each committed `public/data/*.json` against these types (via
a lightweight runtime check or `zod` schema mirror) so a malformed pipeline output
fails CI before it can break the site.
