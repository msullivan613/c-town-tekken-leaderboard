import { describe, it, expect } from 'vitest';
import { deriveStats } from '../scripts/match-sync/stats';
import type { Match } from '@/types/data-files';

const NOW = '2026-06-30T12:00:01Z';

// Mirrors the committed fixtures in public/data (matches.json ⇒ stats.json).
const FIXTURE: Match[] = [
  { id: '2026-06-28#0', date: '2026-06-28', playerA: 'matt', playerB: 'alex', charA: 'jin', charB: 'king', scoreA: 3, scoreB: 1, matchType: 'ranked' },
  { id: '2026-06-28#1', date: '2026-06-28', playerA: 'nick', playerB: 'matt', charA: 'kazuya', charB: 'jin', scoreA: 2, scoreB: 3, matchType: 'player' },
  { id: '2026-06-29#0', date: '2026-06-29', playerA: 'alex', playerB: 'nick', charA: 'king', charB: 'kazuya', scoreA: 3, scoreB: 2, matchType: 'ranked' },
  { id: '2026-06-29#1', date: '2026-06-29', playerA: 'matt', playerB: 'dev', charA: 'devil_jin', charB: 'dragunov', scoreA: 3, scoreB: 0, matchType: 'quick' },
  { id: '2026-06-30#0', date: '2026-06-30', playerA: 'nick', playerB: 'alex', charA: 'kazuya', charB: 'king', scoreA: 1, scoreB: 3, matchType: 'group' },
];

describe('deriveStats', () => {
  const stats = deriveStats(FIXTURE, NOW);

  it('counts head-to-head by games, key ordered idA<idB', () => {
    expect(stats.headToHead['alex|matt']).toEqual({ gamesA: 1, gamesB: 3, setsA: 0, setsB: 1 });
    expect(stats.headToHead['matt|nick']).toEqual({ gamesA: 3, gamesB: 2, setsA: 1, setsB: 0 });
    expect(stats.headToHead['alex|nick']).toEqual({ gamesA: 6, gamesB: 3, setsA: 2, setsB: 0 });
    expect(stats.headToHead['dev|matt']).toEqual({ gamesA: 0, gamesB: 3, setsA: 0, setsB: 1 });
  });

  it('rolls up per-player games, sets, win rate, usage', () => {
    expect(stats.players.matt).toMatchObject({
      totalGames: 12,
      gameWins: 9,
      gameLosses: 3,
      gameWinRate: 0.75,
      setWins: 3,
      setLosses: 0,
      mostPlayedCharacter: 'jin',
    });
    expect(stats.players.matt.charUsage).toEqual({ jin: 9, devil_jin: 3 });
    expect(stats.players.alex).toMatchObject({ gameWins: 7, gameLosses: 6, gameWinRate: 0.538 });
    expect(stats.players.nick).toMatchObject({ gameWins: 5, gameLosses: 9, setLosses: 3 });
    expect(stats.players.dev).toMatchObject({ gameWins: 0, gameLosses: 3, gameWinRate: 0 });
  });

  it('computes per-character matchups keyed by ordered id:char tokens', () => {
    expect(stats.charMatchups['alex:king|matt:jin']).toEqual({ gamesA: 1, gamesB: 3 });
    expect(stats.charMatchups['matt:jin|nick:kazuya']).toEqual({ gamesA: 3, gamesB: 2 });
    expect(stats.charMatchups['alex:king|nick:kazuya']).toEqual({ gamesA: 6, gamesB: 3 });
    expect(stats.charMatchups['dev:dragunov|matt:devil_jin']).toEqual({ gamesA: 0, gamesB: 3 });
  });

  it('reports basedOnMatchCount', () => {
    expect(stats.basedOnMatchCount).toBe(5);
  });

  it('handles a tie set (no set awarded, games still count)', () => {
    const tie = deriveStats(
      [{ id: '2026-01-01#0', date: '2026-01-01', playerA: 'a', playerB: 'b', charA: null, charB: null, scoreA: 2, scoreB: 2, matchType: null }],
      NOW,
    );
    expect(tie.headToHead['a|b']).toEqual({ gamesA: 2, gamesB: 2, setsA: 0, setsB: 0 });
    expect(tie.players.a).toMatchObject({ setWins: 0, setLosses: 0, gameWins: 2, gameLosses: 2 });
  });
});
