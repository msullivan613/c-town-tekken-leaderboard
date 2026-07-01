// Build matches.json from EWGF battles (spec §4). Pure + unit-tested.
//
// Each EWGF BattleDTO is one match to 3 rounds. A crew-vs-crew battle appears in
// BOTH players' battle lists, so we dedup by a synthetic id. Crew matches are
// kept forever (head-to-head); non-crew matches are kept as a rolling recent
// window (activity feed) bounded by config.
import { fromCharacterId } from '@/data/characters';
import { rankFromDanRank } from '@/data/ranks';
import type { BattleDTO } from './ewgf';
import type { AppConfig, Match, MatchSide, MatchType } from '@/types/data-files';
import type { Player } from '@/types/domain';

const BATTLE_TYPE: Record<number, MatchType> = {
  1: 'quick',
  2: 'ranked',
  3: 'group',
  4: 'player',
};

function undash(id: string): string {
  return id.replaceAll('-', '');
}

/** Parse EWGF's "MM/dd/yyyy HH:mm:ss UTC" (seconds optional) → ISO-8601. */
export function parseEwgfDate(date: string): string | null {
  const m = date.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min, ss] = m;
  const ms = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    ss ? Number(ss) : 0,
  );
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
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
  characterId: number,
  danRank: number | null,
): MatchSide {
  const player = polarisId ? roster.get(undash(polarisId)) : undefined;
  return {
    playerId: player?.id ?? null,
    name,
    polarisId,
    character: fromCharacterId(characterId),
    rank: rankFromDanRank(danRank).slug,
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
  battles: BattleDTO[],
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
    const playedAt = parseEwgfDate(b.date);
    if (!playedAt) continue;
    const a = makeSide(roster, b.player1Name, b.player1PolarisId, b.player1CharacterId, b.player1DanRank);
    const side2 = makeSide(roster, b.player2Name, b.player2PolarisId, b.player2CharacterId, b.player2DanRank);
    if (!a.playerId && !side2.playerId) continue; // must involve a tracked player
    const epoch = Math.floor(Date.parse(playedAt) / 1000);
    const id = `${b.player1PolarisId}:${b.player2PolarisId}:${epoch}`;
    byId.set(id, {
      id,
      playedAt,
      battleType: BATTLE_TYPE[b.battleType] ?? null,
      a,
      b: side2,
      roundsA: b.player1RoundsWon,
      roundsB: b.player2RoundsWon,
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
