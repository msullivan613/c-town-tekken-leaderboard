// tknow.gg client (spec §7.9). tknow exposes an unofficial JSON API at
// api.tk8now.pe.kr that — unlike EWGF's gated free tier — returns real
// per-character dan ranks + lifetime games (`/player/info`) and a paginated,
// battle_id-keyed match history with no 24h delay (`/player/match`). It gates on
// an Origin/Referer check (a soft anti-hotlink measure) rather than an API key.
// Anonymous, low-volume, ToS-respecting: sequential, one player at a time.
import { fromCharacterId } from '@/data/characters';
import { rankFromDanRank } from '@/data/ranks';
import type { MatchType } from '@/types/data-files';
import { fetchWithRetry } from '../shared/http';

// region_id → display name (verified from the tknow frontend, §7.9).
const REGIONS: Record<number, string> = {
  0: 'Asia',
  1: 'Middle East',
  2: 'Oceania',
  3: 'Americas',
  4: 'Europe 1',
  5: 'Africa',
  6: 'Europe 2',
};
function regionName(id: number | null | undefined): string | null {
  return id == null ? null : REGIONS[id] ?? null;
}

// tknow `battle_type`: 1 = quick match, anything else = ranked (tknow collapses
// non-quick online play into "ranked"). Custom lobby/player matches are not
// surfaced by tknow, so they don't appear here.
function battleType(t: number | null | undefined): MatchType {
  return t == null ? null : Number(t) === 1 ? 'quick' : 'ranked';
}

function undash(id: string): string {
  return id.replaceAll('-', '');
}

function versionInt(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── /player/info ─────────────────────────────────────────────────────────────
interface TknowCurrentRank {
  char_id: number;
  current_rank: number | null; // dan integer (same ladder as ranks.ts §7.5)
  total_games?: number; // lifetime ranked games on this character
  win_count?: number;
  latest_at?: number | null; // unix seconds
  last_play_version?: string;
}
export interface TknowInfoResponse {
  nickname?: string;
  region_id?: number | null;
  current_ranks?: TknowCurrentRank[];
  latest_game_info?: { version_list?: number[] };
}

export interface TknowCharacterStat {
  character: string; // canonical slug
  rank: string | null; // rank slug
  rankTier: number | null; // normalized dan int
  rankedGames: number; // lifetime ranked games on this character
  wins: number;
  region: string | null;
  lastSeen: string | null; // ISO
}

export interface TknowPlayer {
  ok: boolean; // false ⇒ the fetch failed (vs. a player with no data)
  name: string | null;
  characters: TknowCharacterStat[];
  matchVersion: number | null; // game version to query the player's matches for
}

/** Parse an already-fetched /player/info body into per-character rank/usage +
 *  the game version to query matches for (also used directly by unit tests). */
export function parsePlayerInfo(body: TknowInfoResponse): Omit<TknowPlayer, 'ok'> {
  const region = regionName(body.region_id);
  const characters: TknowCharacterStat[] = [];
  let matchVersion: number | null = null;

  for (const c of body.current_ranks ?? []) {
    const slug = fromCharacterId(c.char_id);
    if (!slug) {
      console.warn(`[tknow] unmapped char_id ${c.char_id} — skipped.`);
      continue;
    }
    const { slug: rank, tier } = rankFromDanRank(c.current_rank);
    characters.push({
      character: slug,
      rank,
      rankTier: tier,
      rankedGames: c.total_games ?? 0,
      wins: c.win_count ?? 0,
      region,
      lastSeen: c.latest_at ? new Date(c.latest_at * 1000).toISOString() : null,
    });
    const v = versionInt(c.last_play_version);
    if (v != null && (matchVersion == null || v > matchVersion)) matchVersion = v;
  }

  // Fall back to the newest known game version when no per-char version is present.
  if (matchVersion == null) {
    const list = body.latest_game_info?.version_list ?? [];
    matchVersion = list.length ? Math.max(...list) : null;
  }

  return { name: body.nickname ?? null, characters, matchVersion };
}

/** Fetch a player's profile and derive per-character rank/usage. Never throws on
 *  one player's failure — logs and returns `ok: false` so the job degrades. */
export async function getPlayerInfo(
  tekkenId: string,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<TknowPlayer> {
  const fail: TknowPlayer = { ok: false, name: null, characters: [], matchVersion: null };
  const pid = undash(tekkenId);
  const url = `${baseUrl}/player/info/${pid}`;
  let body: TknowInfoResponse;
  try {
    const res = await fetchWithRetry(url, { headers });
    if (res.status === 404) {
      console.warn(`[tknow] ${tekkenId}: not found (HTTP 404).`);
      return { ...fail, ok: true }; // reachable, just no such player
    }
    if (!res.ok) {
      console.warn(`[tknow] ${tekkenId}: info HTTP ${res.status}.`);
      return fail;
    }
    body = (await res.json()) as TknowInfoResponse;
  } catch (err) {
    console.warn(`[tknow] ${tekkenId}: info fetch failed —`, (err as Error).message);
    return fail;
  }
  return { ok: true, ...parsePlayerInfo(body) };
}

// ── /player/match ────────────────────────────────────────────────────────────
export interface TknowMatchRow {
  battle_id: string;
  battle_at: number; // unix seconds
  battle_type: number;
  is_win: number; // 1 if the queried ("my") side won
  my_polaris_id: string;
  my_name: string;
  my_chara: number | null;
  my_rank: number | null;
  my_rounds: number;
  my_region_id?: number | null;
  enemy_polaris_id: string;
  enemy_name: string;
  enemy_chara: number | null;
  enemy_rank: number | null;
  enemy_rounds: number;
  enemy_region_id?: number | null;
}
interface TknowMatchResponse {
  count?: number;
  data?: TknowMatchRow[];
}

/** One tknow match, normalized to a canonical orientation (p1.polarisId ≤
 *  p2.polarisId) so the same `battleId` seen from either player's feed yields an
 *  identical Match. */
export interface TknowBattleSide {
  polarisId: string; // undashed
  name: string;
  character: string | null; // slug
  rank: string | null; // rank slug
  rounds: number;
  region: string | null;
}
export interface TknowBattle {
  battleId: string;
  battleAt: string; // ISO-8601 UTC
  battleType: MatchType;
  p1: TknowBattleSide;
  p2: TknowBattleSide;
  winner: 'p1' | 'p2';
}

function toSide(row: TknowMatchRow, which: 'my' | 'enemy'): TknowBattleSide {
  const my = which === 'my';
  return {
    polarisId: undash(my ? row.my_polaris_id : row.enemy_polaris_id),
    name: my ? row.my_name : row.enemy_name,
    character: fromCharacterId(my ? row.my_chara : row.enemy_chara),
    rank: rankFromDanRank(my ? row.my_rank : row.enemy_rank).slug,
    rounds: (my ? row.my_rounds : row.enemy_rounds) ?? 0,
    region: regionName(my ? row.my_region_id : row.enemy_region_id),
  };
}

/** Normalize one raw tknow match row to a canonical TknowBattle (also used by
 *  unit tests). Returns null for malformed rows. */
export function normalizeMatch(row: TknowMatchRow): TknowBattle | null {
  if (!row.battle_id || !row.my_polaris_id || !row.enemy_polaris_id) return null;
  const at = (row.battle_at ?? 0) * 1000;
  if (!Number.isFinite(at) || at <= 0) return null;

  const my = toSide(row, 'my');
  const enemy = toSide(row, 'enemy');
  const myWon = Number(row.is_win) === 1;
  const p1IsMy = my.polarisId <= enemy.polarisId;
  const [p1, p2] = p1IsMy ? [my, enemy] : [enemy, my];
  return {
    battleId: row.battle_id,
    battleAt: new Date(at).toISOString(),
    battleType: battleType(row.battle_type),
    p1,
    p2,
    winner: myWon === p1IsMy ? 'p1' : 'p2',
  };
}

/** Fetch a player's match history for one game `version`, newest-first. Paginates
 *  until a page adds no new battles (the API repeats the first page when a
 *  version has few matches) or — for incremental daily runs — until it reaches a
 *  battle we already have (`knownIds`), since everything older is already stored.
 *  Never throws; logs and returns what it gathered. */
export async function getPlayerMatches(
  tekkenId: string,
  version: number,
  baseUrl: string,
  headers: Record<string, string>,
  opts: { knownIds?: Set<string>; maxPages?: number } = {},
): Promise<TknowBattle[]> {
  const { knownIds, maxPages = 20 } = opts;
  const pid = undash(tekkenId);
  const out: TknowBattle[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const url = `${baseUrl}/player/match/${pid}?version=${version}&page=${page}`;
    let body: TknowMatchResponse;
    try {
      const res = await fetchWithRetry(url, { headers });
      if (!res.ok) {
        console.warn(`[tknow] ${tekkenId}: match HTTP ${res.status} (page ${page}).`);
        break;
      }
      body = (await res.json()) as TknowMatchResponse;
    } catch (err) {
      console.warn(`[tknow] ${tekkenId}: match fetch failed (page ${page}) —`, (err as Error).message);
      break;
    }

    const rows = body.data ?? [];
    if (rows.length === 0) break;

    let newOnPage = 0;
    let hitKnown = false;
    for (const row of rows) {
      if (!row.battle_id || seen.has(row.battle_id)) continue;
      seen.add(row.battle_id);
      newOnPage += 1;
      if (knownIds?.has(row.battle_id)) {
        hitKnown = true; // already stored; older matches follow — stop after page
        continue;
      }
      const battle = normalizeMatch(row);
      if (battle) out.push(battle);
    }

    if (newOnPage === 0 || hitKnown) break;
  }

  return out;
}
