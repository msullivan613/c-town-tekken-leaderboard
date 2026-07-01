# 6. Decision log & remaining open questions

This maps every open item in [brief §7](../PROJECT-BRIEF.md) to a decision (with the
spec section that implements it) or flags what genuinely still needs external
confirmation.

## 6.1 Decisions made in this spec

| Brief §7 item | Decision | Where |
|---|---|---|
| Data storage / snapshot location | JSON in `public/data/`, shipped with the build; history append-only as per-pair `[date,value]` tuple series; roll to yearly files past `maxDaysInline` | §1.1, §2.6 |
| Language / plumbing | One TypeScript codebase; pipelines run via `tsx` sharing `src/types` | §1.2 |
| Routing on GitHub Pages | HashRouter (zero-config, refresh-safe) | §1.2 |
| Tunables | Single `config/config.json` read by app + pipelines | §1.4 |
| Character identity across EWGF/Wavu | Canonical `CharacterSlug` + provider alias maps; unmapped ⇒ warn & skip | §2.1 |
| Play threshold | `rankedGames ≥ 10` **and** has an assigned rank (config) | §1.4, §2.4 |
| Peak rank source | Derive `max(tier)` from EWGF per-character peaks; hand-set `players.json` value as fallback; tracked per pair, rolled up per player | §2.4 |
| Player key vs display | Internal immutable `id` is canonical everywhere; `player_tag` is display-only; sheet tags resolve to `id` | §2.3, §4.3 |
| Players ⇄ Pairs toggle | Default **Players**; "best pair" by MMR (fallback rank); toggle lives on the leaderboard | §1.4, §5.3 |
| Default board sort | In-game **rank** desc, MMR tiebreak; header toggles to MMR sort | §5.3 |
| Sheet auth | Public "Publish to web" CSV; Sheets-API service account documented as fallback | §4.1 |
| Sheet granularity | One row per **set** with set score; games derived | §4.2, §4.4 |
| Typo'd rows | Rejected to `matches.json.rejected[]` with reason; surfaced in UI; never silently dropped | §4.3, §5.7 |
| Head-to-head unit | Individual **games** from set scores; person-vs-person default; `charMatchups` also computed | §2.9, §4.4 |
| Refresh cadence | Ranks/MMR daily (08:00 UTC); match sheet every 6h; both have `workflow_dispatch` | §3.6, §4.5 |
| Commit noise | Deterministic serialization + commit-only-if-changed gate | §2, §3.5, §4.5 |
| Alerting | Failed Actions run → GitHub emails owner (v1, $0); Discord is a stretch | §3.7 |
| **EWGF access** (post-research) | Gated API → `EWGF_API_KEY` Actions secret; graceful degrade to Wavu-only MMR if absent | §7.4, §1.6 |
| **In-game rank encoding** (post-research) | `currentSeasonDanRank` int → verified `rankOrderMap`; `tier` = normalized dan int | §7.5, §2.2 |
| **Peak rank** (revised) | EWGF has no all-time peak → accumulate running max over our snapshots + roster fallback | §7.2, §2.4 |
| **MMR source shape** (post-research) | Wavu = HTML scrape; store `sigmaSquared` + `confidence` bucket (not RD/volatility) | §7.3, §2.5 |
| **Character keying** (simplified) | Both providers share display names → name⇄slug, no alias maps | §7.6, §2.1 |

## 6.2 External API research — DONE (see file 7)

The spike is complete. [`07-external-api-reference.md`](./07-external-api-reference.md)
records the **verified** EWGF + Wavu contracts, rank map, character list, and DOM
structure, observed live via the crew's own account (`3fee-J699-M7An`). Resolutions:

1. **EWGF API** — `GET https://api.ewgf.gg/player-stats/{polarisId}` → `PlayerDTO`;
   in-game rank = `currentSeasonDanRank` (int) via the verified `rankOrderMap`;
   `rankedGames = wins + losses`. ✅ *Except:* it **requires an API key** — see the
   one remaining action item below.
2. **Wavu Wank** — no per-player JSON; `?_format=json` returns HTML. Scrape the
   profile page's stable `.rating-group`/`.rating` DOM; it publishes **μ** and **σ²**
   and buckets characters into Leaderboard/Unqualified/Provisional itself. Anonymous,
   ToS-respecting. ✅
3. **`tekken_id` lookup** — `GET /player-stats/search?query=<tag>` (gated); manual
   helper `resolve-id.ts`. ✅
4. **Character roster** — verified `characterIdMap`; both providers share names, so no
   alias maps needed. ✅

### The one true remaining external dependency

**Obtain `EWGF_API_KEY`** (EWGF is fully gated — every endpoint 401s). Either request
a low-volume read key from the EWGF team (keeps $0), or ship **MMR-only v1** (Wavu,
no key) and add in-game rank once a key is granted. The pipeline degrades gracefully
either way (§7.4). *This is a human/business action, not a coding task.*

## 6.3 Explicitly deferred (brief §3 non-goals / §8 stretch)

Not in v1: accounts/auth, public ladder, in-browser submit, multi-game, brackets,
mobile app. Stretch (post-v1): crew stats dashboard, rivalry-of-the-week, tournament
page, badges, Discord integration, extra filters. The schemas here don't preclude
any of them — e.g. `stats.json` already carries the data a dashboard would need.

## 6.4 Suggested build order

1. Scaffold Vite + TS + Tailwind + HashRouter; `config.json`; shared `src/types`.
2. Hand-write a small `players.json` + fixture `ranks/glicko/matches` JSON so the
   frontend can be built against real shapes immediately.
3. Build the leaderboard (§5.3) and profiles (§5.5) against fixtures.
4. Implement `ewgf.ts` / `wavu.ts` against the **verified** contracts in file 7 +
   the `online-stats` pipeline; wire `rankhistory`/`mmrhistory`. (Secure
   `EWGF_API_KEY` first, or build Wavu-only and add EWGF later.)
5. Implement `match-sync` (`sheet.ts` + `stats.ts`); unit-test `deriveStats`.
6. Add the three workflows; verify commit-if-changed and the deploy trigger.
7. Design pass (frontend-design skill): tokens, palette, rank iconography, branding.
