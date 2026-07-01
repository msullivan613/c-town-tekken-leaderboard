// EWGF client (spec §3.2 / §7.2). GET /player-stats/{polarisId} → PlayerDTO.
// Requires Authorization: Bearer <EWGF_API_KEY>; every endpoint 401s without it.
// The one response carries both per-character stats AND the player's battles.
import { fromEwgf } from '@/data/characters';
import { rankFromDanRank } from '@/data/ranks';
import { fetchWithRetry } from '../shared/http';

export interface EwgfCharacterStat {
  character: string; // canonical slug
  rank: string | null; // rank slug
  rankTier: number | null; // normalized dan int
  rankedGames: number; // wins + losses
  region: string | null;
  lastSeen: string | null; // ISO
}

// Verified EWGF BattleDTO (spec §7.2). One battle = one match to 3 rounds.
export interface BattleDTO {
  date: string; // "MM/dd/yyyy HH:mm:ss UTC"
  battleType: number; // 1 quick / 2 ranked / 3 group / 4 player
  gameVersion?: number;
  player1Name: string;
  player1PolarisId: string;
  player1CharacterId: number;
  player1RegionId: number | null;
  player1DanRank: number | null;
  player2Name: string;
  player2PolarisId: string;
  player2CharacterId: number;
  player2RegionId: number | null;
  player2DanRank: number | null;
  player1RoundsWon: number;
  player2RoundsWon: number;
  winner: number; // 1 | 2
  stageId?: number;
}

export interface EwgfPlayer {
  characters: EwgfCharacterStat[];
  battles: BattleDTO[];
}

interface PlayerMatchupSummaryDTO {
  wins: number;
  losses: number;
  currentSeasonDanRank: number | null;
  previousSeasonDanRank?: number;
}

interface PlayerDTO {
  polarisId: string;
  name: string;
  regionId: number | null;
  tekkenPower?: number;
  latestBattle?: number; // unix seconds
  playedCharacters: Record<string, PlayerMatchupSummaryDTO>;
  battles?: BattleDTO[];
}

// EWGF region codes → display names (best-effort; unknown → null).
const REGION_MAP: Record<number, string> = {
  0: 'asia',
  1: 'europe',
  2: 'us',
  3: 'us',
  4: 'oceania',
  5: 'south-america',
};

function regionName(regionId: number | null | undefined): string | null {
  if (regionId == null) return null;
  return REGION_MAP[regionId] ?? null;
}

function unixToIso(unix: number | null | undefined): string | null {
  if (unix == null) return null;
  return new Date(unix * 1000).toISOString();
}

function mapCharacters(tekkenId: string, dto: PlayerDTO): EwgfCharacterStat[] {
  const lastSeen = unixToIso(dto.latestBattle);
  const region = regionName(dto.regionId);
  const out: EwgfCharacterStat[] = [];
  for (const [name, summary] of Object.entries(dto.playedCharacters ?? {})) {
    const slug = fromEwgf(name);
    if (!slug) {
      console.warn(`[ewgf] ${tekkenId}: unmapped character "${name}" — skipped.`);
      continue;
    }
    const { slug: rank, tier: rankTier } = rankFromDanRank(summary.currentSeasonDanRank);
    out.push({
      character: slug,
      rank,
      rankTier,
      rankedGames: (summary.wins ?? 0) + (summary.losses ?? 0),
      region,
      lastSeen,
    });
  }
  return out;
}

/** Fetch a player's stats + battles from EWGF in one call. Never throws on a
 *  single player's failure — logs and returns empty data (§3.2). */
export async function getPlayer(
  tekkenId: string,
  apiKey: string,
  baseUrl: string,
  playerPath: string,
): Promise<EwgfPlayer> {
  const empty: EwgfPlayer = { characters: [], battles: [] };
  const url = `${baseUrl}${playerPath}/${tekkenId}`;
  let dto: PlayerDTO;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      console.warn(`[ewgf] ${tekkenId}: auth failed (HTTP ${res.status}).`);
      return empty;
    }
    if (!res.ok) {
      console.warn(`[ewgf] ${tekkenId}: HTTP ${res.status}.`);
      return empty;
    }
    dto = (await res.json()) as PlayerDTO;
  } catch (err) {
    console.warn(`[ewgf] ${tekkenId}: fetch failed —`, (err as Error).message);
    return empty;
  }

  return { characters: mapCharacters(tekkenId, dto), battles: dto.battles ?? [] };
}
