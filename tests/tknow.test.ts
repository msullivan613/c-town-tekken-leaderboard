import { describe, it, expect } from 'vitest';
import {
  parsePlayerInfo,
  normalizeMatch,
  type TknowInfoResponse,
  type TknowMatchRow,
} from '../scripts/online-stats/tknow';

// Mirrors the verified live /player/info shape (spec §7.9).
const INFO: TknowInfoResponse = {
  nickname: 'SugarFree',
  region_id: 3, // Americas
  current_ranks: [
    { char_id: 7, current_rank: 26, total_games: 142, win_count: 85, latest_at: 1781235608, last_play_version: '30002' },
    { char_id: 3, current_rank: 27, total_games: 38, win_count: 27, latest_at: 1781924751, last_play_version: '30101' },
    // Unmapped/unreleased char id → skipped, not a crash.
    { char_id: 999, current_rank: 10, total_games: 20, win_count: 10, latest_at: 1781924751 },
  ],
  latest_game_info: { version_list: [30001, 30002, 30101] },
};

describe('parsePlayerInfo', () => {
  it('maps char ids → slugs and dan ints → rank slugs/tiers', () => {
    const p = parsePlayerInfo(INFO);
    expect(p.name).toBe('SugarFree');
    const bryan = p.characters.find((c) => c.character === 'bryan')!;
    expect(bryan.rank).toBe('tekken_emperor');
    expect(bryan.rankTier).toBe(26);
    expect(bryan.rankedGames).toBe(142);
    expect(bryan.region).toBe('Americas');
    expect(bryan.lastSeen).toBe(new Date(1781235608 * 1000).toISOString());
  });

  it('skips unmapped char ids without throwing', () => {
    const p = parsePlayerInfo(INFO);
    expect(p.characters).toHaveLength(2); // char_id 999 dropped
  });

  it('picks the newest per-character game version to query matches for', () => {
    expect(parsePlayerInfo(INFO).matchVersion).toBe(30101);
  });

  it('falls back to the newest version_list entry when no per-char version', () => {
    const p = parsePlayerInfo({
      current_ranks: [{ char_id: 7, current_rank: 26 }],
      latest_game_info: { version_list: [30001, 30101, 30002] },
    });
    expect(p.matchVersion).toBe(30101);
  });
});

// Mirrors the verified live /player/match row shape (spec §7.9).
function row(o: Partial<TknowMatchRow> & Pick<TknowMatchRow, 'battle_id' | 'my_polaris_id' | 'enemy_polaris_id'>): TknowMatchRow {
  return {
    battle_at: 1781924751,
    battle_type: 2,
    is_win: 1,
    my_name: 'SugarFree',
    my_chara: 3,
    my_rank: 27,
    my_rounds: 3,
    my_region_id: 3,
    enemy_name: 'Rando',
    enemy_chara: 8,
    enemy_rank: 28,
    enemy_rounds: 1,
    enemy_region_id: 3,
    ...o,
  };
}

describe('normalizeMatch', () => {
  it('canonicalizes orientation by polaris id and derives the winner', () => {
    // "my" (zzz) loses to enemy (aaa); canonical p1 = aaa (smaller id) = enemy.
    const b = normalizeMatch(row({ battle_id: 'B1', my_polaris_id: 'zzz', enemy_polaris_id: 'aaa', is_win: 0 }))!;
    expect(b.p1.polarisId).toBe('aaa');
    expect(b.p2.polarisId).toBe('zzz');
    expect(b.winner).toBe('p1'); // enemy (aaa) won
    expect(b.p1.character).toBe('kazuya'); // enemy_chara 8
    expect(b.p2.character).toBe('yoshimitsu'); // my_chara 3
  });

  it('same battle from either feed normalizes identically (dedup by battle_id)', () => {
    const fromMe = normalizeMatch(row({ battle_id: 'B1', my_polaris_id: 'aaa', enemy_polaris_id: 'bbb', is_win: 1 }))!;
    const fromOpp = normalizeMatch(row({ battle_id: 'B1', my_polaris_id: 'bbb', enemy_polaris_id: 'aaa', is_win: 0, my_chara: 8, my_rank: 28, enemy_chara: 3, enemy_rank: 27 }))!;
    expect(fromMe.p1.polarisId).toBe(fromOpp.p1.polarisId);
    expect(fromMe.winner).toBe(fromOpp.winner);
  });

  it('maps battle_type 1 → quick, else ranked', () => {
    expect(normalizeMatch(row({ battle_id: 'B', my_polaris_id: 'a', enemy_polaris_id: 'b', battle_type: 1 }))!.battleType).toBe('quick');
    expect(normalizeMatch(row({ battle_id: 'B', my_polaris_id: 'a', enemy_polaris_id: 'b', battle_type: 2 }))!.battleType).toBe('ranked');
  });

  it('returns null for a malformed row', () => {
    expect(normalizeMatch(row({ battle_id: '', my_polaris_id: 'a', enemy_polaris_id: 'b' }))).toBeNull();
    expect(normalizeMatch(row({ battle_id: 'B', my_polaris_id: 'a', enemy_polaris_id: 'b', battle_at: 0 }))).toBeNull();
  });
});
