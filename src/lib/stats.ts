// Read helpers for stats.json keys (§2.9). Keys are ordered so idA < idB
// lexicographically; these normalize lookups from the caller's perspective.
// Head-to-head is counted by matches won (rounds kept for drill-down).
import type { StatsFile, HeadToHeadRecord } from '@/types/data-files';

export interface DirectedH2H {
  matches: number; // matches `me` won
  oppMatches: number; // matches opponent won
  rounds: number; // rounds `me` won
  oppRounds: number;
}

export function h2hKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Head-to-head from `me`'s perspective vs `opp`, or null if never played. */
export function directedH2H(
  stats: StatsFile | null,
  me: string,
  opp: string,
): DirectedH2H | null {
  if (!stats) return null;
  const rec = stats.headToHead[h2hKey(me, opp)];
  if (!rec) return null;
  const meIsA = me < opp;
  return meIsA
    ? { matches: rec.matchesA, oppMatches: rec.matchesB, rounds: rec.roundsA, oppRounds: rec.roundsB }
    : { matches: rec.matchesB, oppMatches: rec.matchesA, rounds: rec.roundsB, oppRounds: rec.roundsA };
}

export function rawH2H(
  stats: StatsFile | null,
  a: string,
  b: string,
): HeadToHeadRecord | null {
  if (!stats) return null;
  return stats.headToHead[h2hKey(a, b)] ?? null;
}
