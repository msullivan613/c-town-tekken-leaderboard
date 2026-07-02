# §8 — Group & player (custom-lobby) matches via ewgf

Resolves issue #3. This is the current, accurate record for how custom-lobby
matches are sourced; it supersedes the older EWGF-as-primary-source discussion in
`spec/07` and the README (see CLAUDE.md — "the docs have drifted").

## The problem

Tekken 8 has four online match types. The game's Polaris server encodes them as
`QUICK=1, RANKED=2, GROUP=3, PLAYER=4`. Our leaderboard cares most about **group**
and **player** matches: those are the custom-lobby fights where crew members
actually play *each other* head-to-head. Until now we tracked none of them.

Why the existing sources can't provide them:

| Source | Provides | Group/player? |
| --- | --- | --- |
| **tknow** (`api.tk8now.pe.kr`) | quick + ranked | **No.** Empirically verified: a sweep of the whole c-town roster (4,199 battles, all game versions) returned only `battle_type` 1 and 2. tknow drops types 3/4. |
| **Wavu Wank** | ranked (Glicko) | No. |
| **ewgf.gg** | all four types | **Yes** — the only viable source. |

## The ewgf public API

ewgf went closed-source (Oct 2025); its internal `api.ewgf.gg/player-stats/*`
endpoints now return `401 {"error":"Unauthorized access."}`. But its **documented
public API** works with a per-account key:

```
GET https://api.ewgf.gg/external/battles/{undashedTekkenId}
Authorization: Bearer <EWGF_API_KEY>
```

Response: `{ _metadata: { rate_limit_remaining, rate_limit_reset, tier }, data: [ battle... ] }`.
A battle row (note: **no battle id**; `battle_type` is a string; character/rank are
display *names*):

```
battle_at (ISO)  battle_type ("GROUP_BATTLE"|"PLAYER_BATTLE"|"QUICK_BATTLE"|"RANKED_BATTLE")
winner (1|2)     game_version  stage_id
p{1,2}_name  p{1,2}_tekken_id (undashed)  p{1,2}_char (name)  p{1,2}_region (name)
p{1,2}_dan_rank (name)  p{1,2}_tekken_power  p{1,2}_rounds_won
```

There is also `/external/profile/{id}` (unused — tknow already covers rank/usage).

### Tiers (free vs Pro)

- **Free** (what we use): the **50 most-recent battles** per player, ~**100
  requests / window**, with a **~24h staleness lag**.
- **Pro** ($10/mo): 100 battles, no delay.

**The free window slides continuously (verified).** The open question was whether
"50 most recent with a 24h delay" meant a *frozen daily snapshot* (bad — would
miss anyone playing >50/day) or a *continuously-sliding feed with a 24h lag*
(fine). A two-poll test 28 min apart on an active player showed the window
advancing (matches added/removed at the boundary) — it slides. Combined with the
6-hourly cron and append-only accumulation, the free tier captures everything
except a player sustaining >50 matches within a single ~6h poll interval. If that
becomes real for someone, options are: poll more often, or switch to Pro. Because
a crew-vs-crew match appears in **both** players' feeds, it only has to survive in
*one* of them to be captured.

## Integration (`scripts/online-stats/ewgf.ts`)

- **Opt-in.** Enabled only when `EWGF_API_KEY` is set (env locally, GitHub Actions
  secret in CI). With no key the pipeline is byte-identical to before.
- **Group/player only.** tknow keeps quick/ranked (real battle ids, no 50-cap);
  ewgf contributes only types 3/4. This avoids double-counting ranked matches from
  two sources with different ids.
- **Synthetic ids.** ewgf rows have no battle id, so we derive a deterministic one:
  `ewgf:{loPolaris}-{hiPolaris}:{epochSeconds}` in canonical orientation
  (`p1.polarisId ≤ p2.polarisId`). The same battle seen from both players' feeds —
  and re-fetched on later runs — collapses to one `Match`. The `ewgf:` prefix
  guarantees no collision with a tknow battle id.
- **Shared normalization.** ewgf battles are emitted as the pipeline's canonical
  `TknowBattle` shape and flow through the *same* `buildMatches` / `deriveStats` as
  tknow battles. Character/rank display names map via the existing
  `fromEwgf` (`canonicalizeCharacter`) and `rankFromName` helpers in `src/data/`.
- **Downstream is already wired.** `MatchType` (`src/types/data-files.ts`) already
  includes `'group'`/`'player'`; `matchTypeLabel`, the MatchesPage type filter, and
  `RecentMatchesStrip` already render them. Retention: crew group/player matches are
  kept forever (head-to-head); vs-outsider ones join the bounded recent feed.
- **Graceful degradation.** Matches rebuild when *either* tknow or ewgf was
  reachable; `buildMatches` merges fresh battles onto `priorMatches` by id, so a
  source being down preserves its previously-committed matches.

## Enabling it

1. Get a free key from ewgf.gg (account → API).
2. **Local:** `EWGF_API_KEY=<key> npm run online-stats`.
3. **CI:** add repo secret `EWGF_API_KEY`; `online-stats.yml` already passes it
   through. Group/player matches appear in `matches.json` on the next run.
