import { describe, it, expect } from 'vitest';
import {
  buildMatches,
  matchArchiveName,
  mergeMatches,
  splitMatchesByYear,
} from '../scripts/online-stats/matches';
import type { Match } from '@/types/data-files';
import type { TknowBattle, TknowBattleSide } from '../scripts/online-stats/tknow';
import type { AppConfig } from '@/types/data-files';
import type { Player } from '@/types/domain';

const PLAYERS: Player[] = [
  {
    id: 'matt',
    tekken_id: '3fee-J699-M7An',
    player_tag: 'SugarFree',
    platform: 'steam',
    main_character: 'jin',
    peak_rank: null,
  },
  {
    id: 'nick',
    tekken_id: '2b3c-4d5e-6f70',
    player_tag: 'NickTheKnife',
    platform: 'playstation',
    main_character: 'kazuya',
    peak_rank: null,
  },
];
const P = { matt: '3feeJ699M7An', nick: '2b3c4d5e6f70' };
const CFG = { matches: { recentWindowDays: 30, feedMaxPerPlayer: 40 } } as AppConfig;
const NOW = new Date('2026-06-30T08:00:00Z');

function side(
  o: Partial<TknowBattleSide> & Pick<TknowBattleSide, 'polarisId'>,
): TknowBattleSide {
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
  const p2 =
    typeof o.p2 === 'string'
      ? side({ polarisId: o.p2, character: 'kazuya', rank: 'tekken_king', rounds: 1 })
      : o.p2;
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
    const b = battle({
      battleId: 'BID1',
      battleAt: '2026-06-29T21:30:00Z',
      p1: P.matt,
      p2: P.nick,
    });
    const res = buildMatches([b, { ...b }], PLAYERS, [], CFG, NOW);
    expect(res.matches).toHaveLength(1);
    expect(res.crewMatchCount).toBe(1);
    expect(res.feedMatchCount).toBe(0);
  });

  it('classifies crew vs external and resolves tekken_id → roster id', () => {
    const res = buildMatches(
      [
        battle({
          battleId: 'BID1',
          battleAt: '2026-06-29T21:30:00Z',
          p1: P.matt,
          p2: P.nick,
        }),
        battle({
          battleId: 'BID2',
          battleAt: '2026-06-30T02:00:00Z',
          p1: P.matt,
          p2: side({ polarisId: 'RANDO123', name: 'Rando' }),
        }),
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
      [
        battle({
          battleId: 'BID1',
          battleAt: '2026-06-29T21:30:00Z',
          p1: P.matt,
          p2: P.nick,
          winner: 'p2',
        }),
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].winner).toBe('b');
  });

  it('carries the battleType through unchanged', () => {
    const res = buildMatches(
      [
        battle({
          battleId: 'BID1',
          battleAt: '2026-06-29T21:30:00Z',
          p1: P.matt,
          p2: side({ polarisId: 'RANDO', name: 'R' }),
          battleType: 'quick',
        }),
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.matches[0].battleType).toBe('quick');
  });

  it('keeps recent crew + feed matches live but archives (not drops) either outside the window', () => {
    const res = buildMatches(
      [
        battle({
          battleId: 'CREW_RECENT',
          battleAt: '2026-06-29T10:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }), // recent crew → live
        battle({
          battleId: 'CREW_OLD',
          battleAt: '2026-01-01T10:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }), // old crew → archived (issue #30)
        battle({
          battleId: 'FEED_OLD',
          battleAt: '2026-01-01T11:00:00Z',
          p1: P.matt,
          p2: side({ polarisId: 'RANDO', name: 'R' }),
        }), // old feed → archived
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    expect(res.crewMatchCount).toBe(1);
    expect(res.feedMatchCount).toBe(0);
    expect(res.matches.map((m) => m.id)).toEqual(['CREW_RECENT']);
    expect(res.archived.map((m) => m.id).sort()).toEqual(['CREW_OLD', 'FEED_OLD']); // preserved, not dropped
  });

  it('caps non-crew matches per player at feedMaxPerPlayer and archives the overflow', () => {
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
    // The 2 most-recent survive in the feed; the 2 oldest are archived, not lost.
    expect(res.matches.map((m) => m.id).sort()).toEqual(['FEED12', 'FEED13']);
    expect(res.archived.map((m) => m.id).sort()).toEqual(['FEED10', 'FEED11']);
  });

  it('archives crew matches aged past the window, without the per-player cap (issue #30)', () => {
    const cfg = { matches: { recentWindowDays: 30, feedMaxPerPlayer: 1 } } as AppConfig;
    // Two old crew matches: both archived (aged out), the tight per-player cap does
    // not apply to crew. A recent crew match stays live.
    const res = buildMatches(
      [
        battle({
          battleId: 'CREW_OLD_1',
          battleAt: '2024-01-01T10:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }),
        battle({
          battleId: 'CREW_OLD_2',
          battleAt: '2024-02-01T10:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }),
        battle({
          battleId: 'CREW_RECENT',
          battleAt: '2026-06-29T10:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }),
      ],
      PLAYERS,
      [],
      cfg,
      NOW,
    );
    expect(res.matches.map((m) => m.id)).toEqual(['CREW_RECENT']);
    expect(res.crewMatchCount).toBe(1);
    expect(res.archived.map((m) => m.id).sort()).toEqual(['CREW_OLD_1', 'CREW_OLD_2']);
  });

  it('merges with prior matches (append-only, incremental catch-up)', () => {
    const first = buildMatches(
      [
        battle({
          battleId: 'BID_A',
          battleAt: '2026-06-28T20:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }),
      ],
      PLAYERS,
      [],
      CFG,
      NOW,
    );
    const second = buildMatches(
      [
        battle({
          battleId: 'BID_B',
          battleAt: '2026-06-29T20:00:00Z',
          p1: P.matt,
          p2: P.nick,
        }),
      ],
      PLAYERS,
      first.matches,
      CFG,
      NOW,
    );
    expect(second.matches).toHaveLength(2);
  });
});

function feedMatch(id: string, playedAt: string): Match {
  return {
    id,
    playedAt,
    battleType: 'ranked',
    a: {
      playerId: 'matt',
      name: 'SugarFree',
      polarisId: P.matt,
      character: 'jin',
      rank: 'tekken_god',
    },
    b: {
      playerId: null,
      name: 'Rando',
      polarisId: 'RANDO',
      character: 'kazuya',
      rank: 'tekken_king',
    },
    roundsA: 3,
    roundsB: 1,
    winner: 'a',
    crew: false,
  };
}

describe('matchArchiveName', () => {
  it('names the per-year cold-storage archive', () => {
    expect(matchArchiveName('2025')).toBe('matches.2025.json');
  });
});

describe('splitMatchesByYear', () => {
  it('groups matches by the UTC calendar year of playedAt', () => {
    const grouped = splitMatchesByYear([
      feedMatch('A', '2025-12-31T23:00:00Z'),
      feedMatch('B', '2026-01-01T00:00:00Z'),
      feedMatch('C', '2026-07-04T12:00:00Z'),
    ]);
    expect([...grouped.keys()].sort()).toEqual(['2025', '2026']);
    expect(grouped.get('2025')!.map((m) => m.id)).toEqual(['A']);
    expect(
      grouped
        .get('2026')!
        .map((m) => m.id)
        .sort(),
    ).toEqual(['B', 'C']);
  });
});

describe('mergeMatches', () => {
  it('dedups by id (existing wins) and sorts chronologically', () => {
    const existing = [feedMatch('OLD', '2026-01-02T00:00:00Z')];
    const incoming = [
      { ...feedMatch('OLD', '2026-01-02T00:00:00Z'), roundsB: 99 }, // collision → ignored
      feedMatch('NEW', '2026-01-01T00:00:00Z'),
    ];
    const merged = mergeMatches(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['NEW', 'OLD']); // chronological
    expect(merged.find((m) => m.id === 'OLD')!.roundsB).toBe(1); // existing preserved
  });

  it('is idempotent — re-merging the same matches changes nothing', () => {
    const archive = [
      feedMatch('A', '2026-01-01T00:00:00Z'),
      feedMatch('B', '2026-01-02T00:00:00Z'),
    ];
    expect(mergeMatches(archive, archive)).toEqual(archive);
  });
});
