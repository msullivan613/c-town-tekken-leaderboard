# 4. Match pipeline (Google Sheet → matches + stats)

**Goal:** on a schedule, read the crew's shared Google Sheet of set results,
validate each row against the roster, write `matches.json`, then derive
`stats.json` (head-to-head + usage). Logging a result stays a one-row spreadsheet
edit (brief §5.2) — zero code, zero deploy.

Entry point: `scripts/match-sync/index.ts`.

## 4.1 Sheet access

> **📌 Decision — public "Publish to web" CSV export; no API key, no auth.**
> Resolves brief §7 "how the Action authenticates." In Google Sheets:
> `File → Share → Publish to web → (the matches tab) → CSV`. This yields a stable URL
> (`config.sheet.csvUrl`) the Action `fetch`es anonymously. Keeps cost $0 and avoids
> storing a service-account secret. Trade-off: the sheet's *contents* are
> world-readable-by-URL — acceptable for match scores. If that's ever unwanted,
> switch to the Sheets API with a read-only service account stored in Actions
> secrets (documented as the fallback path).

## 4.2 Sheet contract (columns)

> **📌 Decision — the sheet logs one row per *set* with a set score; game totals are
> derived.** Resolves brief §7 "set score vs each game as a row." A row is
> `3` and `1`, not three win-rows. This is the minimum typing per the brief's
> "< 1 minute to log."

Header row (exact, lowercase, order-independent — parsed by name):

| Column | Required | Format | Notes |
|---|---|---|---|
| `date` | yes | `YYYY-MM-DD` | set date |
| `time` | no | `HH:MM`\|`HH:MM:SS` | 24h UTC; combined with `date` → `playedAt` (drives "concluded X ago") |
| `player_a` | yes | tag | resolved to roster id (§4.3) |
| `player_b` | yes | tag | |
| `char_a` | no | character name | canonicalized; blank ⇒ `null` |
| `char_b` | no | character name | |
| `score_a` | yes | integer ≥ 0 | games A won |
| `score_b` | yes | integer ≥ 0 | games B won |
| `match_type` | no | `quick`\|`ranked`\|`player`\|`group` | Tekken 8 online match type; blank ⇒ `null` (offline not tracked) |

A pinned "instructions" note in the sheet documents this for the crew, plus a data
validation dropdown on `player_a`/`player_b`/`match_type` to cut typos at the source.

## 4.3 Validation & name resolution

For each data row (resolves brief §7 "typo'd player names"):

1. **Tag → id.** Look the tag up in a case-insensitive map built from
   `players.json` (`player_tag` and `id`, plus an optional `aliases` list we can add
   to the roster). Unresolvable ⇒ reject the row.
2. **Characters.** `char_a`/`char_b` canonicalized via the same alias maps as the
   online pipeline; an unknown non-blank character ⇒ reject (so we never mis-attribute
   a matchup). Blank is fine (`null`).
3. **Scores.** Must parse as non-negative integers, not both zero. Otherwise reject.
4. **Date.** Must parse as a valid `YYYY-MM-DD`. Otherwise reject.

Rejected rows are **not dropped silently** — they go to `matches.json.rejected[]`
with `rowNumber`, a human `reason`, and the `raw` cells, and `rejectedCount` is set.
The site can show a small "N rows need fixing" admin hint; the crew fixes the sheet
and the next run clears it. Valid rows always produce a clean `matches.json`.

**Deterministic ids:** within a date, rows are numbered in sheet order →
`id = \`${date}#${indexOnDate}\``. Stable across re-ingests as long as earlier rows
on that date aren't reordered (append-only usage keeps ids stable).

## 4.4 Deriving `stats.json` (`scripts/match-sync/stats.ts`)

Pure function `deriveStats(matches: Match[]): StatsFile`. **Games, not sets**
(brief §5.3): a `3–1` set adds 3 to the winner's game count and 1 to the loser's.

```
for each match m:
    # head-to-head (person vs person), key ordered so idA < idB
    [lo, hi] = sort([m.playerA, m.playerB])
    h2h[`${lo}|${hi}`].gamesLo += (m games won by lo)
    h2h[`${lo}|${hi}`].gamesHi += (m games won by hi)
    h2h[...].setsLo/setsHi += 1 to whoever won more games (ties → neither)

    # per-player rollups
    for side in {A,B}:
        p = players[m[side]]
        p.gameWins   += m.score(side)
        p.gameLosses += m.score(other)
        p.setWins/Losses += set outcome
        if m.char(side): p.charUsage[char] += m.score(side)+m.score(other)  # games played
    # optional per-character matchup (charMatchups), same idea keyed with characters
compute winRate = gameWins / (gameWins+gameLosses); mostPlayedCharacter = argmax(charUsage)
```

`deriveStats` is unit-tested (Vitest) with fixture matches — it's the "settles
arguments" math (brief §9), so it must be correct and covered.

## 4.5 Workflow (`.github/workflows/match-sync.yml`)

```yaml
name: match-sync
on:
  schedule:
    - cron: '0 */6 * * *'      # every 6h (brief §7 "how often to re-ingest")
  workflow_dispatch: {}
permissions:
  contents: write
concurrency:
  group: match-sync
  cancel-in-progress: false
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsx scripts/match-sync/index.ts
      - name: Commit if changed
        run: |
          git config user.name  "ctown-bot"
          git config user.email "ctown-bot@users.noreply.github.com"
          git add public/data/matches.json public/data/stats.json
          if ! git diff --cached --quiet; then
            git commit -m "data: sync matches $(date -u +%FT%TZ)"
            git push
          else
            echo "No changes."
          fi
```

> **📌 Decision — re-ingest every 6 hours.** Resolves brief §7 "how often to
> re-ingest the match sheet." Frequent enough that a just-logged set shows up the
> same evening; infrequent enough to stay a light job. `workflow_dispatch` lets the
> crew force an immediate refresh after logging a big session. Bump to hourly if the
> crew wants near-live updates — it's a one-line cron change.

## 4.6 Recent-matches feed

`matches.json` is already date-sorted; the site slices the most recent N (default 20,
brief §5.2) for the home-page feed. No extra derived file needed.
