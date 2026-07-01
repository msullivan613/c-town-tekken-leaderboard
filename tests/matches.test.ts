import { describe, it, expect } from 'vitest';
import { buildMatches } from '../scripts/online-stats/matches';
import type { EwgfBattle } from '../scripts/online-stats/ewgf';
import type { AppConfig } from '@/types/data-files';
import type { Player } from '@/types/domain';

const PLAYERS: Player[] = [
  { id: 'matt', tekken_id: '3fee-J699-M7An', player_tag: 'SugarFree', platform: 'steam', main_character: 'jin', peak_rank: null },
  { id: 'nick', tekken_id: '2b3c-4d5e-6f70', player_tag: 'NickTheKnife', platform: 'playstation', main_character: 'kazuya', peak_rank: null },
];
const P = { matt: '3feeJ699M7An', nick: '2b3c4d5e6f70' };
const CFG = { matches: { recentWindowDays: 30, feedMaxPerPlayer: 40 } } as AppConfig;
const NOW = new Date('2026-06-30T08:00:00Z');

function battle(
  o: Partial<EwgfBattle> & Pick<EwgfBattle, 'battle_at' | 'p1_tekken_id' | 'p2_tekken_id'>,
): EwgfBattle {
  return {
    battle_type: 'RANKED_BATTLE',
    winner: 1,
    p1_name: o.p1_tekken_id,
    p1_char: 'Jin',
    p1_region: 'Americas',
    p1_dan_rank: 'Tekken God',
    p1_rounds_won: 3,
    p2_name: o.p2_tekken_id,
    p2_char: 'Kazuya',
    p2_region: 'Americas',
    p2_dan_rank: 'Tekken King',
    p2_rounds_won: 1,
    ...o,
  } as EwgfBattle;
}

describe('buildMatches', () => {
  it('dedups a crew battle that appears in both players’ feeds', () => {
    const b = battle({ battle_at: '2026-06-29T21:30:00Z', p1_tekken_id: P.matt, p2_tekken_id: P.nick });
    const res = buildMatches([b, { ...b }], PLAYERS, [], CFG, NOW);
    expect(res.matches).toHaveLength(1);
    expect(res.crewMatchCount).toBe(1);
    expect(res.feedMatchCount).toBe(0);
  });

  it('classifies crew vs external and resolves tekken_id → roster id', () => {
    const res = buildMatches(
      [
        battle({ battle_at: '2026-06-29T21:30:00Z', p1_tekken_id: P.matt, p2_tekken_id: P.nick }),
        battle({ battle_at: '2026-06-30T02:00:00Z', p1_tekken_id: P.matt, p2_tekken_id: 'RANDO123', p2_name: 'Rando' }),
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    const crew = res.matches.find((m) => m.crew)!;
    expect([crew.a.playerId, crew.b.playerId]).toEqual(['matt', 'nick']);
    const ext = res.matches.find((m) => !m.crew)!;
    expect(ext.a.playerId).toBe('matt');
    expect(ext.b.playerId).toBeNull();
    expect(ext.b.name).toBe('Rando');
  });

  it('maps character name → slug and rank name → rank slug', () => {
    const res = buildMatches(
      [battle({ battle_at: '2026-06-29T21:30:00Z', p1_tekken_id: P.matt, p2_tekken_id: P.nick, p1_char: 'Devil Jin', p1_dan_rank: 'Fujin' })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].a.character).toBe('devil_jin');
    expect(res.matches[0].a.rank).toBe('fujin');
    expect(res.matches[0].b.character).toBe('kazuya');
  });

  it('maps the string battleType enum to MatchType', () => {
    const res = buildMatches(
      [battle({ battle_at: '2026-06-29T21:30:00Z', p1_tekken_id: P.matt, p2_tekken_id: 'RANDO', p2_name: 'R', battle_type: 'PLAYER_BATTLE' })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].battleType).toBe('player');
  });

  it('keeps crew matches forever but prunes non-crew outside the window', () => {
    const res = buildMatches(
      [
        battle({ battle_at: '2026-01-01T10:00:00Z', p1_tekken_id: P.matt, p2_tekken_id: P.nick }), // old crew → kept
        battle({ battle_at: '2026-01-01T11:00:00Z', p1_tekken_id: P.matt, p2_tekken_id: 'RANDO', p2_name: 'R' }), // old feed → pruned
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
        battle_at: `2026-06-29T${hh}:00:00Z`,
        p1_tekken_id: P.matt,
        p2_tekken_id: `RAND${hh}`,
        p2_name: `R${hh}`,
      }),
    );
    const res = buildMatches(feed, PLAYERS, [], cfg, NOW);
    expect(res.feedMatchCount).toBe(2);
  });

  it('merges with prior matches (append-only crew history)', () => {
    const first = buildMatches(
      [battle({ battle_at: '2026-06-28T20:00:00Z', p1_tekken_id: P.matt, p2_tekken_id: P.nick })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    const second = buildMatches(
      [battle({ battle_at: '2026-06-29T20:00:00Z', p1_tekken_id: P.matt, p2_tekken_id: P.nick })],
      PLAYERS,
      first.matches,
      CFG,
      NOW,
    );
    expect(second.matches).toHaveLength(2);
  });
});
