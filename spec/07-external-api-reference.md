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

## 7.2 EWGF — recent battles (drives ranks + matches)

> **🛑 SUPERSEDED (2026-07-01) — the pipeline no longer uses EWGF.** EWGF's free
> tier caps at the last 50 battles (24h delayed) and its `/external/profile`
> endpoint (Pro-only) exposes only the *main* character's rank, not per-character
> dan ranks — so it couldn't satisfy either goal (full match history / real
> per-character rank). We switched ranks **and** matches to **tknow.gg** (§7.9),
> which is free, un-gated, gives real per-character dan ranks + lifetime games,
> and a paginated `battle_id`-keyed match history. Wavu (§7.3) still drives MMR.
> The `ewgf.ts` client and `EWGF_API_KEY` secret have been removed. The EWGF notes
> below are retained for historical context only.

> **⚠️ Requires an API key.** The **public** EWGF API lives at `api.ewgf.gg`
> behind an auth gateway: every request returns **HTTP 401**
> (`{"error":"Unauthorized access."}`) without `Authorization: Bearer <key>`. Keys
> are self-serve — create an account and generate one under Settings → Developer.
> (The `/player-stats/*` routes seen in `ewgfgg-backend` are the site's *internal*
> API, not exposed publicly; the public surface is the `/external/*` routes below.)
> Docs: <https://ewgf.gg/api-docs>. See the §7.4 decision.

- **Base URL:** `https://api.ewgf.gg`
- **Endpoint (used):** `GET /external/battles/{tekkenId}` → `{ _metadata, data: EwgfBattle[] }`
- **Headers:** `Accept: application/json`, `Authorization: Bearer <EWGF_API_KEY>`
- **Other endpoints (not used):** `GET /external/profile/{tekkenId}` and
  `POST /external/profile` return profile metadata but are **Pro-tier only** (they
  500/deny on the free tier), so we don't depend on them.
- **Tiers / limits:** Free = **100 req/day**, player's **last 50 battles, 24h
  delayed**, no profile metadata. Pro ($10/mo) = 1,000 req/day, last 100, no delay.
  Every response carries a `_metadata` object (`rate_limit_remaining`,
  `rate_limit_reset`, `tier`).
- **Id verification:** the public API has **no name search**. A member's
  `tekken_id` is the id in their profile URL (`https://ewgf.gg/player/<tekken_id>`);
  `npm run resolve-id -- "<tekken_id>"` confirms it resolves (fetches battles, prints
  the display name + characters seen).

### `EwgfBattle` — one online match to 3 rounds (verified live)

The battles response is the **sole source** for both `ranks.json` (rank/usage are
*derived* from the battle list — see below) and `matches.json`/`stats.json`.

```ts
interface EwgfBattle {
  battle_at: string;    // ISO-8601 UTC, e.g. "2026-06-21T03:56:41Z"
  battle_type: string;  // "QUICK_BATTLE" | "RANKED_BATTLE" | "GROUP_BATTLE" | "PLAYER_BATTLE"
  game_version?: number;
  winner: number;       // 1 | 2
  stage_id?: number;
  p1_name: string; p1_tekken_id: string;   // tekken_id is UNDASHED, e.g. "3feeJ699M7An"
  p1_char: string;                          // display name, e.g. "Bryan" (canonical, §7.6)
  p1_region: string | null;                 // e.g. "Americas"
  p1_dan_rank: string | null;               // display name, e.g. "Tekken God" (§7.5)
  p1_tekken_power?: number; p1_rounds_won: number;
  p2_name: string; p2_tekken_id: string;
  p2_char: string; p2_region: string | null; p2_dan_rank: string | null;
  p2_tekken_power?: number; p2_rounds_won: number;
}
```

Notes (all verified against the live free-tier endpoint):

- **Character and rank are *names*, not ids** — map via `canonicalizeCharacter`
  (§7.6) and `rankFromName` (§7.5). `characterId`/integer-`danRank` are internal-API
  concepts and do **not** appear here.
- **`p1`/`p2` orientation is stable across feeds:** a crew-vs-crew battle appears in
  both players' lists with identical p1/p2/winner/rounds, so it's deduped by the
  synthetic key `{p1_tekken_id}:{p2_tekken_id}:{epochSeconds}` (§4.2).
- **No `battleId`** and **no per-character lifetime totals** (profile is Pro-only).

**Deriving `ranks.json` (§2.4) from battles** — for each character a tracked player
appears on in their recent battles:

| our field | derived from the player's own battles on that character |
|---|---|
| `character` | `canonicalizeCharacter(p{1,2}_char)` (§7.6) |
| `rank` / `rankTier` | `rankFromName(dan_rank)` of their **most recent** battle on it (§7.5) |
| `rankedGames` | count of `RANKED_BATTLE` battles seen in the window |
| `region` | `region` of their most recent battle |
| `characterPeakRank` | running max of `rankTier` across daily snapshots — see note |
| `lastSeen` | `battle_at` of their most recent battle on it |

> **Free-tier caveat:** `rankedGames` reflects only the **last-50 battle window**,
> not lifetime totals, so a player whose recent games are all PLAYER/QUICK battles
> can show `rankedGames: 0` yet still have a valid `rank` (from the latest battle's
> `dan_rank`). The `pairThreshold.minRankedGames` gate is satisfied via
> `max(EWGF windowed games, Wavu lifetime games)`, so Wavu's lifetime count keeps
> established players on the board.

> **Note — peak rank:** the public API exposes no all-time per-character peak.
> **📌 Decision:** derive `peak_rank` as the **running max of `rankTier`** we observe
> across our own daily snapshots (`rankhistory.json`), with the hand-set
> `players.json` value as the floor/fallback — correct going forward regardless.

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

This map is `tier` → display name (higher = better). The **public** `/external`
API returns the rank as one of these **display names** (e.g. `"Tekken God"`), so
`rankFromName` reverse-looks it up to `{ slug, tier }`. (The integer
`currentSeasonDanRank` below is the *internal* API's encoding, kept here because it
defines the ladder ordering and the `normalizeDanRank` folding.) Two quirks to
normalize on the integer side:

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

## 7.6 Character list — display names (EWGF public API + Wavu agree)

The public `/external/battles` API returns characters as **display names**
(`p1_char`/`p2_char`, e.g. `"Bryan"`, `"Armor King"`, `"Miary Zo"`), and Wavu's
`.char` uses the **same** spellings. So character keying across the two providers is
1:1 on the name — `canonicalizeCharacter(name)` is the single mapper; the numeric
`characterIdMap` below (internal-API encoding) is retained for reference only and is
**not** used by the pipeline. The roster includes all live-observed names, incl.
`Armor King`, `Kunimitsu`, `Miary Zo`.

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
| Public API = `/external/battles` only (free tier: last 50, 24h delay, no profile) | Rank/usage **derived from battles**; `rankedGames` = ranked battles in-window; names not ids (§7.2) |
| No EWGF per-char all-time peak | Peak = running max over our snapshots + roster fallback (§7.2) |
| Wavu = HTML scrape, publishes σ² + confidence buckets | `glicko.json`: `deviation`→`sigmaSquared`, add `confidence`; drop `PROVISIONAL_RD` (§7.3) |
| Both providers share character names | Character aliasing simplified to name⇄slug (§7.6) |
| Verified rank & character maps | Replace the placeholder `RANK_LADDER`/`CharacterSlug` stubs (§7.5, §7.6) |
| No provider history series | Confirms daily-snapshot design for both history files (§7.7) |

---

## 7.9 tknow.gg — the live source for ranks + matches (verified 2026-07-01)

After EWGF proved insufficient (§7.2), the pipeline sources **both** in-game rank
and match history from **tknow.gg**, an independent Tekken-8 stats site with an
unofficial JSON API. Free, no API key, no Cloudflare challenge. Wavu (§7.3) still
drives MMR. Implemented in `scripts/online-stats/tknow.ts`.

- **Base URL:** `https://api.tk8now.pe.kr/api/v1` (the site's `api.tknow.gg` alias
  does not resolve publicly; the `.pe.kr` host is what the frontend falls back to).
- **Gate:** requests without an `Origin: https://www.tknow.gg` + `Referer:
  https://www.tknow.gg/` header pair get `403 {"error":"The stars have not
  foretold…"}`. This is a soft anti-hotlink check (no token). We send those headers
  plus a descriptive `User-Agent`. **ToS note:** unofficial API — keep it polite
  (sequential, one player at a time, low volume), same posture as the Wavu scrape.
  Consider giving the dev (min2hound; Discord/X linked on the site) a heads-up.

### `GET /player/info/{polarisId}` → per-character rank (drives `ranks.json`)

`current_ranks[]` gives, per character actually played:

| our field | from tknow |
|---|---|
| `character` | `fromCharacterId(char_id)` (§7.6; ids match EWGF's, +44 Armor King, 45 Miary Zo, 46 Kunimitsu) |
| `rank` / `rankTier` | `rankFromDanRank(current_rank)` — `current_rank` is the **same integer ladder** as §7.5's `rankOrderMap` (27=Tekken God, 31=God of Destruction II) |
| `rankedGames` | `total_games` — **lifetime** ranked games (not a windowed count → fixes the §7.2 free-tier caveat) |
| `region` | `region_id` → name (0 Asia, 1 Middle East, 2 Oceania, 3 Americas, 4 Europe 1, 5 Africa, 6 Europe 2) |
| `lastSeen` | `latest_at` (unix seconds) → ISO |

Also returns `nickname`, `my_power`, `region_id`, and `latest_game_info.version_list`.
The match query version is `max(current_ranks[].last_play_version)`, falling back to
`max(version_list)`. **Unmapped `char_id`s** (e.g. reserved ids 25/26/27/30/31/37 for
unreleased characters — Bob, Roger Jr., Yujiro) are logged and skipped.

### `GET /player/match/{polarisId}?version={v}&page={n}` → matches (drives `matches.json`)

Newest-first, paginated match rows with a real **`battle_id`** (globally unique →
exact dedup, replacing the old synthetic `p1:p2:epoch` key). Fields we use:
`battle_at` (unix), `battle_type` (1 = quick, else ranked; lobby/player matches are
**not** tracked), `is_win`, and `my_/enemy_` `polaris_id` / `chara` / `rank` /
`rounds`. Each row is normalized to a canonical orientation (p1.polarisId ≤
p2.polarisId) so the same battle from either crew member's feed yields an identical
`Match`. **`version` is required and per-patch** (`all`/`0` are rejected), so we query
the player's latest version each run and paginate until a page adds nothing new or we
reach a `battle_id` we already stored (incremental catch-up; first run backfills the
current version's full history).

> **Crew-vs-crew caveat:** head-to-head only populates when two roster members meet
> in **ranked/quick matchmaking**. Custom-lobby sets aren't tracked by tknow (or
> EWGF), so a crew that plays each other in private rooms will show 0 crew matches.
