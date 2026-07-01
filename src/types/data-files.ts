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

// ── matches.json (§2.8) ──────────────────────────────────────────────────────
// Tekken 8 online match type (matches EWGF's battle-type taxonomy). Offline is
// intentionally not tracked.
export type MatchType = 'quick' | 'ranked' | 'player' | 'group' | null;
export interface Match {
  id: string; // `${date}#${indexOnDate}`
  date: string; // YYYY-MM-DD (day the set was played; used for grouping/ids)
  playedAt: string | null; // ISO-8601 UTC when the set concluded; null if unknown
  playerA: string; // resolved player id
  playerB: string;
  charA: CharacterSlug | null;
  charB: CharacterSlug | null;
  scoreA: number; // games won by A
  scoreB: number; // games won by B
  matchType: MatchType;
}
export interface RejectedRow {
  rowNumber: number;
  reason: string;
  raw: Record<string, string>;
}
export interface MatchesFile {
  schemaVersion: 1;
  source: 'google-sheet';
  generatedAt: string;
  rowCount: number;
  rejectedCount: number;
  matches: Match[];
  rejected: RejectedRow[];
}

// ── stats.json (§2.9) ────────────────────────────────────────────────────────
export interface HeadToHeadRecord {
  gamesA: number; // won by the lexicographically-first id
  gamesB: number;
  setsA: number;
  setsB: number;
}
export interface PlayerStats {
  totalGames: number;
  gameWins: number;
  gameLosses: number;
  gameWinRate: number;
  totalSets: number;
  setWins: number;
  setLosses: number;
  charUsage: Record<string, number>; // games played per character
  mostPlayedCharacter: CharacterSlug | null;
}
export interface CharMatchupRecord {
  gamesA: number;
  gamesB: number;
}
export interface StatsFile {
  schemaVersion: 1;
  generatedAt: string;
  basedOnMatchCount: number;
  headToHead: Record<string, HeadToHeadRecord>; // key "idA|idB", idA < idB
  players: Record<string, PlayerStats>;
  charMatchups: Record<string, CharMatchupRecord>; // key "idA:charA|idB:charB"
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
  sheet: { csvUrl: string };
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
