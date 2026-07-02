# 3. Online-stats pipeline (tknow + Wavu Wank, + opt-in ewgf)

**Goal:** on a schedule, for every roster player with a `tekken_id`, discover their
active `(player, character)` pairs, fetch each pair's current in-game rank (tknow) and
Glicko-2 MMR (Wavu Wank), and write `ranks.json`, `glicko.json`, appending to
`rankhistory.json` / `mmrhistory.json`. The same run rebuilds `matches.json` +
`stats.json` (§4). It runs **once per site** (the CI workflow loops `sites/*/`).

Entry point: `scripts/online-stats/index.ts` (run via `tsx`, selected by `SITE`).

## 3.1 Orchestration

```
load merged config (config/config.json + sites/<SITE>/config.json) + players.json
ewgfEnabled = config.headToHead.enabled AND process.env.EWGF_API_KEY set
read prior ranks.json (for per-pair peak running-max) + matches.json (for known ids)
for each player where tekken_id != null (sequentially, ~500ms between calls):
    info      = tknow.getPlayerInfo(tekken_id)                    // §3.2 → per-char rank
    battles  += tknow.getPlayerMatches(tekken_id, info.matchVersion, {knownIds})  // §4
    if ewgfEnabled: battles += ewgf.getPlayerCustomMatches(tekken_id)  // §3.4, group/player
    wavu      = wavu.getPlayerCharacters(tekken_id)               // §3.3 → per-char MMR
    for each character seen in either tknow or Wavu:
        apply pairThreshold using max(tknow rankedGames, Wavu games)
        build RankPair (tknow, with peak running-max) and GlickoPair (Wavu)
assemble RanksFile + GlickoFile (sorted by pairId)
append today's snapshots to rankhistory + mmrhistory (idempotent, §2.6)
buildMatches(battles, …) + deriveStats over the full retained set (§4)
writeDataFile each file (stable sort + pretty print) — bounded/archived where noted
commit-if-changed (§3.5)
```

**Sequencing / politeness:** players are processed sequentially with a ~500 ms delay
between HTTP calls. tknow (unofficial) and Wavu (scrape) both get the same low-volume,
one-request-at-a-time posture; ewgf's free tier is ~100 req/day and the job spends one
request per player, which is why it's opt-in per site (§8).

## 3.2 tknow client (`scripts/online-stats/tknow.ts`)

Contract **verified live** — full detail in [§7.9](./07-external-api-reference.md#79-tknowgg--the-live-source-for-ranks--matches-verified-2026-07-01).
Free, no API key; gated only by an `Origin: https://www.tknow.gg` + matching `Referer`
header pair (a soft anti-hotlink check), sent with a descriptive `User-Agent`.

- `GET {tknowBaseUrl}/player/info/{polarisId}` → per-character rank, lifetime games,
  region, last-seen, and the version list used to query matches. Drives `ranks.json`.
- `GET {tknowBaseUrl}/player/match/{polarisId}?version={v}&page={n}` → paginated,
  newest-first match rows with a real `battle_id`. Drives `matches.json` (§4).

```ts
export interface TknowCharacterStat {
  character: CharacterSlug;   // fromCharacterId(char_id) (§7.6)
  rank: string | null;        // rankFromDanRank(current_rank), slug (§7.5)
  rankTier: number | null;
  rankedGames: number;        // total_games — LIFETIME (fixes EWGF's windowed caveat)
  region: string | null;
  lastSeen: string | null;    // latest_at → ISO
}
export async function getPlayerInfo(tekkenId, baseUrl, headers): Promise<{
  ok: boolean; name: string | null; matchVersion: number | null;
  characters: TknowCharacterStat[];
}>;
export async function getPlayerMatches(tekkenId, version, baseUrl, headers, { knownIds }):
  Promise<TknowBattle[]>;
```

Responsibilities:
- Character ids come through `fromCharacterId`; unmapped ids (reserved/unreleased) are
  `console.warn`ed and skipped.
- The match `version` is required and per-patch; the pipeline queries the player's
  latest version and paginates until a page adds nothing new or hits a `battle_id` in
  `knownIds` (incremental catch-up; first run backfills the current version).
- Never throw on one player's failure — return `ok:false`/empty, continue. On a tknow
  outage the pair keeps yesterday's committed data (overwrite only when reachable +
  commit-if-changed, §3.6).

**Onboarding a member** (not on cron): tknow has no name search, so grab the id from
the member's `tknow.gg/player/<id>` URL; `npm run resolve-id -- "<tekken_id>"`
(`resolve-id.ts`) fetches their info and prints the resolved name + per-character ranks
to confirm it's correct.

## 3.3 Wavu Wank client (`scripts/online-stats/wavu.ts`)

Contract **verified** — full DOM in [§7.3](./07-external-api-reference.md#73-wavu-wank--glicko-2-mmr-μ--σ2).
There is **no per-player JSON** (`?_format=json` returns HTML); we fetch and parse the
profile HTML. No API key. **Respect Wavu's ToS** — sequential, one request per player,
descriptive `User-Agent`.

- `GET {wavuProfileUrl}/player/{tekkenIdUndashed}` (strip dashes from `tekken_id`).
- Parse `.rating-group` blocks → confidence bucket from `.label`; per `.rating`:
  `.char`, `.mu` (μ), `.sigma` (σ²), `.games`, `.last-seen` (`printDate(unix)`).

```ts
export interface WavuCharacterStat {
  character: CharacterSlug;   // .char text → fromWavu (§7.6)
  rating: number | null;      // μ
  sigmaSquared: number | null;// σ²
  confidence: WavuConfidence; // 'leaderboard' | 'unqualified' | 'provisional'
  games: number;
  lastUpdated: string | null; // printDate unix → ISO
}
export async function getPlayerCharacters(tekkenId, profileUrl, userAgent):
  Promise<WavuCharacterStat[]>;
```

Parse with `node-html-parser` against the stable class names — not regex — so markup
shifts fail loudly rather than mis-parse. `provisional = confidence === 'provisional'`.
A failed fetch ⇒ return `[]` for that player, never abort the run.

## 3.4 ewgf client (`scripts/online-stats/ewgf.ts`) — opt-in group/player matches

Only active when `config.headToHead.enabled` **and** `EWGF_API_KEY` are both set.
Contributes **only** group/player (custom-lobby) matches, which tknow doesn't surface —
the deliberate crew-vs-crew fights the head-to-head feature is about. Full detail in
[§8](./08-ewgf-group-player-matches.md).

- `GET {ewgfBaseUrl}/battles/{undashedTekkenId}`, `Authorization: Bearer <EWGF_API_KEY>`.
- ewgf rows carry no battle id, so a deterministic `ewgf:{lo}-{hi}:{epoch}` id is
  synthesized in canonical orientation for cross-feed/run dedup.
- Emitted as the pipeline's canonical `TknowBattle` shape so they flow through the same
  `buildMatches` / `deriveStats` (§4). With the gate off, the pipeline is byte-identical
  to a tknow-only run.

## 3.5 History append + bounding (`rankhistory.json` / `mmrhistory.json`)

```
today = generatedAt date (UTC, YYYY-MM-DD)
for each pair in the fresh ranks/glicko output:
    series = file.series[pairId] ??= { playerId, character, points: [] }
    if series has no entry for today: push [today, value]   // value = rankTier | rating
split live vs archive: points older than history.maxDaysInline days roll into
    <name>.<year>.json (cold storage); the live file keeps the recent window
write live file + any changed archive with { inlineArrays: true }  // one tuple/line
```

Re-running the job the same day is safe (idempotent, no duplicate points, no double
commit). Both files are guarded so an empty run doesn't clobber good data.

## 3.6 Graceful degradation

- If **tknow is wholly unreachable**, keep yesterday's committed ranks/matches/stats
  rather than clobbering them with empties (Wavu still updates MMR).
- Matches rebuild when **either** tknow or ewgf was reachable; a source being down
  preserves its previously-committed matches (`buildMatches` merges fresh battles onto
  `priorMatches` by id).
- Per-player errors are logged and skipped; the run still succeeds and commits whatever
  it got. Stale-but-present data beats a broken board.

## 3.7 Commit-if-changed

After writing, the workflow stages the generated files under `sites/*/data/` and
commits **only if `git diff --cached` is non-empty**. Because serialization is
deterministic (§2), an unchanged run produces byte-identical files and no commit — so
`deploy.yml` doesn't rebuild for nothing and history stays noise-free. `players.json`
is hand-maintained and **never** staged by the job.

## 3.8 Workflow (`.github/workflows/online-stats.yml`)

```yaml
name: online-stats
on:
  schedule:
    - cron: '0 */6 * * *'        # every 6h — overlapping battle windows + append-only
                                 # merge minimize missed matches (§4.2, §7)
  workflow_dispatch: {}
permissions:
  contents: write
concurrency: { group: online-stats, cancel-in-progress: false }
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: Refresh online stats (all sites)
        env:
          EWGF_API_KEY: ${{ secrets.EWGF_API_KEY }}   # optional; enables ewgf for opted-in sites
        run: |
          for dir in sites/*/; do
            slug="$(basename "$dir")"
            SITE="$slug" npx tsx scripts/online-stats/index.ts
          done
      - name: Commit if changed
        run: |
          git config user.name  "ctown-bot"
          git config user.email "ctown-bot@users.noreply.github.com"
          git add sites/*/data/ranks.json sites/*/data/glicko.json \
                  sites/*/data/rankhistory.json sites/*/data/mmrhistory.json \
                  sites/*/data/matches.json sites/*/data/stats.json
          if ! git diff --cached --quiet; then
            git commit -m "data: refresh online stats $(date -u +%F)"; git push
          else echo "No changes."; fi
```

The push to `main` triggers `deploy.yml`, rebuilding every site with fresh data.

## 3.9 Failure & alerting

- Per-player errors are logged and skipped; the job still succeeds.
- A total failure (script throws) exits non-zero → the Actions run is marked failed →
  GitHub emails the repo owner. That's the v1 alerting mechanism ($0).
- `generatedAt` drives the site's "Last updated" label so the crew can see staleness
  even if a run silently no-ops.
</content>
