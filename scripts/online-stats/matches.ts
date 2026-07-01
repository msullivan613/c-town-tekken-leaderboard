// Build matches.json from tknow battles (spec §4). Pure + unit-tested.
//
// Each tknow match carries a real `battle_id`, so a crew-vs-crew battle that
// appears in both players' feeds dedups exactly on that id (no synthetic key).
// tknow already canonicalizes each battle's orientation (p1.polarisId ≤
// p2.polarisId), so the two feeds yield an identical Match. Crew matches are kept
// forever (head-to-head); non-crew matches are a rolling recent window (activity
// feed) bounded by config.
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

  // Retention: crew matches kept forever; non-crew bounded by window + per-player cap.
  const cutoff = now.getTime() - config.matches.recentWindowDays * 86_400_000;
  const crew: Match[] = [];
  const feedByPlayer = new Map<string, Match[]>();
  for (const m of byId.values()) {
    if (m.crew) {
      crew.push(m);
      continue;
    }
    if (Date.parse(m.playedAt) < cutoff) continue;
    const key = crewSideId(m);
    if (!key) continue;
    (feedByPlayer.get(key) ?? feedByPlayer.set(key, []).get(key)!).push(m);
  }

  const feed: Match[] = [];
  for (const list of feedByPlayer.values()) {
    list.sort((x, y) => Date.parse(y.playedAt) - Date.parse(x.playedAt));
    feed.push(...list.slice(0, config.matches.feedMaxPerPlayer));
  }

  const matches = [...crew, ...feed].sort(
    (x, y) => Date.parse(x.playedAt) - Date.parse(y.playedAt) || x.id.localeCompare(y.id),
  );

  return { matches, crewMatchCount: crew.length, feedMatchCount: feed.length };
}
