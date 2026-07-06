// Daily online-stats job (spec §3). For each roster player with a tekken_id,
// fetch tknow in-game rank + match history and Wavu Glicko MMR per character,
// write ranks.json & glicko.json, append to rankhistory.json / mmrhistory.json,
// and rebuild matches.json / stats.json.
import { readdirSync } from 'node:fs';
import { DATA_DIR, loadConfig } from '../shared/config';
import { readDataFile, writeDataFile } from '../shared/atomicWrite';
import { sleep } from '../shared/http';
import { getPlayerInfo, getPlayerMatches, type TknowBattle } from './tknow';
import { getPlayerCustomMatches } from './ewgf';
import { getPlayerCharacters as getWavu } from './wavu';
import {
  buildMatches,
  matchArchiveName,
  mergeMatches,
  splitMatchesByYear,
} from './matches';
import { appendHistory, archiveName, mergeHistory, splitHistory } from './history';
import { deriveStats } from './stats';
import { rankByTier, rankBySlug } from '@/data/ranks';
import { makePairId } from '@/types/domain';
import type {
  GlickoFile,
  GlickoPair,
  HistoryFile,
  Match,
  MatchArchiveFile,
  MatchesFile,
  PlayersFile,
  RankPair,
  RanksFile,
} from '@/types/data-files';

const REQUEST_DELAY_MS = 500;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Roll a history file's overflow into per-year archives, then write both the live
 *  recent-window file and any changed archives — all compact (§2.6, issue #10).
 *  Returns whether the live file's on-disk contents changed. */
function writeHistory(
  base: 'rankhistory' | 'mmrhistory',
  file: HistoryFile,
  maxDaysInline: number,
  now: Date,
): boolean {
  const { live, archivesByYear } = splitHistory(file, maxDaysInline, now);
  for (const [year, overflow] of archivesByYear) {
    const name = archiveName(base, year);
    const merged = mergeHistory(readDataFile<HistoryFile>(name), overflow);
    writeDataFile(name, merged, { inlineArrays: true });
  }
  return writeDataFile(`${base}.json`, live, { inlineArrays: true });
}

/** All committed `matches.<year>.json` cold-storage archives, flattened (issue #19).
 *  Distinguished from the live `matches.json` by the four-digit year segment. */
function readMatchArchives(): Match[] {
  const all: Match[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(DATA_DIR);
  } catch {
    return all;
  }
  for (const name of names) {
    if (!/^matches\.\d{4}\.json$/.test(name)) continue;
    all.push(...(readDataFile<MatchArchiveFile>(name)?.matches ?? []));
  }
  return all;
}

async function main() {
  const config = loadConfig();
  const players = readDataFile<PlayersFile>('players.json')?.players ?? [];

  const tknowHeaders = {
    'User-Agent': config.tknow.userAgent,
    Origin: config.sources.tknowOrigin,
    Referer: `${config.sources.tknowOrigin}/`,
    Accept: 'application/json',
  };

  // ewgf supplies group/player (custom-lobby) matches for head-to-head tracking,
  // which tknow can't. Gated per-site by config.headToHead.enabled AND the
  // EWGF_API_KEY env/secret. Disabled ⇒ this site's players are never queried
  // against ewgf (conserving its ~100 req/day budget) and no group/player matches
  // are gathered; the pipeline behaves exactly as before (§ issue #3).
  const ewgfApiKey = process.env.EWGF_API_KEY?.trim() || null;
  const ewgfEnabled = config.headToHead.enabled && ewgfApiKey != null;
  if (!config.headToHead.enabled) {
    console.log(
      '[online-stats] head-to-head disabled for this site — not querying ewgf.',
    );
  } else if (!ewgfApiKey) {
    console.log(
      '[online-stats] head-to-head enabled but EWGF_API_KEY not set — skipping group/player matches.',
    );
  }

  const now = new Date().toISOString();
  const date = todayUtc();

  // Prior peak per pair, for running-max accumulation (§2.4).
  const priorRanks = readDataFile<RanksFile>('ranks.json');
  const priorPeakTier = new Map<string, number>();
  for (const p of priorRanks?.pairs ?? []) {
    const tier = p.characterPeakRank
      ? (rankBySlug(p.characterPeakRank)?.tier ?? null)
      : p.rankTier;
    if (tier != null) priorPeakTier.set(p.pairId, tier);
  }

  // Matches accumulate append-only; feed tknow the ids we already have so the
  // per-player match fetch can stop early once it reaches known battles (§4.2).
  const priorMatches = readDataFile<MatchesFile>('matches.json')?.matches ?? [];
  const knownBattleIds = new Set(priorMatches.map((m) => m.id));

  const rankPairs: RankPair[] = [];
  const glickoPairs: GlickoPair[] = [];
  const allBattles: TknowBattle[] = [];
  let tknowReachable = false; // at least one info fetch succeeded
  let ewgfReachable = false; // at least one ewgf battles fetch succeeded

  for (const player of players) {
    if (!player.tekken_id) continue;
    const tekkenId = player.tekken_id;

    const info = await getPlayerInfo(tekkenId, config.sources.tknowBaseUrl, tknowHeaders);
    await sleep(REQUEST_DELAY_MS);
    if (info.ok) tknowReachable = true;

    if (info.ok && info.matchVersion != null) {
      const battles = await getPlayerMatches(
        tekkenId,
        info.matchVersion,
        config.sources.tknowBaseUrl,
        tknowHeaders,
        { knownIds: knownBattleIds },
      );
      allBattles.push(...battles);
      await sleep(REQUEST_DELAY_MS);
    }

    if (ewgfEnabled && ewgfApiKey) {
      const ewgf = await getPlayerCustomMatches(
        tekkenId,
        config.sources.ewgfBaseUrl,
        ewgfApiKey,
        config.ewgf.userAgent,
      );
      if (ewgf.ok) ewgfReachable = true;
      allBattles.push(...ewgf.battles);
      await sleep(REQUEST_DELAY_MS);
    }

    const wavu = await getWavu(
      tekkenId,
      config.sources.wavuProfileUrl,
      config.wavu.userAgent,
    );
    await sleep(REQUEST_DELAY_MS);

    const tknowByChar = new Map(info.characters.map((e) => [e.character, e]));
    const wavuByChar = new Map(wavu.map((w) => [w.character, w]));
    const characters = new Set<string>([...tknowByChar.keys(), ...wavuByChar.keys()]);

    for (const character of characters) {
      const e = tknowByChar.get(character);
      const w = wavuByChar.get(character);
      const pairId = makePairId(tekkenId, character);

      const gamesForThreshold = Math.max(e?.rankedGames ?? 0, w?.games ?? 0);
      const meetsGames = gamesForThreshold >= config.pairThreshold.minRankedGames;
      const meetsRank = !config.pairThreshold.requireAssignedRank || e?.rank != null;
      if (!meetsGames || !meetsRank) continue;

      if (e) {
        const peakTier = Math.max(priorPeakTier.get(pairId) ?? -1, e.rankTier ?? -1);
        rankPairs.push({
          pairId,
          playerId: player.id,
          tekken_id: tekkenId,
          character,
          rank: e.rank,
          rankTier: e.rankTier,
          rankedGames: e.rankedGames,
          region: e.region,
          characterPeakRank: peakTier >= 0 ? (rankByTier(peakTier)?.slug ?? null) : null,
          lastSeen: e.lastSeen,
        });
      }

      if (w) {
        glickoPairs.push({
          pairId,
          playerId: player.id,
          character,
          rating: w.rating,
          sigmaSquared: w.sigmaSquared,
          confidence: w.confidence,
          provisional: w.confidence === 'provisional',
          games: w.games,
          lastUpdated: w.lastUpdated,
        });
      }
    }
  }

  rankPairs.sort((a, b) => a.pairId.localeCompare(b.pairId));
  glickoPairs.sort((a, b) => a.pairId.localeCompare(b.pairId));

  const ranksFile: RanksFile = {
    schemaVersion: 1,
    source: 'tknow',
    generatedAt: now,
    pairs: rankPairs,
  };
  const glickoFile: GlickoFile = {
    schemaVersion: 1,
    source: 'wavu',
    generatedAt: now,
    pairs: glickoPairs,
  };

  const rankHistory = appendHistory(
    readDataFile<HistoryFile>('rankhistory.json'),
    'tknow',
    rankPairs
      .filter((p) => p.rankTier != null)
      .map((p) => ({
        pairId: p.pairId,
        playerId: p.playerId,
        character: p.character,
        value: p.rankTier as number,
      })),
    date,
    now,
  );
  const mmrHistory = appendHistory(
    readDataFile<HistoryFile>('mmrhistory.json'),
    'wavu',
    glickoPairs
      .filter((p) => p.rating != null)
      .map((p) => ({
        pairId: p.pairId,
        playerId: p.playerId,
        character: p.character,
        value: p.rating as number,
      })),
    date,
    now,
  );

  // If tknow was wholly unreachable this run, keep yesterday's committed rank /
  // match data rather than clobbering it with an empty file (§3.2).
  const wroteRanks =
    tknowReachable || rankPairs.length > 0
      ? writeDataFile('ranks.json', ranksFile)
      : false;
  const wroteGlicko = writeDataFile('glicko.json', glickoFile);
  // Cap the live history to config.history.maxDaysInline days, rolling older
  // points into per-year archives (issue #10). Guard the same as before: don't
  // clobber a good file with an empty one when there's nothing to record.
  const nowDate = new Date(now);
  const wroteRankHist =
    Object.keys(rankHistory.series).length > 0
      ? writeHistory('rankhistory', rankHistory, config.history.maxDaysInline, nowDate)
      : false;
  const wroteMmrHist =
    Object.keys(mmrHistory.series).length > 0
      ? writeHistory('mmrhistory', mmrHistory, config.history.maxDaysInline, nowDate)
      : false;

  // Matches + derived stats come from tknow (quick/ranked) and, when enabled,
  // ewgf (group/player) battles (§4). Only rebuild when at least one source was
  // reachable; otherwise keep yesterday's committed matches/stats. buildMatches
  // merges fresh battles onto priorMatches by id, so a source being down this run
  // preserves its previously-committed matches.
  let wroteMatches = false;
  let wroteStats = false;
  let matchCount = 0;
  let archivedCount = 0;
  if (tknowReachable || ewgfReachable) {
    const built = buildMatches(allBattles, players, priorMatches, config, new Date(now));
    matchCount = built.matches.length;
    const matchesFile: MatchesFile = {
      schemaVersion: 2,
      source: ewgfEnabled ? 'tknow+ewgf' : 'tknow',
      generatedAt: now,
      crewMatchCount: built.crewMatchCount,
      feedMatchCount: built.feedMatchCount,
      matches: built.matches,
    };
    wroteMatches = writeDataFile('matches.json', matchesFile);

    // Roll matches pruned out of the live window this run — crew and non-crew alike —
    // into per-year cold-storage archives instead of discarding them (issues #19, #30).
    // Each archive is only rewritten when it actually gains matches (splitMatchesByYear
    // only yields years with newly-pruned matches), preserving the commit-if-changed gate.
    for (const [year, pruned] of splitMatchesByYear(built.archived)) {
      const name = matchArchiveName(year);
      const existing = readDataFile<MatchArchiveFile>(name)?.matches ?? [];
      const merged = mergeMatches(existing, pruned);
      const archiveFile: MatchArchiveFile = {
        schemaVersion: 2,
        year,
        generatedAt: now,
        matches: merged,
      };
      if (writeDataFile(name, archiveFile)) archivedCount += pruned.length;
    }

    // Derive stats over the full retained dataset — live feed + all archives
    // (deduped by id) — so head-to-head + per-player rollups aren't limited to the
    // recent window even as crew matches age out of the live feed (issue #30).
    const fullSet = mergeMatches(built.matches, readMatchArchives());
    wroteStats = writeDataFile('stats.json', deriveStats(fullSet, now));
  }

  console.log(
    `[online-stats] ranks:${rankPairs.length} glicko:${glickoPairs.length} ` +
      `battles:${allBattles.length} matches:${matchCount} archived:${archivedCount} ` +
      `ewgf:${ewgfEnabled ? (ewgfReachable ? 'on' : 'unreachable') : 'off'} ` +
      `written(ranks:${wroteRanks} glicko:${wroteGlicko} rankHist:${wroteRankHist} ` +
      `mmrHist:${wroteMmrHist} matches:${wroteMatches} stats:${wroteStats})`,
  );
}

main().catch((err) => {
  console.error('[online-stats] fatal:', err);
  process.exit(1);
});
