import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveStats } from '../scripts/online-stats/stats';
import { mergeMatches } from '../scripts/online-stats/matches';
import { isKnownCharacter } from '@/data/characters';
import { rankBySlug } from '@/data/ranks';
import type {
  GlickoFile,
  Match,
  MatchArchiveFile,
  MatchesFile,
  PlayersFile,
  RanksFile,
  StatsFile,
  HistoryFile,
} from '@/types/data-files';

const SITES = resolve(__dirname, '..', 'sites');
const siteSlugs = readdirSync(SITES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

// Lightweight runtime validation that committed JSON matches the schemas (§2.10):
// a malformed pipeline output fails CI before it can break the site. Every site's
// data folder is checked; generated files absent on a fresh site are skipped.
describe.each(siteSlugs)('committed data files: %s', (slug) => {
  const DATA = resolve(SITES, slug, 'data');
  function read<T>(name: string): T {
    return JSON.parse(readFileSync(resolve(DATA, name), 'utf8')) as T;
  }
  function readMaybe<T>(name: string): T | null {
    return existsSync(resolve(DATA, name)) ? read<T>(name) : null;
  }

  const players = read<PlayersFile>('players.json');
  const ranks = readMaybe<RanksFile>('ranks.json');
  const glicko = readMaybe<GlickoFile>('glicko.json');
  const matches = readMaybe<MatchesFile>('matches.json');
  const stats = readMaybe<StatsFile>('stats.json');
  const rankHistory = readMaybe<HistoryFile>('rankhistory.json');
  const mmrHistory = readMaybe<HistoryFile>('mmrhistory.json');
  const archiveNames = readdirSync(DATA).filter((n) => /^matches\.\d{4}\.json$/.test(n));
  const archives = archiveNames.map((n) => read<MatchArchiveFile>(n));
  // The full retained dataset stats are derived over: live feed + all archives.
  const allMatches: Match[] = matches
    ? mergeMatches(
        matches.matches,
        archives.flatMap((a) => a.matches),
      )
    : [];

  const playerIds = new Set(players.players.map((p) => p.id));

  it('players.json: unique ids, known or null main characters', () => {
    expect(players.schemaVersion).toBe(1);
    const ids = players.players.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of players.players) {
      // main_character may be null (derived from ranks at runtime, issue #1).
      if (p.main_character !== null) {
        expect(isKnownCharacter(p.main_character)).toBe(true);
      }
    }
  });

  it('ranks.json: valid rank slugs, resolvable players, pairId shape', () => {
    if (!ranks) return;
    expect(ranks.source).toBe('tknow');
    for (const r of ranks.pairs) {
      expect(playerIds.has(r.playerId)).toBe(true);
      expect(r.pairId).toBe(`${r.tekken_id}:${r.character}`);
      if (r.rank) expect(rankBySlug(r.rank)).not.toBeNull();
      if (r.rankTier != null)
        expect(rankBySlug(r.rank ?? '')?.tier ?? r.rankTier).toBe(r.rankTier);
    }
  });

  it('glicko.json: provisional flag agrees with confidence bucket', () => {
    if (!glicko) return;
    expect(glicko.source).toBe('wavu');
    for (const g of glicko.pairs) {
      expect(playerIds.has(g.playerId)).toBe(true);
      expect(g.provisional).toBe(g.confidence === 'provisional');
    }
  });

  it('matches.json: v2 shape, ≥1 crew side, valid winner/rounds', () => {
    if (!matches) return;
    expect(matches.schemaVersion).toBe(2);
    expect(['tknow', 'ewgf', 'tknow+ewgf']).toContain(matches.source);
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
      if (!file) continue;
      for (const [pairId, series] of Object.entries(file.series)) {
        expect(pairId).toContain(':');
        expect(playerIds.has(series.playerId)).toBe(true);
        const dates = series.points.map(([d]) => d);
        expect([...dates].sort()).toEqual(dates);
      }
    }
  });

  it('matches.<year>.json: v2 archive of non-crew feed matches only (issue #19)', () => {
    for (const [i, archive] of archives.entries()) {
      expect(archive.schemaVersion).toBe(2);
      expect(archive.year).toBe(
        archiveNames[i].slice('matches.'.length, -'.json'.length),
      );
      for (const m of archive.matches) {
        expect(m.playedAt.slice(0, 4)).toBe(archive.year); // filed under the right year
        expect(m.a.playerId != null || m.b.playerId != null).toBe(true);
      }
    }
    // Archives and the live feed are disjoint (nothing lives in both).
    if (matches) {
      const liveIds = new Set(matches.matches.map((m) => m.id));
      for (const archive of archives) {
        for (const m of archive.matches) expect(liveIds.has(m.id)).toBe(false);
      }
    }
  });

  it('stats.json is consistent with the full dataset (live feed + archives)', () => {
    if (!matches || !stats) return;
    const regen = deriveStats(allMatches, stats.generatedAt);
    expect(regen.headToHead).toEqual(stats.headToHead);
    expect(regen.players).toEqual(stats.players);
    expect(regen.charMatchups).toEqual(stats.charMatchups);
    expect(regen.basedOnMatchCount).toBe(stats.basedOnMatchCount);
  });
});
