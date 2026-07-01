import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveStats } from '../scripts/online-stats/stats';
import { isKnownCharacter } from '@/data/characters';
import { rankBySlug } from '@/data/ranks';
import type {
  GlickoFile,
  MatchesFile,
  PlayersFile,
  RanksFile,
  StatsFile,
  HistoryFile,
} from '@/types/data-files';

const DATA = resolve(__dirname, '..', 'public', 'data');
function read<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(DATA, name), 'utf8')) as T;
}

// Lightweight runtime validation that committed JSON matches the schemas (§2.10):
// a malformed pipeline output fails CI before it can break the site.
describe('committed data files', () => {
  const players = read<PlayersFile>('players.json');
  const ranks = read<RanksFile>('ranks.json');
  const glicko = read<GlickoFile>('glicko.json');
  const matches = read<MatchesFile>('matches.json');
  const stats = read<StatsFile>('stats.json');
  const rankHistory = read<HistoryFile>('rankhistory.json');
  const mmrHistory = read<HistoryFile>('mmrhistory.json');

  const playerIds = new Set(players.players.map((p) => p.id));

  it('players.json: unique ids, known main characters', () => {
    expect(players.schemaVersion).toBe(1);
    const ids = players.players.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of players.players) {
      expect(isKnownCharacter(p.main_character)).toBe(true);
    }
  });

  it('ranks.json: valid rank slugs, resolvable players, pairId shape', () => {
    expect(ranks.source).toBe('tknow');
    for (const r of ranks.pairs) {
      expect(playerIds.has(r.playerId)).toBe(true);
      expect(r.pairId).toBe(`${r.tekken_id}:${r.character}`);
      if (r.rank) expect(rankBySlug(r.rank)).not.toBeNull();
      if (r.rankTier != null) expect(rankBySlug(r.rank ?? '')?.tier ?? r.rankTier).toBe(r.rankTier);
    }
  });

  it('glicko.json: provisional flag agrees with confidence bucket', () => {
    expect(glicko.source).toBe('wavu');
    for (const g of glicko.pairs) {
      expect(playerIds.has(g.playerId)).toBe(true);
      expect(g.provisional).toBe(g.confidence === 'provisional');
    }
  });

  it('matches.json: v2 shape, ≥1 crew side, valid winner/rounds', () => {
    expect(matches.schemaVersion).toBe(2);
    expect(matches.source).toBe('tknow');
    let crew = 0;
    for (const m of matches.matches) {
      // at least one side must be a tracked crew player
      const aCrew = m.a.playerId != null;
      const bCrew = m.b.playerId != null;
      expect(aCrew || bCrew).toBe(true);
      if (aCrew) expect(playerIds.has(m.a.playerId!)).toBe(true);
      if (bCrew) expect(playerIds.has(m.b.playerId!)).toBe(true);
      expect(m.crew).toBe(aCrew && bCrew);
      if (m.crew) crew++;
      expect(['a', 'b']).toContain(m.winner);
      expect(m.roundsA).toBeGreaterThanOrEqual(0);
      expect(m.roundsB).toBeGreaterThanOrEqual(0);
      expect(m.id.length).toBeGreaterThan(0); // tknow battle_id
    }
    expect(matches.crewMatchCount).toBe(crew);
    expect(matches.feedMatchCount).toBe(matches.matches.length - crew);
  });

  it('history files: series keys look like pairIds, points are sorted', () => {
    for (const file of [rankHistory, mmrHistory]) {
      for (const [pairId, series] of Object.entries(file.series)) {
        expect(pairId).toContain(':');
        expect(playerIds.has(series.playerId)).toBe(true);
        const dates = series.points.map(([d]) => d);
        expect([...dates].sort()).toEqual(dates);
      }
    }
  });

  it('stats.json is consistent with matches.json (regenerates identically)', () => {
    const regen = deriveStats(matches.matches, stats.generatedAt);
    expect(regen.headToHead).toEqual(stats.headToHead);
    expect(regen.players).toEqual(stats.players);
    expect(regen.charMatchups).toEqual(stats.charMatchups);
    expect(regen.basedOnMatchCount).toBe(stats.basedOnMatchCount);
  });
});
