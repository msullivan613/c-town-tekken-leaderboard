# 6. Decision log & how the design evolved

This maps the open items in [brief §7](../PROJECT-BRIEF.md) to decisions (with the spec
section that implements them) and records the **two big pivots** that happened after the
brief/first-draft spec: the data source moved off EWGF, and the project became multi-site.

## 6.1 Decisions made in this spec

| Brief §7 item | Decision | Where |
|---|---|---|
| Data storage / snapshot location | JSON in **`sites/<slug>/data/`**, shipped with the build; history append-only as per-pair `[date,value]` tuple series, bounded + rolled to yearly archives past `maxDaysInline` | §1.1, §1.5, §2.6 |
| Multi-site | One codebase renders N sites via `SITE`; layered config (`config/config.json` + `sites/<slug>/config.json`, deep-merged) | §1.2, §1.4 |
| Language / plumbing | One TypeScript codebase; pipelines run via `tsx` sharing `src/types` + `src/data` | §1.3 |
| Routing on GitHub Pages | HashRouter (zero-config, refresh-safe) | §1.3 |
| Tunables | Layered `config.json` read by app (baked in) + pipelines (runtime) | §1.4 |
| Character identity across sources | Canonical `CharacterSlug`; `fromCharacterId` (tknow) + name-based (ewgf/Wavu); unmapped ⇒ warn & skip | §2.1, §7.6 |
| Play threshold | `max(tknow rankedGames, Wavu games) ≥ 10` **and** has an assigned rank (config) | §1.4, §2.4 |
| Peak rank source | Running max of `rankTier` we observe across snapshots; hand-set `players.json` value as fallback; per pair, rolled up per player | §2.4 |
| Player key vs display | Internal immutable `id` is canonical; `player_tag` is display-only; battle `polarisId` resolves to `id` | §2.3, §4.2 |
| Players ⇄ Pairs toggle | Default **Players**; "best pair" by MMR (fallback rank) | §1.4, §5.3 |
| Default board sort | Config-driven (currently **MMR**), other signal as tiebreak; header toggles | §5.3 |
| Match source | **tknow battles** (quick/ranked) + **ewgf** (group/player, opt-in); no manual entry | §4, §8 |
| Match dedup / id | tknow real `battle_id`; ewgf synthetic `ewgf:{lo}-{hi}:{epoch}`; both orientation-independent | §2.8, §4.2, §8 |
| Match retention | Crew kept forever; non-crew feed bounded (`recentWindowDays`/`feedMaxPerPlayer`), pruned matches **archived** to `matches.<year>.json`, not dropped | §2.8, §4.4 |
| Head-to-head unit | **Matches won** (person-vs-person, crew only); rounds + `charMatchups` kept | §2.9, §4.3 |
| Head-to-head availability | **Per-site opt-in** (`headToHead.enabled` + `EWGF_API_KEY`) — the only source of crew custom-lobby matches; UI hides the feature when off | §5.6, §8 |
| Refresh cadence | One job **every 6h** does ranks/MMR **and** matches, per site; `workflow_dispatch` too | §3.8, §4 |
| Commit noise | Deterministic serialization + commit-only-if-changed gate | §2, §3.7 |
| Frontend load weight | Split core (players/ranks/glicko, app-wide) vs heavy (matches/stats/history, lazy) files | §5.2 |
| MMR source shape | Wavu = HTML scrape; store `sigmaSquared` + `confidence` bucket (not RD/volatility) | §7.3, §2.5 |
| Alerting | Failed Actions run → GitHub emails owner (v1, $0); Discord is a stretch | §3.9 |

## 6.2 The two pivots (post-research)

### Pivot 1 — data source: EWGF → tknow.gg (+ Wavu, + opt-in ewgf)

The first spec draft (and files 2–4's original text) treated EWGF's public API as the
primary source for both ranks and matches. Research killed that: EWGF's free tier caps
at the **last 50 battles (24h delayed)** and its profile endpoint (Pro-only) exposes
only the *main* character's rank — insufficient for full per-character rank + match
history. See the **🛑 SUPERSEDED** banner in [§7.2](./07-external-api-reference.md#72-ewgf--recent-battles-drives-ranks--matches).

Resolution (current):
1. **Ranks + quick/ranked matches → tknow.gg** ([§7.9](./07-external-api-reference.md#79-tknowgg--the-live-source-for-ranks--matches-verified-2026-07-01)):
   free, un-gated (soft `Origin`/`Referer` check, **no API key**), real per-character dan
   ranks + lifetime games, and paginated `battle_id`-keyed match history.
2. **MMR → Wavu Wank** ([§7.3](./07-external-api-reference.md#73-wavu-wank--glicko-2-mmr-μ--σ2)):
   HTML scrape, anonymous, publishes μ/σ² + confidence buckets.
3. **Group/player (custom-lobby) matches → ewgf** ([§8](./08-ewgf-group-player-matches.md)):
   tknow surfaces only quick/ranked, so the *deliberate* crew-vs-crew lobby fights come
   from ewgf's public API — **opt-in per site** (`headToHead.enabled` + `EWGF_API_KEY`),
   because its free tier is ~100 req/day. So `ewgf.ts` and `EWGF_API_KEY` do exist, but
   in a **narrow, optional** role — not as the primary source the old spec described.

`EWGF_API_KEY` is therefore no longer "the one true blocking external dependency" the
first draft framed it as: the core site (ranks, MMR, quick/ranked matches) needs **no**
key at all; the key only unlocks the H2H feature for a site that opts in.

### Pivot 2 — single-site → multi-site

The crew grew past one group. Rather than fork the repo, the app was parameterized by a
`SITE` env var with layered config and per-site `data/` folders (§1.2). Data moved from
`public/data/` to `sites/<slug>/data/`; `public/` now holds only shared static assets.

## 6.3 Explicitly deferred (brief §3 non-goals / §8 stretch)

Not in scope: accounts/auth, public ladder, in-browser submit, multi-game, brackets,
mobile app. Stretch (post-v1): crew stats dashboard, rivalry-of-the-week, tournament
page, badges, Discord integration, extra filters. The schemas here don't preclude any
of them — e.g. `stats.json` already carries the data a dashboard would need.
</content>
