import { describe, it, expect } from 'vitest';
import { buildMatches, parseEwgfDate } from '../scripts/online-stats/matches';
import type { BattleDTO } from '../scripts/online-stats/ewgf';
import type { AppConfig } from '@/types/data-files';
import type { Player } from '@/types/domain';

const PLAYERS: Player[] = [
  { id: 'matt', tekken_id: '3fee-J699-M7An', player_tag: 'SugarFree', platform: 'steam', main_character: 'jin', peak_rank: null },
  { id: 'nick', tekken_id: '2b3c-4d5e-6f70', player_tag: 'NickTheKnife', platform: 'playstation', main_character: 'kazuya', peak_rank: null },
];
const P = { matt: '3feeJ699M7An', nick: '2b3c4d5e6f70' };
const CFG = { matches: { recentWindowDays: 30, feedMaxPerPlayer: 40 } } as AppConfig;
const NOW = new Date('2026-06-30T08:00:00Z');

function battle(o: Partial<BattleDTO> & Pick<BattleDTO, 'date' | 'player1PolarisId' | 'player2PolarisId'>): BattleDTO {
  return {
    battleType: 2,
    player1Name: o.player1PolarisId,
    player1CharacterId: 6,
    player1RegionId: 2,
    player1DanRank: 27,
    player2Name: o.player2PolarisId,
    player2CharacterId: 8,
    player2RegionId: 2,
    player2DanRank: 25,
    player1RoundsWon: 3,
    player2RoundsWon: 1,
    winner: 1,
    ...o,
  } as BattleDTO;
}

describe('parseEwgfDate', () => {
  it('parses "MM/dd/yyyy HH:mm:ss UTC" to ISO', () => {
    expect(parseEwgfDate('06/29/2026 21:30:00 UTC')).toBe('2026-06-29T21:30:00.000Z');
  });
  it('tolerates missing seconds and returns null on garbage', () => {
    expect(parseEwgfDate('6/1/2026 09:05')).toBe('2026-06-01T09:05:00.000Z');
    expect(parseEwgfDate('yesterday')).toBeNull();
  });
});

describe('buildMatches', () => {
  it('dedups a crew battle that appears in both players’ feeds', () => {
    const b = battle({ date: '06/29/2026 21:30:00 UTC', player1PolarisId: P.matt, player2PolarisId: P.nick });
    const res = buildMatches([b, { ...b }], PLAYERS, [], CFG, NOW);
    expect(res.matches).toHaveLength(1);
    expect(res.crewMatchCount).toBe(1);
    expect(res.feedMatchCount).toBe(0);
  });

  it('classifies crew vs external and resolves polarisId → roster id', () => {
    const res = buildMatches(
      [
        battle({ date: '06/29/2026 21:30:00 UTC', player1PolarisId: P.matt, player2PolarisId: P.nick }),
        battle({ date: '06/30/2026 02:00:00 UTC', player1PolarisId: P.matt, player2PolarisId: 'RANDO123', player2Name: 'Rando' }),
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

  it('maps characterId → slug and danRank → rank slug', () => {
    const res = buildMatches(
      [battle({ date: '06/29/2026 21:30:00 UTC', player1PolarisId: P.matt, player2PolarisId: P.nick, player1CharacterId: 12, player1DanRank: 21 })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].a.character).toBe('devil_jin');
    expect(res.matches[0].a.rank).toBe('fujin');
    expect(res.matches[0].b.character).toBe('kazuya');
  });

  it('keeps crew matches forever but prunes non-crew outside the window', () => {
    const res = buildMatches(
      [
        battle({ date: '01/01/2026 10:00:00 UTC', player1PolarisId: P.matt, player2PolarisId: P.nick }), // old crew → kept
        battle({ date: '01/01/2026 11:00:00 UTC', player1PolarisId: P.matt, player2PolarisId: 'RANDO', player2Name: 'R' }), // old feed → pruned
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
        date: `06/29/2026 ${hh}:00:00 UTC`,
        player1PolarisId: P.matt,
        player2PolarisId: `RAND${hh}`,
        player2Name: `R${hh}`,
      }),
    );
    const res = buildMatches(feed, PLAYERS, [], cfg, NOW);
    expect(res.feedMatchCount).toBe(2);
  });

  it('merges with prior matches (append-only crew history)', () => {
    const first = buildMatches(
      [battle({ date: '06/28/2026 20:00:00 UTC', player1PolarisId: P.matt, player2PolarisId: P.nick })],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    const second = buildMatches(
      [battle({ date: '06/29/2026 20:00:00 UTC', player1PolarisId: P.matt, player2PolarisId: P.nick })],
      PLAYERS,
      first.matches,
      CFG,
      NOW,
    );
    expect(second.matches).toHaveLength(2);
  });
});
