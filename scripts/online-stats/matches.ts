// Build matches.json from EWGF battles (spec §4). Pure + unit-tested.
//
// Each EwgfBattle is one match to 3 rounds. A crew-vs-crew battle appears in
// BOTH players' battle lists with identical orientation, so we dedup by a
// synthetic id. Crew matches are kept forever (head-to-head); non-crew matches
// are kept as a rolling recent window (activity feed) bounded by config.
import { canonicalizeCharacter } from '@/data/characters';
import { rankFromName } from '@/data/ranks';
import type { EwgfBattle } from './ewgf';
import type { AppConfig, Match, MatchSide, MatchType } from '@/types/data-files';
import type { Player } from '@/types/domain';

const BATTLE_TYPE: Record<string, MatchType> = {
  QUICK_BATTLE: 'quick',
  RANKED_BATTLE: 'ranked',
  GROUP_BATTLE: 'group',
  PLAYER_BATTLE: 'player',
};

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

function makeSide(
  roster: Map<string, Player>,
  name: string,
  polarisId: string,
  charName: string,
  danRank: string | null,
): MatchSide {
  const player = polarisId ? roster.get(undash(polarisId)) : undefined;
  return {
    playerId: player?.id ?? null,
    name,
    polarisId: undash(polarisId),
    character: canonicalizeCharacter(charName),
    rank: rankFromName(danRank).slug,
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
  battles: EwgfBattle[],
  players: Player[],
  priorMatches: Match[],
  config: AppConfig,
  now: Date = new Date(),
): BuildMatchesResult {
  const roster = rosterByPolaris(players);

  // Merge prior + fresh, keyed by synthetic id (fresh overwrites with newer data).
  const byId = new Map<string, Match>();
  for (const m of priorMatches) byId.set(m.id, m);

  for (const b of battles) {
    const at = Date.parse(b.battle_at);
    if (!Number.isFinite(at)) continue;
    const playedAt = new Date(at).toISOString();
    const a = makeSide(roster, b.p1_name, b.p1_tekken_id, b.p1_char, b.p1_dan_rank);
    const side2 = makeSide(roster, b.p2_name, b.p2_tekken_id, b.p2_char, b.p2_dan_rank);
    if (!a.playerId && !side2.playerId) continue; // must involve a tracked player
    const epoch = Math.floor(at / 1000);
    const id = `${undash(b.p1_tekken_id)}:${undash(b.p2_tekken_id)}:${epoch}`;
    byId.set(id, {
      id,
      playedAt,
      battleType: BATTLE_TYPE[b.battle_type] ?? null,
      a,
      b: side2,
      roundsA: b.p1_rounds_won,
      roundsB: b.p2_rounds_won,
      winner: b.winner === 1 ? 'a' : 'b',
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
