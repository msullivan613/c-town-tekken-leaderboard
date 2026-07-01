# 3. Online-stats pipeline (EWGF + Wavu Wank)

**Goal:** once daily, for every roster player with a `tekken_id`, discover their
active `(player, character)` pairs, fetch each pair's current in-game rank (EWGF) and
Glicko-2 MMR (Wavu Wank), and write `ranks.json`, `glicko.json`, and append to
`rankhistory.json` / `mmrhistory.json`.

Entry point: `scripts/online-stats/index.ts` (run via `tsx`).

## 3.1 Orchestration

```
load config + players.json
for each player where tekken_id != null (sequentially, gentle rate):
    ewgfPairs   = ewgf.getPlayerCharacters(tekken_id)   // §3.2
    wavuPairs   = wavu.getPlayerCharacters(tekken_id)   // §3.3
    for each character seen in either source:
        canonical = canon(character)  // skip + warn if unmapped (§2.1)
        apply play threshold (config.pairThreshold) using EWGF rankedGames
        build RankPair (from ewgf) and GlickoPair (from wavu)
assemble RanksFile + GlickoFile (sorted by pairId)
append today's snapshots to rankhistory + mmrhistory (idempotent, §2.6)
atomicWrite each file (stable sort + pretty print)
commit-if-changed (§3.5)
```

**Sequencing / politeness:** players are processed sequentially with a small delay
between HTTP calls (e.g. 500 ms) and a shared retry-with-backoff helper. This
respects both APIs' rate limits (brief §7) and keeps the whole job well under a
minute for a small crew.

## 3.2 EWGF client (`scripts/online-stats/ewgf.ts`)

Contract **verified live** — full detail in [§7.2](./07-external-api-reference.md#72-ewgf--recent-battles-drives-ranks--matches).

- `GET https://api.ewgf.gg/external/battles/{tekkenId}` → `{ _metadata, data: EwgfBattle[] }`.
- **Requires** `Authorization: Bearer ${EWGF_API_KEY}` (the gateway 401s without a
  valid key). Key comes from the Actions secret via `process.env.EWGF_API_KEY` (§7.4).
- `tekkenId` = the `tekken_id` from `players.json`; dashes are stripped internally, so
  either encoding works.
- One fetch per player returns both the raw `battles` (for §4) and — since the free
  tier has no profile endpoint — the per-character rank/usage **derived** from those
  battles.

```ts
export interface EwgfCharacterStat {
  character: string;          // canonicalizeCharacter(p{1,2}_char) (§7.6)
  rank: string | null;        // rankFromName(latest dan_rank), slug (§7.5)
  rankTier: number | null;    // rankFromName(latest dan_rank), tier (§7.5)
  rankedGames: number;        // count of RANKED_BATTLE in the last-50 window
  region: string | null;      // region of the latest battle
  lastSeen: string | null;    // battle_at of the latest battle (ISO)
}
export async function getPlayer(
  tekkenId: string,
  apiKey: string,
  baseUrl: string,
  battlesPath: string,
): Promise<{ characters: EwgfCharacterStat[]; battles: EwgfBattle[] }>;
```

Responsibilities:
- Fetch battles; for each character the player appears on, take the latest battle's
  `dan_rank` (→ `rankFromName`, §7.5) as their current rank and count `RANKED_BATTLE`s.
- Character names come through canonical (§7.6); an unrecognized name is
  `console.warn`ed and skipped.
- **`EWGF_API_KEY` absent/invalid ⇒ skip EWGF entirely** and return empties for all
  players; the run still writes `glicko.json` from Wavu (graceful degrade, §7.4).
- Never throw on one player's failure — log, return empty, continue (brief §5.1). On an
  EWGF outage the pair keeps yesterday's committed data (overwrite only on success +
  commit-if-changed).

**`tekken_id` when onboarding a member** (not on cron): the public API has no name
search, so grab the id from the member's profile URL
(`https://ewgf.gg/player/<tekken_id>`); the helper
`npm run resolve-id -- "<tekken_id>"` (`scripts/online-stats/resolve-id.ts`) fetches
their battles and prints the resolved name + characters to confirm it's correct.

## 3.3 Wavu Wank client (`scripts/online-stats/wavu.ts`)

Contract **verified** — full detail + exact DOM in
[§7.3](./07-external-api-reference.md#73-wavu-wank--glicko-2-mmr-μ--σ2). There is
**no per-player JSON** (`?_format=json` returns HTML); we fetch and parse the profile
HTML. No API key needed. **Respect Wavu's ToS** — daily, sequential, one request per
player, descriptive `User-Agent`.

- `GET https://wank.wavu.wiki/player/{tekkenIdUndashed}` (strip dashes from `tekken_id`).
- Headers: `User-Agent: <crew contact>`, `Accept-Encoding: gzip`.
- Parse `.rating-group` blocks → confidence bucket from `.label`; per `.rating`:
  `.char`, `.mu`, `.sigma` (σ²), `.games`, `.last-seen` (`printDate(unix)`).

```ts
export type WavuConfidence = 'leaderboard' | 'unqualified' | 'provisional';
export interface WavuCharacterStat {
  character: string;          // .char text (canonical, §7.6)
  rating: number | null;      // μ
  sigmaSquared: number | null;// σ²
  confidence: WavuConfidence;
  games: number;
  lastUpdated: string | null; // printDate unix → ISO
}
export async function getPlayerCharacters(tekkenId: string): Promise<WavuCharacterStat[]>;
```

Parse with a lightweight HTML parser (e.g. `node-html-parser`) against the stable
class names — not regex — so minor markup shifts fail loudly rather than mis-parse.
Responsibilities:
- `provisional = confidence === 'provisional'` (Wavu's own bucketing, no RD cutoff).
- Graceful fallback: a missing pair ⇒ omitted (⇒ `rating: null` downstream, UI shows
  `—`); a failed fetch ⇒ log + return `[]` for that player, never abort the run
  (brief §5.5).

## 3.4 History append (`rankhistory.json` / `mmrhistory.json`)

```
today = generatedAt date (UTC, YYYY-MM-DD)
for each pair in the fresh ranks/glicko output:
    series = file.series[pairId] ??= { playerId, character, points: [] }
    if series.points has no entry for `today`:
        series.points.push([today, value])   // value = rankTier | rating
    // if today already present (re-run), leave it — idempotent
prune: if any series exceeds config.history.maxDaysInline, roll overflow to
       <name>.<year>.json (deferred; see §2.6 decision)
```

Re-running the job the same day is safe (no duplicate points, no double commit).

## 3.5 Commit-if-changed

After writing, the workflow stages `public/data/{ranks,glicko,rankhistory,mmrhistory}.json`
and commits **only if `git status --porcelain` is non-empty**. Because serialization
is deterministic (§2), an unchanged run produces a byte-identical file and no commit —
so `deploy.yml` doesn't rebuild for nothing, and history doesn't get noise commits.

## 3.6 Workflow (`.github/workflows/online-stats.yml`)

```yaml
name: online-stats
on:
  schedule:
    - cron: '0 8 * * *'        # 08:00 UTC daily (brief: daily ranks)
  workflow_dispatch: {}         # manual trigger for testing
permissions:
  contents: write               # to commit generated JSON
concurrency:
  group: online-stats
  cancel-in-progress: false
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsx scripts/online-stats/index.ts
        env:
          EWGF_API_KEY: ${{ secrets.EWGF_API_KEY }}   # gated API (§7.4); absent ⇒ Wavu-only
      - name: Commit if changed
        run: |
          git config user.name  "ctown-bot"
          git config user.email "ctown-bot@users.noreply.github.com"
          git add public/data/ranks.json public/data/glicko.json \
                  public/data/rankhistory.json public/data/mmrhistory.json
          if ! git diff --cached --quiet; then
            git commit -m "data: refresh online stats $(date -u +%F)"
            git push
          else
            echo "No changes."
          fi
```

The push to `main` triggers `deploy.yml` (path-filtered to `public/**`), rebuilding
the site with fresh data.

## 3.7 Failure & alerting

- Per-player errors are logged and skipped; the job still succeeds and commits
  whatever it got. Stale-but-present data beats a broken board.
- A total failure (both APIs down, script throws) exits non-zero → the Actions run is
  marked failed → GitHub emails the repo owner. That's the v1 alerting mechanism
  ($0). Discord notification is a stretch item (brief §8).
- `generatedAt` drives the site's "Last updated" label so the crew can see staleness
  even if a run silently no-ops.
