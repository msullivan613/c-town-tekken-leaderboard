# C-Town Tekken Leaderboard — Project Brief

> **Status:** Concept / brainstorm. This document captures the *goal* and *required features*.
> It is intentionally non-technical — detailed specs (data schemas, component design,
> API contracts, workflow YAML) come in a follow-up session.
>
> **Crew name:** Cum Town (a.k.a. "C-Town")
> **Working title:** C-Town Tekken Leaderboard
> **Inspiration:** [LA Tekken Rank Tracker](https://esmond-m.github.io/la-tekken-rank-tracker/)
> ([source](https://github.com/esmond-m/la-tekken-rank-tracker))
>
> **Naming note:** The crew is "Cum Town." The "c-town" repo/URL slug doubles as a
> SFW-safe shorthand for links, page titles, and any place we'd rather not spell it out;
> in-site branding can lean into the full name as much (or as little) as we want. Decide
> the exact tone in the design/branding pass.

---

## 1. Goal

Build a simple, free, always-up-to-date leaderboard site for me and my friends (the
"Cum Town" crew) to track our Tekken 8 ranks and MMR, settle who's actually better than who,
and log the results of our sessions. It should feel like a shared scoreboard for the crew — fun, low-friction,
and self-updating so it doesn't rot.

**Guiding principles**

- **Self-updating.** Online ranks and MMR refresh automatically; nobody should have to babysit the site.
- **Low friction to log matches.** Adding a session result should be as easy as typing a row
  into a spreadsheet — no code, no deploy.
- **Free & serverless.** No hosting bills, no database to maintain, no login system.
- **Crew-first.** Designed for a fixed, small group of friends — not a public ladder. Rivalries
  and bragging rights matter more than global rankings.

---

## 2. What we're borrowing from the inspiration site

The LA tracker nails a clever pattern we want to copy:

- **Static site, dynamic data.** A React + Vite app hosted free on **GitHub Pages**.
- **Scheduled refresh.** A daily **GitHub Action** pulls each player's current online rank
  from the **[EWGF.gg](https://ewgf.gg) API** and writes it to a JSON file in the repo.
- **JSON as the "database."** The site just reads committed JSON files at runtime — no backend.
- **Hand-maintained roster.** A `players.json` file lists each player (tag, platform, main, etc.).

What we're **adding** on top: per-character **Glicko-2 MMR** tracking (from Wavu Wank), the
(player, character) pair model, head-to-head records, local match/session logging, and richer
player profiles — all while staying serverless.

What we are **not** copying: the inspiration site's **frontend / visual design**. We're taking
its *architecture and data approach*, but the look-and-feel, layout, and branding will be our
own — see [§4.1 Design direction](#41-design-direction). The reference is a structural model,
not a visual template.

---

## 3. Non-goals (at least for v1)

- No user accounts, passwords, or auth.
- No public/global ladder or open sign-ups — this is a closed crew.
- No live, in-browser "submit result" button writing to a server.
- No multi-game support — **Tekken 8 only** for now.
- No tournament/bracket tracking in v1 — explicitly deferred (see Stretch ideas).
- No mobile app — responsive web is enough.

---

## 4. Architecture at a glance

Static front end + two automated data pipelines feeding it. Nothing here needs a server.

```
   EWGF.gg API ────┐                              ranks.json
                   ▼┌─────────────────────────┐   rankhistory.json
   Wavu Wank ──────▶│  GitHub Action (daily)  │─▶ glicko.json ──────────┐
   (Glicko-2 MMR)   └─────────────────────────┘   mmrhistory.json       │
                                                                        ▼
   Google Sheet ──▶┌────────────────────────┐                 ┌──────────────────────┐
   (matches only)  │ GitHub Action (on cron)│─▶ matches.json  │  React + Vite site   │
                   │                        │  + derived stats │  on GitHub Pages     │
                   └────────────────────────┘                 │  (reads JSON only)   │
                                                               └──────────────────────┘
                                                                        ▲
   data/players.json (hand-maintained roster) ───────────────────────────┘
```

- **Online-stats pipeline:** one scheduled job → EWGF API (in-game rank) + Wavu Wank
  (Glicko-2 MMR) → `ranks.json` + `glicko.json`, also appending daily points to
  `rankhistory.json` and `mmrhistory.json` so both can be charted over time. No manual upkeep.
  All of these are keyed **per (player, character)** — see the core concept below.
- **Sheet pipeline:** scheduled job → Google Sheet (matches only) → `matches.json` + derived
  head-to-head/session `stats.json`.
- **Roster:** `players.json`, edited by hand when someone joins.

### 4.1 Design direction

The visual design is **ours, from scratch** — the inspiration site informs the data model and
plumbing, not the UI. Detailed art direction happens in a dedicated design pass, but the intent
up front:

- **Don't clone the reference's frontend.** Distinct layout, type, and color — not a re-skin.
- A look that fits the **Cum Town** identity (tone/branding to be decided in the design pass).
- Should feel like a fun crew scoreboard, not a generic data table — leaderboard #1 and active
  rivalries should pop.
- Responsive web; clean on both desktop and phone.
- Open for the design pass: overall vibe (slick/competitive vs. playful/irreverent), color
  palette, whether to lean on Tekken 8's official rank iconography or a custom style.

---

## 5. Required features (v1 / MVP)

> **Core concept — the (player, character) pair is the unit.**
> People play multiple characters, and both EWGF and Wavu track rank tier and MMR *per
> character*. So the fundamental tracked entity is a **(player, character) pair**, not a
> player. Each pair has its own rank and MMR and earns its own leaderboard spot — if one
> person's two characters out-rank everyone else, that person holds **#1 and #2**. Player
> *profiles* (§5.4) then roll all of a person's pairs back up into one page.
>
> **Per-player vs per-pair — a toggle.** Where it applies (the leaderboard especially), a
> toggle switches between:
> - **Players view** — each player appears **once**, represented by their **best pair** (their
>   highest current rank/MMR), with the character noted. "Who's the best person?"
> - **Pairs view** — every qualifying (player, character) pair gets its own row; one person can
>   hold several spots. "What are the best characters being played?"
>
> **Player-level attributes are still first-class.** Each player keeps a declared **main
> character** and a **peak rank** (career-high). These show up as columns/labels regardless of
> which view is active, and on the profile.
>
> **Which pairs count:** pairs are **auto-discovered** from EWGF/Wavu and included once they
> clear a **play threshold** (e.g. a minimum number of ranked games / has an assigned rank),
> so the board reflects characters people actually play, not every one-off pick. Threshold
> value is TBD (§7).

### 5.1 Rank Leaderboard (core)
The landing page. A sortable board of the crew's standings — viewable **per player** or **per
(player, character) pair** via a toggle (below) — ranked by current Tekken 8 stats.

- **Players ⇄ Pairs toggle** (see core concept). *Players* = one row per player by their best
  pair; *Pairs* = one row per (player, character). Pick a sensible default (Players reads as
  the "real" standings; Pairs is the deep cut) — TBD in design.
- Pulls live per-character rank + MMR automatically (daily) from EWGF.gg and Wavu Wank.
- Shows: player tag, **character** (the best pair's character in Players view), current
  in-game rank (with rank icon/color), **Glicko-2 MMR**, **main character**, **peak rank**,
  platform.
- Two ranking signals side by side: Tekken's tier rank *and* the numeric MMR — sortable by
  either, since they don't always agree.
- Clear visual hierarchy so #1 stands out; in Pairs view, visually associate a player's
  multiple rows (e.g. same color/avatar) so it's obvious when one person holds several spots.
- Graceful fallback: if an API has no/garbage data for a pair, show "—" for the missing
  signal rather than breaking the row.
- "Last updated" timestamp so the crew trusts it's fresh.

### 5.2 Match / Session Logging (via Google Sheet)
The crew records the results of local/online sets in a shared Google Sheet; a scheduled
Action ingests it.

- One row per set/match: date, player A, player B, characters used, score (e.g. 3–1),
  optional notes (offline vs online, event name).
- A GitHub Action reads the sheet on a schedule, validates rows against the roster,
  and writes `matches.json`.
- Zero coding required to log a result — just type a row.
- A recent-matches feed on the site (e.g. "last 20 sets played").

### 5.3 Head-to-Head Records (derived from match log)
The "who owns who" feature — the rivalry table.

- **Counted by individual games, not sets.** A set logged as 3–1 contributes 3 wins and
  1 loss to the head-to-head tally — what matters is the per-game record, e.g. "Matt 47–31 Alex".
- For any pair of players, show their lifetime game record against each other.
- A per-player view: their game record vs each other crew member.
- Optionally a full crew grid (matrix) of everyone-vs-everyone.
- Derived entirely from `matches.json` — no separate data entry. (Set scores in the sheet
  are enough to reconstruct the game totals.)

### 5.4 Rich Player Profiles
A page per **player** that rolls up all of that person's (player, character) pairs.

- Profile fields: tag, platform, **main character**, **peak rank** (career-high), socials
  (optional).
- A list of the player's tracked characters, each with its current rank + MMR — the "back-roll"
  of their leaderboard pairs in one place; the main character is flagged.
- Rank history and MMR history over time (charts/sparkline) — **per character**,
  auto-snapshotted daily from EWGF/Wavu, no manual logging. (Optionally a combined view.)
- Their head-to-head records and recent matches.
- Session/character stats derived from the match log (e.g. most-played character, win rate).

### 5.5 MMR (Glicko-2) Tracking
A precise, chess-style numeric rating per (player, character) pair, pulled from
[Wavu Wank](https://wank.wavu.wiki/) — complements Tekken's coarse in-game rank tiers.

- Auto-pulled per (player, character) pair on the daily job (keyed by the same Polaris/
  `tekken_id` as EWGF, plus character).
- Current MMR shown on the leaderboard (§5.1, one value per pair) and player profiles (§5.4).
- **MMR over time, visualized** — a line chart of each pair's rating trajectory, built from
  daily snapshots (`mmrhistory.json`). This is the headline visualization: it makes "who's
  actually climbing" obvious in a way tier ranks don't. (A profile can overlay a player's
  characters on one chart.)
- Optionally surface Glicko-2's rating deviation (confidence) so a provisional/uncertain
  rating reads differently from an established one.
- Graceful fallback if Wavu has no data for a pair (show "—", don't break the row).

---

## 6. Data model sketch (informal)

Enough to frame the spec session; exact schemas TBD.

> All generated stat files below are keyed by **(player, character)** — `tekken_id` + character
> identifies a row. The roster stays player-level; characters are auto-discovered from the APIs.

**`players.json`** (hand-maintained roster — player-level identity)
- `tekken_id` — EWGF/Polaris ID (nullable if unknown)
- `player_tag` — display name
- `platform` — Steam / PlayStation / Xbox
- `main_character` — declared primary character (player-level)
- `peak_rank` — career-high rank (player-level); may be derived from the per-character peaks
  EWGF reports (highest across the player's characters) rather than hand-set — see §7
- `socials` — optional links
- (the *full* character list is auto-discovered per the play threshold, not enumerated here)

**`ranks.json`** (generated daily from EWGF)
- per (player, character): current in-game rank, games/threshold info, last-seen timestamp

**`glicko.json`** (generated daily from Wavu Wank)
- per (player, character): current Glicko-2 rating, optional rating deviation/volatility,
  last-updated

**`mmrhistory.json`** (append-only daily snapshots from Wavu Wank, for the MMR chart)
- per (player, character) per day: Glicko-2 rating at that time

**`rankhistory.json`** (append-only daily snapshots from EWGF, for the rank chart)
- per (player, character) per day: in-game rank at that time (auto-snapshotted, no manual entry)

**Match log → `matches.json`** (generated from Google Sheet)
- `date`, `player_a`, `player_b`, `char_a`, `char_b`, `score_a`, `score_b`,
  `setting` (offline/online), `notes`

**Derived `stats.json`** (computed from matches)
- head-to-head records, per-player win rates, character usage

---

## 7. Open design questions (for the spec session)

- **EWGF API specifics:** what exactly does it expose **per character**, rate limits, how to
  map a player to their `tekken_id`, and which rank value we display.
- **(Player, character) pairs & threshold:** pairs are auto-discovered and shown once they
  clear a play threshold (decided). Open detail: the exact threshold (min ranked games? must
  have an assigned rank? per-region handling?), how character identity is keyed across EWGF and
  Wavu, and how to label a player's pairs in the UI so multiple top spots read clearly.
- **Players ⇄ Pairs toggle:** decided — collapsed *Players* view ranks each player by their
  **best pair**. Open detail: the default view, which other lists (if any) get the toggle, and
  whether "best" is by MMR or by in-game rank when the two disagree.
- **Peak rank source:** keep per-player **peak rank** (decided). Open detail: derive it from
  EWGF's per-character peak data (max across the player's characters) vs. a hand-set roster
  fallback — and whether peak is tracked per pair too.
- **Wavu Wank (MMR) access:** the documented `/api/replays` endpoint is a global firehose, not
  a per-player lookup — confirm the per-player path (likely the profile page with
  `?_format=json`, keyed by Polaris/`tekken_id`), the exact JSON fields (rating, deviation),
  and the `Accept-Encoding` compression requirement + rate-limit behavior. Respect their ToS.
- **History snapshots:** both rank history and MMR history are auto-snapshotted daily from
  EWGF/Wavu (decided — no manual logging). Open detail: where to store the append-only
  snapshots without bloating the repo, and snapshot granularity (daily is fine to start).
- **Google Sheet contract:** the sheet is **matches only**. Exact columns, validation rules,
  how to handle typo'd player names, and how the Action authenticates to read the sheet
  (public CSV export vs API key).
- **Head-to-head:** counted by **individual games** (decided). Open detail: whether the sheet
  logs only the set score (e.g. 3–1, from which game totals are derived) or each game as its own
  row, and how to handle ambiguous/typo'd rows. Also: H2H is **person vs person** by default
  (it's about rivalries), but the match log already records characters — decide whether to also
  offer per-character matchup breakdowns (e.g. "Matt's Jin vs Alex's King").
- **Refresh cadence:** daily for ranks; how often to re-ingest the match sheet.
- **Visual design / branding:** name, color scheme, rank-icon assets, "C-Town" identity.

---

## 8. Stretch ideas (post-v1, not committed)

- Crew-wide stats dashboard (most active player, longest win streak, character popularity).
- "Rivalry of the week" / auto-generated trash talk from recent results.
- Tournament/bracket results page (Braacket-style), like the inspiration site.
- Achievements/badges (first to a rank, beat everyone in the crew, etc.).
- Discord integration (post leaderboard changes or new results to a channel).
- Filters by platform, character, or rank tier.

---

## 9. Success criteria

- The crew checks the site to see current ranks without anyone manually updating it.
- Logging a session takes < 1 minute (just a spreadsheet row).
- Head-to-head records are accurate and settle arguments.
- Total running cost: **$0**.
