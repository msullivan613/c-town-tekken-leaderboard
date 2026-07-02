// ewgf.gg public-API client (issue #3). Sources GROUP + PLAYER (custom-lobby)
// matches — the head-to-head crew battles that tknow does not surface (tknow only
// exposes quick + ranked; empirically verified). ewgf went closed-source in Oct
// 2025, but its documented public REST API still works with a per-account key:
//
//   GET https://api.ewgf.gg/external/battles/{undashedTekkenId}
//   Authorization: Bearer <EWGF_API_KEY>
//
// Free tier returns the 50 most-recent battles per player as a continuously-
// sliding window with a ~24h staleness lag (so the 6-hourly job, accumulating
// append-only, captures everything short of an extreme grinder). We take ONLY
// group/player battles here; quick/ranked stay with tknow, which carries real
// battle_ids and has no 50-cap. ewgf battle rows have no id, so we synthesize a
// deterministic one (canonical orientation) that dedups the same battle seen from
// both players' feeds and across runs.
import { fromEwgf } from '@/data/characters';
import { rankFromName } from '@/data/ranks';
import type { MatchType } from '@/types/data-files';
import type { TknowBattle, TknowBattleSide } from './tknow';
import { fetchWithRetry } from '../shared/http';

// ewgf `battle_type` is a string enum (game's Polaris codes: quick=1, ranked=2,
// group=3, player=4). We only keep the custom-lobby types.
const CUSTOM_BATTLE_TYPES: Record<string, MatchType> = {
  GROUP_BATTLE: 'group',
  PLAYER_BATTLE: 'player',
};

function undash(id: string): string {
  return id.replaceAll('-', '');
}

// ── /external/battles/{id} ───────────────────────────────────────────────────
export interface EwgfBattleRow {
  battle_at: string; // ISO-8601 UTC
  battle_type: string; // "QUICK_BATTLE" | "RANKED_BATTLE" | "GROUP_BATTLE" | "PLAYER_BATTLE"
  winner: number; // 1 = p1 won, 2 = p2 won
  p1_name: string;
  p1_tekken_id: string;
  p1_char: string | null; // display name, e.g. "Jun"
  p1_dan_rank: string | null; // display name, e.g. "God of Destruction V"
  p1_rounds_won: number;
  p2_name: string;
  p2_tekken_id: string;
  p2_char: string | null;
  p2_dan_rank: string | null;
  p2_rounds_won: number;
}
interface EwgfBattlesResponse {
  _metadata?: {
    rate_limit_remaining?: number;
    rate_limit_reset?: string;
    tier?: string;
  };
  data?: EwgfBattleRow[];
}

function toSide(row: EwgfBattleRow, which: 'p1' | 'p2'): TknowBattleSide {
  const p1 = which === 'p1';
  return {
    polarisId: undash(p1 ? row.p1_tekken_id : row.p2_tekken_id),
    name: p1 ? row.p1_name : row.p2_name,
    character: fromEwgf(p1 ? row.p1_char : row.p2_char),
    rank: rankFromName(p1 ? row.p1_dan_rank : row.p2_dan_rank).slug,
    rounds: (p1 ? row.p1_rounds_won : row.p2_rounds_won) ?? 0,
    region: null, // /external/battles carries a region *name* we don't store on matches
  };
}

/** Deterministic id for an ewgf battle (which has none). Uses the canonical
 *  orientation + second-resolution timestamp, so the same battle from either
 *  player's feed — and re-fetched on later runs — yields the same id. The `ewgf:`
 *  prefix keeps it from ever colliding with a tknow battle_id. */
function synthId(loPolaris: string, hiPolaris: string, atMs: number): string {
  return `ewgf:${loPolaris}-${hiPolaris}:${Math.floor(atMs / 1000)}`;
}

/** Normalize one raw ewgf battle row to a canonical TknowBattle, or null for
 *  non-custom-lobby (quick/ranked) or malformed rows. Also used by unit tests. */
export function normalizeEwgfBattle(row: EwgfBattleRow): TknowBattle | null {
  const battleType = CUSTOM_BATTLE_TYPES[row.battle_type];
  if (!battleType) return null; // quick/ranked come from tknow
  if (!row.p1_tekken_id || !row.p2_tekken_id) return null;
  const at = Date.parse(row.battle_at);
  if (!Number.isFinite(at) || at <= 0) return null;

  const s1 = toSide(row, 'p1');
  const s2 = toSide(row, 'p2');
  const p1IsRowP1 = s1.polarisId <= s2.polarisId;
  const [p1, p2] = p1IsRowP1 ? [s1, s2] : [s2, s1];
  const rowP1Won = Number(row.winner) === 1;
  return {
    battleId: synthId(p1.polarisId, p2.polarisId, at),
    battleAt: new Date(at).toISOString(),
    battleType,
    p1,
    p2,
    winner: rowP1Won === p1IsRowP1 ? 'p1' : 'p2',
  };
}

/** Fetch a player's group + player (custom-lobby) matches from ewgf. Never throws
 *  on one player's failure — logs and returns []. Returns `{ ok }` so the caller
 *  can tell "reachable, no custom matches" from "fetch failed". */
export async function getPlayerCustomMatches(
  tekkenId: string,
  baseUrl: string,
  apiKey: string,
  userAgent: string,
): Promise<{ ok: boolean; battles: TknowBattle[] }> {
  const url = `${baseUrl}/battles/${undash(tekkenId)}`;
  let body: EwgfBattlesResponse;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
    });
    if (res.status === 404) {
      console.warn(`[ewgf] ${tekkenId}: not found (HTTP 404).`);
      return { ok: true, battles: [] }; // reachable, just no such player
    }
    if (!res.ok) {
      console.warn(`[ewgf] ${tekkenId}: battles HTTP ${res.status}.`);
      return { ok: false, battles: [] };
    }
    body = (await res.json()) as EwgfBattlesResponse;
  } catch (err) {
    console.warn(`[ewgf] ${tekkenId}: battles fetch failed —`, (err as Error).message);
    return { ok: false, battles: [] };
  }

  const battles: TknowBattle[] = [];
  for (const row of body.data ?? []) {
    const battle = normalizeEwgfBattle(row);
    if (battle) battles.push(battle);
  }
  return { ok: true, battles };
}
