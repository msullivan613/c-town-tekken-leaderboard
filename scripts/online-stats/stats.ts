// Derive stats.json from matches.json (spec §4.4). Head-to-head is crew-vs-crew,
// counted by MATCHES won (rounds kept for drill-down). Per-player rollups span all
// tracked matches (crew + the recent feed window). Pure + unit-tested.
import type {
  CharMatchupRecord,
  HeadToHeadRecord,
  Match,
  MatchSide,
  PlayerStats,
  StatsFile,
} from '@/types/data-files';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function emptyPlayer(): PlayerStats {
  return {
    totalMatches: 0,
    matchWins: 0,
    matchLosses: 0,
    winRate: 0,
    charUsage: {},
    mostPlayedCharacter: null,
  };
}

export function deriveStats(matches: Match[], generatedAt: string): StatsFile {
  const headToHead: Record<string, HeadToHeadRecord> = {};
  const players: Record<string, PlayerStats> = {};
  const charMatchups: Record<string, CharMatchupRecord> = {};

  const ensurePlayer = (id: string): PlayerStats => (players[id] ??= emptyPlayer());

  for (const m of matches) {
    const winnerSide = m.winner === 'a' ? m.a : m.b;

    // ── per-player rollups (all tracked matches) ────────────────────────────
    for (const side of [m.a, m.b] as MatchSide[]) {
      if (!side.playerId) continue;
      const p = ensurePlayer(side.playerId);
      if (side === winnerSide) p.matchWins += 1;
      else p.matchLosses += 1;
      if (side.character) p.charUsage[side.character] = (p.charUsage[side.character] ?? 0) + 1;
    }

    if (!m.crew || !m.a.playerId || !m.b.playerId) continue;

    // ── head-to-head (crew-vs-crew), key ordered idA < idB ──────────────────
    const aId = m.a.playerId;
    const bId = m.b.playerId;
    const loIsA = aId < bId;
    const lo = loIsA ? aId : bId;
    const hi = loIsA ? bId : aId;
    const rec = (headToHead[`${lo}|${hi}`] ??= {
      matchesA: 0,
      matchesB: 0,
      roundsA: 0,
      roundsB: 0,
    });
    const loRounds = loIsA ? m.roundsA : m.roundsB;
    const hiRounds = loIsA ? m.roundsB : m.roundsA;
    rec.roundsA += loRounds;
    rec.roundsB += hiRounds;
    if (winnerSide.playerId === lo) rec.matchesA += 1;
    else rec.matchesB += 1;

    // ── per-character matchup (crew), keyed by ordered "id:char" tokens ──────
    if (m.a.character && m.b.character) {
      const tokA = `${aId}:${m.a.character}`;
      const tokB = `${bId}:${m.b.character}`;
      const [tlo, thi] = tokA < tokB ? [tokA, tokB] : [tokB, tokA];
      const winnerTok = m.winner === 'a' ? tokA : tokB;
      const cm = (charMatchups[`${tlo}|${thi}`] ??= { matchesA: 0, matchesB: 0 });
      if (winnerTok === tlo) cm.matchesA += 1;
      else cm.matchesB += 1;
    }
  }

  for (const p of Object.values(players)) {
    p.totalMatches = p.matchWins + p.matchLosses;
    p.winRate = p.totalMatches ? round3(p.matchWins / p.totalMatches) : 0;
    let best: string | null = null;
    let bestN = -1;
    for (const [char, n] of Object.entries(p.charUsage)) {
      if (n > bestN) {
        best = char;
        bestN = n;
      }
    }
    p.mostPlayedCharacter = best;
  }

  return {
    schemaVersion: 2,
    generatedAt,
    basedOnMatchCount: matches.length,
    headToHead,
    players,
    charMatchups,
  };
}
