// Daily online-stats job (spec §3). For each roster player with a tekken_id,
// fetch tknow in-game rank + match history and Wavu Glicko MMR per character,
// write ranks.json & glicko.json, append to rankhistory.json / mmrhistory.json,
// and rebuild matches.json / stats.json.
import { loadConfig } from '../shared/config';
import { readDataFile, writeDataFile } from '../shared/atomicWrite';
import { sleep } from '../shared/http';
import { getPlayerInfo, getPlayerMatches, type TknowBattle } from './tknow';
import { getPlayerCharacters as getWavu } from './wavu';
import { buildMatches } from './matches';
import { deriveStats } from './stats';
import { rankByTier, rankBySlug } from '@/data/ranks';
import { makePairId } from '@/types/domain';
import type {
  GlickoFile,
  GlickoPair,
  HistoryFile,
  MatchesFile,
  PlayersFile,
  RankPair,
  RanksFile,
} from '@/types/data-files';

const REQUEST_DELAY_MS = 500;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Append today's [date, value] to each pair's series, idempotently (§3.4). */
function appendHistory(
  existing: HistoryFile | null,
  source: 'tknow' | 'wavu',
  rows: Array<{ pairId: string; playerId: string; character: string; value: number }>,
  date: string,
  now: string,
): HistoryFile {
  const file: HistoryFile = existing ?? {
    schemaVersion: 1,
    source,
    updatedAt: now,
    series: {},
  };
  file.updatedAt = now;
  for (const row of rows) {
    const series = (file.series[row.pairId] ??= {
      playerId: row.playerId,
      character: row.character,
      points: [],
    });
    if (!series.points.some(([d]) => d === date)) {
      series.points.push([date, row.value]);
    }
    series.points.sort((a, b) => a[0].localeCompare(b[0]));
  }
  return file;
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

  const now = new Date().toISOString();
  const date = todayUtc();

  // Prior peak per pair, for running-max accumulation (§2.4).
  const priorRanks = readDataFile<RanksFile>('ranks.json');
  const priorPeakTier = new Map<string, number>();
  for (const p of priorRanks?.pairs ?? []) {
    const tier = p.characterPeakRank
      ? rankBySlug(p.characterPeakRank)?.tier ?? null
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
          characterPeakRank: peakTier >= 0 ? rankByTier(peakTier)?.slug ?? null : null,
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
  const wroteRankHist =
    rankHistory.series && Object.keys(rankHistory.series).length > 0
      ? writeDataFile('rankhistory.json', rankHistory)
      : false;
  const wroteMmrHist = writeDataFile('mmrhistory.json', mmrHistory);

  // Matches + derived stats come from tknow battles (§4). Only rebuild when tknow
  // was reachable; otherwise keep yesterday's committed matches/stats.
  let wroteMatches = false;
  let wroteStats = false;
  let matchCount = 0;
  if (tknowReachable) {
    const built = buildMatches(allBattles, players, priorMatches, config, new Date(now));
    matchCount = built.matches.length;
    const matchesFile: MatchesFile = {
      schemaVersion: 2,
      source: 'tknow',
      generatedAt: now,
      crewMatchCount: built.crewMatchCount,
      feedMatchCount: built.feedMatchCount,
      matches: built.matches,
    };
    wroteMatches = writeDataFile('matches.json', matchesFile);
    wroteStats = writeDataFile('stats.json', deriveStats(built.matches, now));
  }

  console.log(
    `[online-stats] ranks:${rankPairs.length} glicko:${glickoPairs.length} ` +
      `battles:${allBattles.length} matches:${matchCount} ` +
      `written(ranks:${wroteRanks} glicko:${wroteGlicko} rankHist:${wroteRankHist} ` +
      `mmrHist:${wroteMmrHist} matches:${wroteMatches} stats:${wroteStats})`,
  );
}

main().catch((err) => {
  console.error('[online-stats] fatal:', err);
  process.exit(1);
});
