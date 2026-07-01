import { describe, it, expect } from 'vitest';
import { buildMatches } from '../scripts/match-sync/transform';
import type { Player } from '@/types/domain';
import type { SheetRow } from '../scripts/match-sync/sheet';

const PLAYERS: Player[] = [
  { id: 'matt', tekken_id: null, player_tag: 'SugarFree', platform: 'steam', main_character: 'jin', peak_rank: null },
  { id: 'alex', tekken_id: null, player_tag: 'AlxDestroyer', platform: 'steam', main_character: 'king', peak_rank: null, aliases: ['Alex', 'Alx'] },
];

function row(r: Partial<SheetRow>): SheetRow {
  return { date: '2026-06-28', player_a: 'SugarFree', player_b: 'Alex', score_a: '3', score_b: '1', ...r };
}

describe('buildMatches', () => {
  it('resolves tags and aliases case-insensitively to ids', () => {
    const { matches, rejected } = buildMatches([row({ player_b: 'alx' })], PLAYERS);
    expect(rejected).toHaveLength(0);
    expect(matches[0]).toMatchObject({ playerA: 'matt', playerB: 'alex', scoreA: 3, scoreB: 1 });
  });

  it('canonicalizes characters and treats blanks as null', () => {
    const { matches } = buildMatches(
      [row({ char_a: 'Devil Jin', char_b: '' })],
      PLAYERS,
    );
    expect(matches[0].charA).toBe('devil_jin');
    expect(matches[0].charB).toBeNull();
  });

  it('rejects unknown tags with a reason, keeping raw', () => {
    const { matches, rejected } = buildMatches([row({ player_b: 'Aelx' })], PLAYERS);
    expect(matches).toHaveLength(0);
    expect(rejected[0]).toMatchObject({ rowNumber: 2, reason: "unknown player tag 'Aelx'" });
    expect(rejected[0].raw.player_b).toBe('Aelx');
  });

  it('rejects unknown non-blank characters', () => {
    const { rejected } = buildMatches([row({ char_a: 'Notachar' })], PLAYERS);
    expect(rejected[0].reason).toContain('unknown character');
  });

  it('rejects non-integer and both-zero scores', () => {
    expect(buildMatches([row({ score_a: 'x' })], PLAYERS).rejected[0].reason).toContain('non-integer');
    expect(buildMatches([row({ score_a: '0', score_b: '0' })], PLAYERS).rejected[0].reason).toContain('zero');
  });

  it('rejects invalid dates', () => {
    expect(buildMatches([row({ date: '2026-13-40' })], PLAYERS).rejected[0].reason).toContain('invalid date');
    expect(buildMatches([row({ date: 'nonsense' })], PLAYERS).rejected[0].reason).toContain('invalid date');
  });

  it('normalizes match_type (case- and "Match"-suffix-insensitive; unknown → null)', () => {
    expect(buildMatches([row({ match_type: 'Ranked Match' })], PLAYERS).matches[0].matchType).toBe('ranked');
    expect(buildMatches([row({ match_type: 'quick' })], PLAYERS).matches[0].matchType).toBe('quick');
    expect(buildMatches([row({ match_type: 'GROUP' })], PLAYERS).matches[0].matchType).toBe('group');
    expect(buildMatches([row({ match_type: '' })], PLAYERS).matches[0].matchType).toBeNull();
    expect(buildMatches([row({ match_type: 'offline' })], PLAYERS).matches[0].matchType).toBeNull();
  });

  it('combines date + time into a UTC playedAt; blank/invalid → null', () => {
    expect(buildMatches([row({ time: '19:30' })], PLAYERS).matches[0].playedAt).toBe('2026-06-28T19:30:00Z');
    expect(buildMatches([row({ time: '9:05:12' })], PLAYERS).matches[0].playedAt).toBe('2026-06-28T09:05:12Z');
    expect(buildMatches([row({ time: '' })], PLAYERS).matches[0].playedAt).toBeNull();
    expect(buildMatches([row({ time: '25:00' })], PLAYERS).matches[0].playedAt).toBeNull();
    expect(buildMatches([row({ time: 'evening' })], PLAYERS).matches[0].playedAt).toBeNull();
  });

  it('assigns deterministic per-date ids in sheet order', () => {
    const { matches } = buildMatches(
      [row({}), row({ player_a: 'Alex', player_b: 'SugarFree' }), row({ date: '2026-06-29' })],
      PLAYERS,
    );
    expect(matches.map((m) => m.id)).toEqual(['2026-06-28#0', '2026-06-28#1', '2026-06-29#0']);
  });
});
