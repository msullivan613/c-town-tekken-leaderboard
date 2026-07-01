// Shape of every public/data/*.json file (spec §2). Imported by both the app and
// the pipeline scripts so a schema change is a compile error in both places.
import type {
  CharacterSlug,
  Platform,
  Player,
  WavuConfidence,
} from './domain';

export const SCHEMA_VERSION = 1 as const;

// ── players.json (§2.3) ──────────────────────────────────────────────────────
export interface PlayersFile {
  schemaVersion: 1;
  players: Player[];
}

// ── ranks.json (§2.4) ────────────────────────────────────────────────────────
export interface RankPair {
  pairId: string; // `${tekken_id}:${character}`
  playerId: string;
  tekken_id: string;
  character: CharacterSlug;
  rank: string | null; // rank slug (§2.2)
  rankTier: number | null; // ordinal cache for sorting
  rankedGames: number;
  region: string | null;
  characterPeakRank: string | null; // running max we accumulate (§2.4)
  lastSeen: string | null; // ISO-8601 UTC
}
export interface RanksFile {
  schemaVersion: 1;
  source: 'ewgf';
  generatedAt: string;
  pairs: RankPair[];
}

// ── glicko.json (§2.5) ───────────────────────────────────────────────────────
export interface GlickoPair {
  pairId: string;
  playerId: string;
  character: CharacterSlug;
  rating: number | null; // Wavu μ, or null if no data
  sigmaSquared: number | null; // Wavu σ² (variance)
  confidence: WavuConfidence;
  provisional: boolean; // confidence === 'provisional'
  games: number;
  lastUpdated: string | null; // ISO-8601 UTC
}
export interface GlickoFile {
  schemaVersion: 1;
  source: 'wavu';
  generatedAt: string;
  pairs: GlickoPair[];
}

// ── rankhistory.json / mmrhistory.json (§2.6 / §2.7) ─────────────────────────
export type HistoryPoint = [date: string, value: number];
export interface HistorySeries {
  playerId: string;
  character: CharacterSlug;
  points: HistoryPoint[];
}
export interface HistoryFile {
  schemaVersion: 1;
  source: 'ewgf' | 'wavu';
  updatedAt: string;
  series: Record<string, HistorySeries>; // keyed by pairId
}

// ── matches.json (§2.8) — gathered from EWGF battles ─────────────────────────
// Tekken 8 online match type (EWGF's battle-type taxonomy). Offline is not tracked.
export type MatchType = 'quick' | 'ranked' | 'player' | 'group' | null;

/** One side of a match. `playerId` is set iff the side is a tracked crew member;
 *  otherwise the side is an external opponent identified by name only. */
export interface MatchSide {
  playerId: string | null;
  name: string; // EWGF display name
  polarisId: string;
  character: CharacterSlug | null;
  rank: string | null; // rank slug from danRank
}

/** One EWGF battle = one match played to 3 rounds. */
export interface Match {
  id: string; // deterministic: `${p1Polaris}:${p2Polaris}:${epochSeconds}`
  playedAt: string; // ISO-8601 UTC
  battleType: MatchType;
  a: MatchSide;
  b: MatchSide;
  roundsA: number;
  roundsB: number;
  winner: 'a' | 'b';
  crew: boolean; // both sides are roster players
}
export interface MatchesFile {
  schemaVersion: 2;
  source: 'ewgf';
  generatedAt: string;
  crewMatchCount: number;
  feedMatchCount: number;
  matches: Match[];
}

// ── stats.json (§2.9) — derived from matches.json ────────────────────────────
export interface HeadToHeadRecord {
  matchesA: number; // matches won by the lexicographically-first id
  matchesB: number;
  roundsA: number; // rounds won (drill-down)
  roundsB: number;
}
export interface PlayerStats {
  totalMatches: number;
  matchWins: number;
  matchLosses: number;
  winRate: number; // over tracked matches
  charUsage: Record<string, number>; // matches played per character
  mostPlayedCharacter: CharacterSlug | null;
}
export interface CharMatchupRecord {
  matchesA: number;
  matchesB: number;
}
export interface StatsFile {
  schemaVersion: 2;
  generatedAt: string;
  basedOnMatchCount: number;
  headToHead: Record<string, HeadToHeadRecord>; // key "idA|idB", idA < idB (crew only)
  players: Record<string, PlayerStats>;
  charMatchups: Record<string, CharMatchupRecord>; // key "idA:charA|idB:charB" (crew)
}

// ── config/config.json (§1.4) ────────────────────────────────────────────────
export interface AppConfig {
  pairThreshold: {
    minRankedGames: number;
    requireAssignedRank: boolean;
  };
  leaderboard: {
    defaultView: 'players' | 'pairs';
    defaultSort: 'rank' | 'mmr';
    bestPairMetric: 'mmr' | 'rank';
  };
  matches: {
    recentWindowDays: number; // non-crew matches older than this are pruned
    feedMaxPerPlayer: number; // cap of non-crew matches kept per player
  };
  sources: {
    ewgfBaseUrl: string;
    ewgfPlayerPath: string;
    wavuProfileUrl: string;
  };
  wavu: { userAgent: string };
  history: {
    granularity: 'daily';
    maxDaysInline: number;
  };
}

export type { Platform };
