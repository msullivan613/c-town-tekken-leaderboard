import { describe, it, expect } from 'vitest';
import { deriveStats } from '../scripts/online-stats/stats';
import type { Match, MatchSide } from '@/types/data-files';

const NOW = '2026-06-30T08:00:00.000Z';

function side(playerId: string | null, name: string, character: string | null): MatchSide {
  return { playerId, name, polarisId: name, character, rank: null };
}
function match(o: {
  id: string;
  a: MatchSide;
  b: MatchSide;
  roundsA: number;
  roundsB: number;
  winner: 'a' | 'b';
}): Match {
  return {
    id: o.id,
    playedAt: `2026-06-29T00:00:00Z`,
    battleType: 'ranked',
    a: o.a,
    b: o.b,
    roundsA: o.roundsA,
    roundsB: o.roundsB,
    winner: o.winner,
    crew: o.a.playerId != null && o.b.playerId != null,
  };
}

const MATT = side('matt', 'SugarFree', 'jin');
const NICK = side('nick', 'NickTheKnife', 'kazuya');
const ALEX = side('alex', 'AlxDestroyer', 'king');
const RANDO = side(null, 'KO_King_88', 'king');

const MATCHES: Match[] = [
  match({ id: '1', a: MATT, b: NICK, roundsA: 3, roundsB: 1, winner: 'a' }),
  match({ id: '2', a: NICK, b: MATT, roundsA: 3, roundsB: 2, winner: 'a' }), // nick beats matt
  match({ id: '3', a: ALEX, b: NICK, roundsA: 3, roundsB: 2, winner: 'a' }),
  match({ id: '4', a: MATT, b: RANDO, roundsA: 3, roundsB: 2, winner: 'a' }), // vs external
];

describe('deriveStats (matches-won)', () => {
  const stats = deriveStats(MATCHES, NOW);

  it('counts head-to-head by matches won, with rounds, crew-only, key idA<idB', () => {
    // matt vs nick: 1 win each; rounds matt 3+2=5, nick 1+3=4
    expect(stats.headToHead['matt|nick']).toEqual({
      matchesA: 1,
      matchesB: 1,
      roundsA: 5,
      roundsB: 4,
    });
    // alex beat nick once
    expect(stats.headToHead['alex|nick']).toEqual({
      matchesA: 1,
      matchesB: 0,
      roundsA: 3,
      roundsB: 2,
    });
  });

  it('excludes external (non-crew) matches from head-to-head', () => {
    // matt-vs-random must not create an h2h entry
    expect(Object.keys(stats.headToHead)).not.toContain('KO_King_88|matt');
    expect(Object.keys(stats.headToHead).length).toBe(2);
  });

  it('rolls up per-player match record over all tracked matches (incl. external)', () => {
    expect(stats.players.matt).toMatchObject({
      totalMatches: 3, // vs nick x2 + vs random
      matchWins: 2,
      matchLosses: 1,
      winRate: 0.667,
      mostPlayedCharacter: 'jin',
    });
    expect(stats.players.matt.charUsage).toEqual({ jin: 3 });
    expect(stats.players.nick).toMatchObject({ matchWins: 1, matchLosses: 2 });
  });

  it('computes per-character matchups (crew) keyed by ordered id:char tokens', () => {
    expect(stats.charMatchups['matt:jin|nick:kazuya']).toEqual({
      matchesA: 1,
      matchesB: 1,
    });
    expect(stats.charMatchups['alex:king|nick:kazuya']).toEqual({
      matchesA: 1,
      matchesB: 0,
    });
  });

  it('reports basedOnMatchCount over all matches', () => {
    expect(stats.basedOnMatchCount).toBe(4);
  });
});
