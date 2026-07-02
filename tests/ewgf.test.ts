import { describe, it, expect } from 'vitest';
import { normalizeEwgfBattle, type EwgfBattleRow } from '../scripts/online-stats/ewgf';

// Mirrors the verified live /external/battles/{id} row shape (issue #3).
function row(o: Partial<EwgfBattleRow> = {}): EwgfBattleRow {
  return {
    battle_at: '2026-06-30T20:16:26Z',
    battle_type: 'GROUP_BATTLE',
    winner: 1,
    p1_name: 'SugarFree',
    p1_tekken_id: '3fee-J699-M7An',
    p1_char: 'Jun',
    p1_dan_rank: 'God of Destruction V',
    p1_rounds_won: 3,
    p2_name: 'Rando',
    p2_tekken_id: '2b3c-4d5e-6f70',
    p2_char: 'Kazuya',
    p2_dan_rank: 'Tekken God Supreme',
    p2_rounds_won: 1,
    ...o,
  };
}

describe('normalizeEwgfBattle', () => {
  it('keeps group and player battles, mapping names → slugs', () => {
    const group = normalizeEwgfBattle(row({ battle_type: 'GROUP_BATTLE' }))!;
    expect(group.battleType).toBe('group');
    // p2 (2b3c...) has the smaller undashed id → canonical p1.
    expect(group.p1.polarisId).toBe('2b3c4d5e6f70');
    expect(group.p1.character).toBe('kazuya');
    expect(group.p1.rank).toBe('tekken_god_supreme');
    expect(group.p2.character).toBe('jun');
    expect(group.p2.rank).toBe('god_of_destruction_v');

    const player = normalizeEwgfBattle(row({ battle_type: 'PLAYER_BATTLE' }))!;
    expect(player.battleType).toBe('player');
  });

  it('drops quick/ranked battles (those come from tknow)', () => {
    expect(normalizeEwgfBattle(row({ battle_type: 'QUICK_BATTLE' }))).toBeNull();
    expect(normalizeEwgfBattle(row({ battle_type: 'RANKED_BATTLE' }))).toBeNull();
    expect(normalizeEwgfBattle(row({ battle_type: 'WHATEVER' }))).toBeNull();
  });

  it('canonicalizes orientation and derives the winner across feeds', () => {
    // Same battle seen from each player's feed yields the same id + winner.
    const fromA = normalizeEwgfBattle(
      row({ p1_tekken_id: 'aaaa', p2_tekken_id: 'bbbb', winner: 1 }),
    )!;
    const fromB = normalizeEwgfBattle(
      row({
        p1_tekken_id: 'bbbb',
        p2_tekken_id: 'aaaa',
        winner: 2, // from B's perspective, A (its p2) still won
        p1_char: 'Kazuya',
        p2_char: 'Jun',
      }),
    )!;
    expect(fromA.battleId).toBe(fromB.battleId);
    expect(fromA.p1.polarisId).toBe('aaaa'); // smaller id is canonical p1
    expect(fromA.winner).toBe('p1'); // aaaa won
    expect(fromB.winner).toBe('p1');
  });

  it('synthesizes a deterministic, tknow-safe battle id', () => {
    const b = normalizeEwgfBattle(row({ p1_tekken_id: 'aaaa', p2_tekken_id: 'bbbb' }))!;
    // ewgf: prefix + canonical order + epoch seconds — never collides with a tknow id.
    expect(b.battleId).toBe(`ewgf:aaaa-bbbb:${Math.floor(Date.parse('2026-06-30T20:16:26Z') / 1000)}`);
  });

  it('returns null for malformed rows', () => {
    expect(normalizeEwgfBattle(row({ p1_tekken_id: '' }))).toBeNull();
    expect(normalizeEwgfBattle(row({ battle_at: 'not-a-date' }))).toBeNull();
  });

  it('tolerates unknown character/rank names (null, not a throw)', () => {
    const b = normalizeEwgfBattle(row({ p1_char: 'Nobody', p1_dan_rank: 'Unrank' }))!;
    // p1 in the row (3fee...) is canonical p2 here (larger id).
    expect(b.p2.character).toBeNull();
    expect(b.p2.rank).toBeNull();
  });
});
