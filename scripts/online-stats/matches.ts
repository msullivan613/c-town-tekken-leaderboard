// Build matches.json from tknow battles (spec §4). Pure + unit-tested.
//
// Each tknow match carries a real `battle_id`, so a crew-vs-crew battle that
// appears in both players' feeds dedups exactly on that id (no synthetic key).
// tknow already canonicalizes each battle's orientation (p1.polarisId ≤
// p2.polarisId), so the two feeds yield an identical Match. The live feed is a
// rolling recent window for both crew (head-to-head) and non-crew matches; non-crew
// matches are additionally capped per player (activity feed). Matches pruned out of
// that window aren't dropped — they're returned as `archived` for cold storage so no
// raw data is lost, and stats derive over the full set (issues #19, #30).
import type { TknowBattle, TknowBattleSide } from './tknow';
import type { AppConfig, Match, MatchSide } from '@/types/data-files';
import type { Player } from '@/types/domain';

function undash(id: string): string {
  return id.replaceAll('-', '');
}

function rosterByPolaris(players: Player[]): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const p of players) {
    if (p.tekken_id) map.set(undash(p.tekken_id), p);
  }
  return map;
}

function makeSide(roster: Map<string, Player>, s: TknowBattleSide): MatchSide {
  const player = roster.get(s.polarisId);
  return {
    playerId: player?.id ?? null,
    name: s.name,
    polarisId: s.polarisId,
    character: s.character,
    rank: s.rank,
  };
}

/** The tracked crew side of a non-crew match (exactly one side is crew). */
function crewSideId(m: Match): string | null {
  return m.a.playerId ?? m.b.playerId;
}

export interface BuildMatchesResult {
  matches: Match[];
  /** Matches pruned out of the live window this run — crew and non-crew alike aged
   *  past the recent window, plus non-crew over the per-player cap. Rolled into
   *  cold-storage archives by the caller rather than discarded, so stats can span the
   *  full dataset (issues #19, #30). */
  archived: Match[];
  crewMatchCount: number;
  feedMatchCount: number;
}

export function buildMatches(
  battles: TknowBattle[],
  players: Player[],
  priorMatches: Match[],
  config: AppConfig,
  now: Date = new Date(),
): BuildMatchesResult {
  const roster = rosterByPolaris(players);

  // Merge prior + fresh, keyed by battle_id (fresh overwrites with newer data).
  const byId = new Map<string, Match>();
  for (const m of priorMatches) byId.set(m.id, m);

  for (const b of battles) {
    const at = Date.parse(b.battleAt);
    if (!Number.isFinite(at)) continue;
    const a = makeSide(roster, b.p1);
    const side2 = makeSide(roster, b.p2);
    if (!a.playerId && !side2.playerId) continue; // must involve a tracked player
    byId.set(b.battleId, {
      id: b.battleId,
      playedAt: b.battleAt,
      battleType: b.battleType,
      a,
      b: side2,
      roundsA: b.p1.rounds,
      roundsB: b.p2.rounds,
      winner: b.winner === 'p1' ? 'a' : 'b',
      crew: a.playerId != null && side2.playerId != null,
    });
  }

  // Retention: both crew and non-crew matches are bounded by the recent window;
  // non-crew is additionally bounded by a per-player cap. Matches falling outside
  // either bound go to `archived`, not the trash (issues #19, #30).
  const cutoff = now.getTime() - config.matches.recentWindowDays * 86_400_000;
  const crew: Match[] = [];
  const feedByPlayer = new Map<string, Match[]>();
  const archived: Match[] = [];
  for (const m of byId.values()) {
    if (Date.parse(m.playedAt) < cutoff) {
      archived.push(m); // aged past the recent window → archive, don't drop
      continue;
    }
    if (m.crew) {
      crew.push(m);
      continue;
    }
    const key = crewSideId(m);
    /* v8 ignore next -- a non-crew match always has exactly one crew side, so key is never null here; the guard is defensive. */
    if (!key) continue;
    (feedByPlayer.get(key) ?? feedByPlayer.set(key, []).get(key)!).push(m);
  }

  const feed: Match[] = [];
  for (const list of feedByPlayer.values()) {
    list.sort((x, y) => Date.parse(y.playedAt) - Date.parse(x.playedAt));
    feed.push(...list.slice(0, config.matches.feedMaxPerPlayer));
    archived.push(...list.slice(config.matches.feedMaxPerPlayer)); // over cap → archive
  }

  const matches = [...crew, ...feed].sort(sortMatches);
  archived.sort(sortMatches);

  return { matches, archived, crewMatchCount: crew.length, feedMatchCount: feed.length };
}

/** Chronological, id-tiebroken ordering shared by the live feed and the archives so
 *  both serialize deterministically for the commit-if-changed gate. */
function sortMatches(x: Match, y: Match): number {
  return Date.parse(x.playedAt) - Date.parse(y.playedAt) || x.id.localeCompare(y.id);
}

/** The cold-storage archive file name for a given calendar year. Mirrors the
 *  history archives (issue #10); the frontend never fetches these. */
export function matchArchiveName(year: string): string {
  return `matches.${year}.json`;
}

/** Group matches by the calendar year (UTC) of their `playedAt`, so each run's
 *  pruned feed matches land in the right per-year archive. */
export function splitMatchesByYear(matches: Match[]): Map<string, Match[]> {
  const byYear = new Map<string, Match[]>();
  for (const m of matches) {
    const year = m.playedAt.slice(0, 4);
    (byYear.get(year) ?? byYear.set(year, []).get(year)!).push(m);
  }
  return byYear;
}

/** Merge `incoming` matches into `existing` by id (existing wins on collision) and
 *  return a deterministically-sorted list. Used to fold newly-pruned matches into an
 *  archive without disturbing or duplicating ones already there. */
export function mergeMatches(existing: Match[], incoming: Match[]): Match[] {
  const byId = new Map<string, Match>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort(sortMatches);
}
