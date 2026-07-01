# 5. Frontend (React + Vite SPA)

Reads the committed JSON, renders the crew scoreboard. No writes, no auth. Visual
design is deliberately **not** specified here beyond structure — art direction is its
own pass (brief §4.1); this doc defines routes, data flow, and component contracts so
the design pass has a skeleton to dress.

## 5.1 Routes

HashRouter (§1.2 decision). Routes:

| Path | Page | Purpose |
|---|---|---|
| `/` | `LeaderboardPage` | landing; the core board (§5.3) + recent-matches strip |
| `/player/:id` | `PlayerProfilePage` | rich profile (§5.5) |
| `/h2h` | `HeadToHeadPage` | full crew matrix + pair drill-down (§5.6) |
| `/matches` | `MatchesPage` | full match log with filters |
| `*` | `NotFound` | |

## 5.2 Data loading

All pages consume a single `useData()` context that loads the JSON files once and
memoizes a joined view model.

```ts
// src/data/useJson.ts — fetch one file relative to BASE_URL, typed
function useJson<T>(name: string): { data: T | null; error: Error | null; loading: boolean };

// src/data/DataProvider.tsx — loads all files, exposes joined selectors
interface DataContext {
  lastUpdated: string;                 // max(generatedAt across files) → "Last updated"
  players: Player[];
  pairs: PairViewModel[];              // ranks ⨝ glicko ⨝ players, one per pair (§5.4)
  matches: Match[];
  stats: StatsFile;
  history: { rank: HistoryFile; mmr: HistoryFile };
}
```

**Joining** happens client-side in `src/lib/leaderboard.ts`:
`PairViewModel = players.json ⨝ ranks.json ⨝ glicko.json` on `pairId`/`playerId`.
Missing MMR or rank ⇒ the field is `null` and the UI renders `—` (brief graceful
fallback). A player with no qualifying pairs still appears in the roster/profiles
with an empty pair list.

## 5.3 Leaderboard (core, `/`)

The headline feature (brief §5.1). A sortable board with the **Players ⇄ Pairs
toggle**.

```
┌───────────────────────────────────────────────────────────┐
│  C-TOWN LEADERBOARD          [Players | Pairs]  sort:[Rank▾]│
│  Last updated 2h ago                                        │
├───────────────────────────────────────────────────────────┤
│ #1  ▟ Matt   Jin           Tekken God    1875 MMR  main:Jin │
│ #2  ▟ Matt   Devil Jin     Fujin         1740 MMR  peak:TGS │  ← Pairs view:
│ #3  ▛ Alex   King          Fujin         1710 MMR           │    same-player rows
│ …                                                            │    share accent color
└───────────────────────────────────────────────────────────┘
```

**Toggle behavior** (`src/lib/leaderboard.ts`):

- **Players view** (default, config `leaderboard.defaultView`): collapse pairs to one
  row per player = their **best pair**. Best = highest `rating` (config
  `bestPairMetric: "mmr"`); if a player has no MMR anywhere, fall back to highest
  `rankTier`. The chosen pair's character is shown; `main_character` and `peak_rank`
  render as their own columns regardless. Resolves brief §7 "which lists get the
  toggle / how 'best' is chosen."
- **Pairs view:** every qualifying pair is its own row; rows belonging to the same
  player share a visual accent (color/avatar) so multiple top spots read as one
  person (brief §5.1).

**Sorting:** `defaultSort` = `rank` (in-game tier desc, MMR as tiebreak). Header
click toggles between Rank and MMR sort (they disagree — the brief wants both signals
side by side). Sort applies within the active view.

**Columns:** rank position, accent/avatar, player tag, character (context-dependent),
current rank (icon + color from `src/data/ranks.ts`), MMR (with a subtle provisional
treatment when `provisional`), main character, peak rank, platform icon.

Below the board: a **recent-matches strip** (last 20, from `matches.json`).

Components: `LeaderboardTable`, `ViewToggle`, `SortHeader`, `RankBadge`, `MmrCell`,
`PlayerAccent`, `LastUpdated`, `RecentMatchesStrip`.

## 5.4 Pair view model

```ts
interface PairViewModel {
  pairId: string;
  playerId: string;
  playerTag: string;
  character: CharacterSlug;
  isMain: boolean;                 // character === player.main_character
  rank: RankTier | null;
  mmr: number | null;
  deviation: number | null;
  provisional: boolean;
  platform: Platform;
  peakRank: RankTier | null;       // player-level rollup (§2.4)
}
```

## 5.5 Player profile (`/player/:id`)

Rolls all of one person's pairs into a page (brief §5.4):

- **Header:** tag, platform, main character (flagged), peak rank, socials.
- **Characters list:** each tracked pair with current rank + MMR; main flagged.
- **History charts (Recharts):** rank-over-time and **MMR-over-time** (the headline
  chart, brief §5.5), built from `rankhistory`/`mmrhistory` series for this player's
  pairs. Default overlays the player's characters on one MMR chart; per-character
  toggle available.
- **Head-to-head:** this player's game record vs each crew member (from
  `stats.json.headToHead`), with a drill-down into `charMatchups` (§2.9).
- **Match & session stats:** recent matches, most-played character, win rate (from
  `stats.json.players[id]`).

Components: `ProfileHeader`, `CharacterPairList`, `HistoryChart` (shared,
rank|mmr mode), `PlayerH2HTable`, `PlayerMatchList`, `PlayerStatCards`.

## 5.6 Head-to-head (`/h2h`)

- **Crew matrix:** everyone-vs-everyone grid of **match records** (brief §5.3 "full
  crew grid"), colored by win share, reading from `stats.json.headToHead`.
- **Cell drill-down:** click a cell → the two players' matches + rounds record and the
  optional per-character matchup breakdown (`charMatchups`).

Components: `H2HMatrix`, `H2HCell`, `MatchupDrilldown`.

## 5.7 Matches (`/matches`)

Full log from `matches.json` with client-side filters (player, match type, crew-only).
Opponents without a `playerId` are non-crew randoms and render by EWGF name (no link).
Rows show each side's character, the rounds score, "concluded X ago", and match type.

## 5.8 Design direction (pointer, not spec)

Per brief §4.1 the look is **ours, from scratch** — not a re-skin of the inspiration
site. Structural hooks this spec guarantees for the design pass:

- Every player has a stable **accent** (derived from `id`) usable as color/avatar to
  visually group a player's multiple pair rows.
- `src/data/ranks.ts` centralizes rank **color + icon** tokens (custom style vs.
  official Tekken iconography is a design-pass call — brief §4.1).
- Theme values are CSS custom properties in `src/styles/tokens.css`, so the whole
  palette/vibe (slick-competitive vs. playful-irreverent) is swappable in the design
  pass without touching components.
- "C-Town" is the SFW-safe slug for titles/URLs; how far in-site branding leans into
  the full crew name is a branding-pass decision (brief naming note). Use the
  frontend-design skill when that pass starts.

## 5.9 Non-goals reminder (brief §3)

No login, no in-browser result submission, no server calls, Tekken 8 only, no
brackets. The app is strictly a reader of static JSON.
