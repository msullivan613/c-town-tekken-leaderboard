# 7. External API reference (verified)

Everything here was **observed from the live services / EWGF's open-source code**
on 2026-06-30 using the crew's own account (SugarFree, Tekken ID `3fee-J699-M7An`).
This supersedes the "⚠️ Needs confirmation" placeholders in files 2–3.

Sources: [`ewgf-gg/ewgfgg-backend`](https://github.com/ewgf-gg/ewgfgg-backend),
[`ewgf-gg/ewgfgg-frontend`](https://github.com/ewgf-gg/ewgfgg-frontend),
`https://wank.wavu.wiki/player/3feeJ699M7An`.

---

## 7.1 Player identity — the two ID forms

| Where | Form | Example |
|---|---|---|
| Tekken in-game / EWGF | dashed | `3fee-J699-M7An` |
| Wavu Wank URL | undashed | `3feeJ699M7An` |

**📌 Decision:** `players.json.tekken_id` stores the **dashed** form
(`3fee-J699-M7An`); the pipeline derives the undashed form for Wavu with
`tekken_id.replaceAll('-', '')`. EWGF's route accepts either form (both matched,
returning 401 for auth rather than 404).

Steam id is also exposed on the Wavu page (`steamcommunity.com/profiles/<steamId>`)
— useful for populating `platform` and cross-checking identity when onboarding.

---

## 7.2 EWGF — in-game rank, wins/losses, Tekken power

> **⚠️ Requires an API key.** Every EWGF endpoint (`/player-stats/*`,
> `/statistics/*`) returns **HTTP 401** without `Authorization: Bearer <key>`. The
> public website is a Next.js server that injects the key server-side (`API_KEY` env
> var). There is **no anonymous access.** See the §7.4 decision.

- **Base URL:** `https://api.ewgf.gg`
- **Endpoint:** `GET /player-stats/{polarisId}` → `PlayerDTO`
- **Headers:** `Accept: application/json`, `Authorization: Bearer <EWGF_API_KEY>`
- **Search (id lookup):** `GET /player-stats/search?query=<tag>` → `PlayerSearchDTO[]`
  (also gated) — this is how a new member's `polarisId` is found for `players.json`.

### `PlayerDTO` (top level)

```ts
interface PlayerDTO {
  polarisId: string;
  name: string;
  regionId: number;                 // EWGF region code (America = one of these)
  tekkenPower: number;              // Tekken's own power metric (NOT Glicko)
  latestBattle: number;             // unix seconds of most recent battle
  mainCharacterAndRank: Record<string, string>;      // { "<Character>": "<rankName>" }
  playedCharacters: Record<string, PlayerMatchupSummaryDTO>;  // key = character name
  battles: BattleDTO[];             // recent battle history
}

interface PlayerMatchupSummaryDTO {  // one per played character
  wins: number;
  losses: number;
  currentSeasonDanRank: number | null;   // integer dan rank → rankOrderMap (§7.5)
  previousSeasonDanRank: number;
  characterWinrate: number;              // 0..100
  bestMatchup: Record<string, number>;
  worstMatchup: Record<string, number>;
  matchups: Record<string, { wins: number; losses: number; winRate: number; totalMatches: number }>;
}
```

**Mapping EWGF → our schema (§2.4 `ranks.json`):**

| our field | from EWGF |
|---|---|
| `character` | key of `playedCharacters` (already canonical, §7.6) |
| `rank` | `rankOrderMap[currentSeasonDanRank]` slugified (§7.5) |
| `rankTier` | `currentSeasonDanRank` normalized (§7.5) |
| `rankedGames` | `wins + losses` (EWGF has no separate ranked-games count) |
| `region` | `regionId` mapped to a name |
| `characterPeakRank` | **not provided per character** — see §7.5 note |
| `lastSeen` | `latestBattle` (player-level; EWGF gives no per-char timestamp) |

> **Note — peak rank:** EWGF's `PlayerDTO` exposes `currentSeasonDanRank` and
> `previousSeasonDanRank`, **not** an all-time per-character peak. So the brief §7
> "derive peak from EWGF per-character peak data" is **not directly available**.
> **📌 Revised decision:** derive `peak_rank` as the **running max of
> `currentSeasonDanRank`** we observe across our own daily snapshots
> (`rankhistory.json`), with the hand-set `players.json` value as the floor/fallback.
> Peak becomes a value we *accumulate*, which also means it's correct going forward
> even if EWGF never backfills it.

---

## 7.3 Wavu Wank — Glicko-2 MMR (μ / σ²)

> **⚠️ No JSON API for per-player data.** `?_format=json` returns the **HTML page**
> (`Content-Type: text/html`, verified), not JSON. The documented `/api/replays`
> endpoint is the global firehose, not per-player. So per-player MMR is obtained by
> **fetching and parsing the profile HTML.** Anonymous access works (no key).

- **URL:** `https://wank.wavu.wiki/player/{tekkenIdUndashed}`
- **Headers:** descriptive `User-Agent` (crew contact), `Accept-Encoding: gzip`.
- **Politeness / ToS:** daily, sequential, one request per player. Respect Wavu's ToS.

### Page structure (server-rendered, stable class names)

```html
<title>SugarFree • Wavu Wank</title>
<!-- steam id: -->  <a href="https://steamcommunity.com/profiles/76561198043616016">
...
<div class="rating-group">
  <div class="label">Leaderboard (σ² &lt; 75)</div>      <!-- confidence group -->
  <div class="ratings">
    <div class="rating">
      <div class="char">Yoshimitsu</div>                 <!-- character name -->
      <div class="mu">μ 1715</div>                        <!-- Glicko rating (MMR) -->
      <div class="sigma"><sup>σ² 68</sup></div>           <!-- rating VARIANCE (σ²) -->
      <div class="games">559 games</div>
      <div class="last-seen"><sup><time>
          <script>printDate(1781924751)</script></time></sup></div>  <!-- unix secs -->
    </div>
    ...
  </div>
</div>
<!-- two more .rating-group blocks: -->
<!--   label "Unqualified (σ² < 110)"  -->
<!--   label "Provisional (σ² ≥ 110)"  -->
```

### Parsing rules

- For each `.rating-group`, read `.label` → confidence bucket:
  `Leaderboard` → `"leaderboard"`, `Unqualified` → `"unqualified"`,
  `Provisional` → `"provisional"`.
- For each `.rating` inside: `.char` (text) → character; `.mu` → parse int after `μ`;
  `.sigma` → parse int after `σ²`; `.games` → parse leading int; `.last-seen` → the
  integer arg of `printDate(...)` is unix seconds → ISO.

**Mapping Wavu → our schema (§2.5 `glicko.json`):**

| our field | from Wavu |
|---|---|
| `rating` | `.mu` value |
| `deviation` | **store σ² as-is** in a `sigmaSquared` field (see decision) |
| `confidence` | the group label (`leaderboard`/`unqualified`/`provisional`) |
| `provisional` | `confidence === "provisional"` |
| `games` | `.games` value |
| `lastUpdated` | `printDate` unix → ISO |

> **📌 Revised decision (glicko schema):** Wavu publishes **σ² (variance)**, not σ
> (RD), and already buckets each character into Leaderboard / Unqualified /
> Provisional. So:
> 1. Rename the schema field `deviation` → **`sigmaSquared`** (store the raw σ²), and
>    add **`confidence`** (the group). Drop the invented `PROVISIONAL_RD` cutoff — use
>    Wavu's own bucketing.
> 2. `provisional = confidence === "provisional"` drives the UI's uncertain-rating
>    styling (brief §5.5).
> This supersedes §2.5's `deviation`/`volatility`/`provisional`-by-cutoff fields.

---

## 7.4 EWGF API-key decision (resolves the biggest open risk)

Because EWGF is fully gated, the automated rank pipeline **needs a key**.

> **📌 Decision — request a read API key from the EWGF team; store it as the GitHub
> Actions secret `EWGF_API_KEY`; degrade gracefully if absent.**
> - EWGF is a community project (active GitHub org + Discord). Ask for a low-volume
>   read key for a private crew tool. This keeps cost $0 (a secret, not a paid tier).
> - The workflow passes `EWGF_API_KEY` as an env var to the pipeline; it is **never**
>   shipped to the browser (the pipeline runs in Actions; only the resulting JSON is
>   published).
> - **Graceful degradation:** if `EWGF_API_KEY` is unset/invalid, `online-stats`
>   skips the EWGF step and still writes `glicko.json` from Wavu. The board then shows
>   `—` for in-game rank and sorts by MMR. Wavu (MMR, the headline chart) needs no
>   key, so the site is useful even without EWGF.
> - **Fallback if no key is granted:** launch **MMR-only v1** (Wavu), and revisit
>   in-game rank later (options: negotiate a key, or scrape the EWGF Next.js page with
>   a browser-like client — it 403s simple bots, so this is a last resort and must
>   respect their ToS).

**Action item for the human:** obtain `EWGF_API_KEY` (or confirm we're shipping
MMR-only v1). This is the one true external dependency that a spec can't resolve
alone.

---

## 7.5 Rank ladder — verified `rankOrderMap` (from EWGF frontend)

Integer `currentSeasonDanRank` → name. Use the **integer as `tier`** for sorting
(higher = better). Two quirks to normalize:

- `29..37` and `100..107` (+`765`) are **both** "God of Destruction …" encodings.
  Normalize the `100+`/`765` block down onto `29..37` for a single ordering
  (`tier = danRank >= 100 ? danRank - 71 : (danRank === 765 ? 37 : danRank)`).
- `currentSeasonDanRank` may be `null` (unranked this season) → `rank = null`,
  `rankTier = null` (the pair still counts toward the threshold via games).

```ts
export const rankOrderMap: Record<number, string> = {
  0:'Beginner',1:'1st Dan',2:'2nd Dan',3:'Fighter',4:'Strategist',5:'Combatant',
  6:'Brawler',7:'Ranger',8:'Cavalry',9:'Warrior',10:'Assailant',11:'Dominator',
  12:'Vanquisher',13:'Destroyer',14:'Eliminator',15:'Garyu',16:'Shinryu',
  17:'Tenryu',18:'Mighty Ruler',19:'Flame Ruler',20:'Battle Ruler',21:'Fujin',
  22:'Raijin',23:'Kishin',24:'Bushin',25:'Tekken King',26:'Tekken Emperor',
  27:'Tekken God',28:'Tekken God Supreme',
  29:'God of Destruction',30:'God of Destruction I',31:'God Of Destruction II',
  32:'God of Destruction III',33:'God of Destruction IV',34:'God of Destruction V',
  35:'God of Destruction VI',36:'God of Destruction VII',37:'God of Destruction Infinity',
  // alt encodings normalized onto 29..37:
  100:'God of Destruction',101:'God of Destruction I',102:'God Of Destruction II',
  103:'God of Destruction III',104:'God of Destruction IV',105:'God of Destruction V',
  106:'God of Destruction VI',107:'God of Destruction VII',765:'God of Destruction Infinity'
};
```

EWGF also ships rank icon assets (`/static/rank-icons/<Name>T8.webp`). For our own
design (brief §4.1) we choose whether to reuse Tekken's official iconography or a
custom style — the *slug + tier* stored in data is icon-agnostic.

---

## 7.6 Character list — verified `characterIdMap` (EWGF); Wavu uses same names

EWGF `playedCharacters` is keyed by these display names, and Wavu's `.char` uses the
**same** spellings (observed: `Yoshimitsu`, `Bryan`, `Feng`, `Fahkumram`, `Kazuya`,
`Devil Jin`). So character keying across the two providers is effectively 1:1.

> **📌 Simplified decision:** the canonical key is the **EWGF/Wavu display name**
> (e.g. `"Devil Jin"`, `"Jack-8"`). Keep a slugify for URLs (`"devil_jin"`), but the
> heavy alias-map machinery in §2.1 is **not needed** — a small `displayName ⇄ slug`
> table suffices. Only add an alias if a future provider name is observed to differ.

```ts
export const characterIdMap: Record<number, string> = {
  0:'Paul',1:'Law',2:'King',3:'Yoshimitsu',4:'Hwoarang',5:'Xiaoyu',6:'Jin',
  7:'Bryan',8:'Kazuya',9:'Steve',10:'Jack-8',11:'Asuka',12:'Devil Jin',13:'Feng',
  14:'Lili',15:'Dragunov',16:'Leo',17:'Lars',18:'Alisa',19:'Claudio',20:'Shaheen',
  21:'Nina',22:'Lee',23:'Kuma',24:'Panda',28:'Zafina',29:'Leroy',32:'Jun',
  33:'Reina',34:'Azucena',35:'Victor',36:'Raven',38:'Eddy',39:'Lidia',40:'Heihachi',
  41:'Clive',42:'Anna',43:'Fahkumram' /* + any later DLC ids */
};
```

---

## 7.7 History — neither provider gives a per-character time series

- **EWGF** exposes only `currentSeasonDanRank` + `previousSeasonDanRank` (and a
  `battles` list) — no daily rank series.
- **Wavu** shows only the *current* μ/σ² per character (plus a per-character
  last-seen) — no rating history in the profile scrape.

So both `rankhistory.json` and `mmrhistory.json` **must** be built from our own daily
snapshots (exactly as §2.6/§2.7/§3.4 already specify). This confirms — rather than
changes — the snapshot design; there's no shortcut series to import. The very first
run seeds day 1; the charts grow from there.

---

## 7.8 Summary of spec changes triggered by this research

| Finding | Spec impact |
|---|---|
| EWGF fully gated (401) | New `EWGF_API_KEY` secret + graceful degrade + MMR-only fallback (§7.4) |
| In-game rank = EWGF `currentSeasonDanRank` only | `ranks.json.rankTier` = normalized dan int; `rankedGames` = wins+losses (§7.2) |
| No EWGF per-char all-time peak | Peak = running max over our snapshots + roster fallback (§7.2) |
| Wavu = HTML scrape, publishes σ² + confidence buckets | `glicko.json`: `deviation`→`sigmaSquared`, add `confidence`; drop `PROVISIONAL_RD` (§7.3) |
| Both providers share character names | Character aliasing simplified to name⇄slug (§7.6) |
| Verified rank & character maps | Replace the placeholder `RANK_LADDER`/`CharacterSlug` stubs (§7.5, §7.6) |
| No provider history series | Confirms daily-snapshot design for both history files (§7.7) |
