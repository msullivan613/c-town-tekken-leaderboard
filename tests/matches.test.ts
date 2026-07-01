import { describe, it, expect } from 'vitest';
import { buildMatches } from '../scripts/online-stats/matches';
import type { TknowBattle, TknowBattleSide } from '../scripts/online-stats/tknow';
import type { AppConfig } from '@/types/data-files';
import type { Player } from '@/types/domain';

const PLAYERS: Player[] = [
  { id: 'matt', tekken_id: '3fee-J699-M7An', player_tag: 'SugarFree', platform: 'steam', main_character: 'jin', peak_rank: null },
  { id: 'nick', tekken_id: '2b3c-4d5e-6f70', player_tag: 'NickTheKnife', platform: 'playstation', main_character: 'kazuya', peak_rank: null },
];
const P = { matt: '3feeJ699M7An', nick: '2b3c4d5e6f70' };
const CFG = { matches: { recentWindowDays: 30, feedMaxPerPlayer: 40 } } as AppConfig;
const NOW = new Date('2026-06-30T08:00:00Z');

function side(o: Partial<TknowBattleSide> & Pick<TknowBattleSide, 'polarisId'>): TknowBattleSide {
  return {
    name: o.polarisId,
    character: 'jin',
    rank: 'tekken_god',
    rounds: 3,
    region: 'Americas',
    ...o,
  };
}

function battle(
  o: Partial<Omit<TknowBattle, 'p1' | 'p2'>> & {
    battleId: string;
    battleAt: string;
    p1: string | TknowBattleSide;
    p2: string | TknowBattleSide;
  },
): TknowBattle {
  const p1 = typeof o.p1 === 'string' ? side({ polarisId: o.p1 }) : o.p1;
  const p2 = typeof o.p2 === 'string' ? side({ polarisId: o.p2, character: 'kazuya', rank: 'tekken_king', rounds: 1 }) : o.p2;
  return {
    battleId: o.battleId,
    battleAt: o.battleAt,
    battleType: o.battleType ?? 'ranked',
    winner: o.winner ?? 'p1',
    p1,
    p2,
  };
}

describe('buildMatches', () => {
  it('dedups a crew battle that appears in both players’ feeds (same battle_id)', () => {
    const b = battle({ battleId: 'BID1', battleAt: '2026-06-29T21:30:00Z', p1: P.matt, p2: P.nick });
    const res = buildMatches([b, { ...b }], PLAYERS, [], CFG, NOW);
    expect(res.matches).toHaveLength(1);
    expect(res.crewMatchCount).toBe(1);
    expect(res.feedMatchCount).toBe(0);
  });

  it('classifies crew vs external and resolves tekken_id → roster id', () => {
    const res = buildMatches(
      [
        battle({ battleId: 'BID1', battleAt: '2026-06-29T21:30:00Z', p1: P.matt, p2: P.nick }),
        battle({ battleId: 'BID2', battleAt: '2026-06-30T02:00:00Z', p1: P.matt, p2: side({ polarisId: 'RANDO123', name: 'Rando' }) }),
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    const crew = res.matches.find((m) => m.crew)!;
    expect([crew.a.playerId, crew.b.playerId].sort()).toEqual(['matt', 'nick']);
    const ext = res.matches.find((m) => !m.crew)!;
    expect(ext.a.playerId).toBe('matt');
    expect(ext.b.playerId).toBeNull();
    expect(ext.b.name).toBe('Rando');
  });

  it('passes character + rank slugs through from the battle sides', () => {
    const res = buildMatches(
      [
        battle({
          battleId: 'BID1',
          battleAt: '2026-06-29T21:30:00Z',
          p1: side({ polarisId: P.matt, character: 'devil_jin', rank: 'fujin' }),
          p2: P.nick,
        }),
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].a.character).toBe('devil_jin');
    expect(res.matches[0].a.rank).toBe('fujin');
    expect(res.matches[0].b.character).toBe('kazuya');
  });

  it('maps the p1/p2 winner to the a/b side', () => {
    const res = buildMatches(
      [battle({ battleId: 'BID1', battleAt: '2026-06-29T21:30:00Z', p1: P.matt, p2: P.nick, winner: 'p2' })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].winner).toBe('b');
  });

  it('carries the battleType through unchanged', () => {
    const res = buildMatches(
      [battle({ battleId: 'BID1', battleAt: '2026-06-29T21:30:00Z', p1: P.matt, p2: side({ polarisId: 'RANDO', name: 'R' }), battleType: 'quick' })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].battleType).toBe('quick');
  });

  it('keeps crew matches forever but prunes non-crew outside the window', () => {
    const res = buildMatches(
      [
        battle({ battleId: 'CREW_OLD', battleAt: '2026-01-01T10:00:00Z', p1: P.matt, p2: P.nick }), // old crew → kept
        battle({ battleId: 'FEED_OLD', battleAt: '2026-01-01T11:00:00Z', p1: P.matt, p2: side({ polarisId: 'RANDO', name: 'R' }) }), // old feed → pruned
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.crewMatchCount).toBe(1);
    expect(res.feedMatchCount).toBe(0);
  });

  it('caps non-crew matches per player at feedMaxPerPlayer', () => {
    const cfg = { matches: { recentWindowDays: 30, feedMaxPerPlayer: 2 } } as AppConfig;
    const feed = [10, 11, 12, 13].map((hh) =>
      battle({
        battleId: `FEED${hh}`,
        battleAt: `2026-06-29T${hh}:00:00Z`,
        p1: P.matt,
        p2: side({ polarisId: `RAND${hh}`, name: `R${hh}` }),
      }),
    );
    const res = buildMatches(feed, PLAYERS, [], cfg, NOW);
    expect(res.feedMatchCount).toBe(2);
  });

  it('merges with prior matches (append-only crew history)', () => {
    const first = buildMatches(
      [battle({ battleId: 'BID_A', battleAt: '2026-06-28T20:00:00Z', p1: P.matt, p2: P.nick })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    const second = buildMatches(
      [battle({ battleId: 'BID_B', battleAt: '2026-06-29T20:00:00Z', p1: P.matt, p2: P.nick })],
      PLAYERS,
      first.matches,
      CFG,
      NOW,
    );
    expect(second.matches).toHaveLength(2);
  });
});
