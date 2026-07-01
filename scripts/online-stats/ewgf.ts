// EWGF public API client (spec §3.2 / §7.2). GET /external/battles/{tekkenId}.
// Requires Authorization: Bearer <EWGF_API_KEY>; the gateway 401s without a valid
// key. The free tier returns the player's last 50 battles (24h delayed) and does
// NOT expose profile metadata, so per-character rank/usage is derived from the
// battle list itself (latest dan_rank per character = their current rank).
import { canonicalizeCharacter } from '@/data/characters';
import { rankFromName } from '@/data/ranks';
import { fetchWithRetry } from '../shared/http';

export interface EwgfCharacterStat {
  character: string; // canonical slug
  rank: string | null; // rank slug
  rankTier: number | null; // normalized dan int
  rankedGames: number; // ranked battles seen in the window
  region: string | null;
  lastSeen: string | null; // ISO
}

// Verified public EwgfBattle shape (spec §7.2). One battle = one match to 3 rounds.
// A crew-vs-crew battle appears in both players' lists with identical orientation.
export interface EwgfBattle {
  battle_at: string; // ISO-8601 UTC, e.g. "2026-06-21T03:56:41Z"
  battle_type: string; // "QUICK_BATTLE"|"RANKED_BATTLE"|"GROUP_BATTLE"|"PLAYER_BATTLE"
  game_version?: number;
  winner: number; // 1 | 2
  stage_id?: number;
  p1_name: string;
  p1_tekken_id: string; // undashed
  p1_char: string; // display name, e.g. "Bryan"
  p1_region: string | null;
  p1_dan_rank: string | null; // display name, e.g. "Tekken God"
  p1_tekken_power?: number;
  p1_rounds_won: number;
  p2_name: string;
  p2_tekken_id: string;
  p2_char: string;
  p2_region: string | null;
  p2_dan_rank: string | null;
  p2_tekken_power?: number;
  p2_rounds_won: number;
}

interface BattlesResponse {
  _metadata?: {
    rate_limit_remaining?: number;
    rate_limit_reset?: string;
    tier?: string;
  };
  data?: EwgfBattle[];
}

export interface EwgfPlayer {
  characters: EwgfCharacterStat[];
  battles: EwgfBattle[];
}

function undash(id: string): string {
  return id.replaceAll('-', '');
}

/** The tracked player's own side of a battle (null if they aren't in it). */
function ownSide(battle: EwgfBattle, undashedId: string): 1 | 2 | null {
  if (undash(battle.p1_tekken_id) === undashedId) return 1;
  if (undash(battle.p2_tekken_id) === undashedId) return 2;
  return null;
}

/** Derive per-character rank/usage from the player's own battles. Rank on each
 *  character is the dan_rank of their most-recent battle on it (§3.2). */
function deriveCharacters(tekkenId: string, battles: EwgfBattle[]): EwgfCharacterStat[] {
  const undashed = undash(tekkenId);

  interface Acc {
    rankedGames: number;
    latestAt: number;
    danName: string | null;
    region: string | null;
  }
  const byChar = new Map<string, Acc>();

  for (const b of battles) {
    const side = ownSide(b, undashed);
    if (!side) continue;
    const charName = side === 1 ? b.p1_char : b.p2_char;
    const slug = canonicalizeCharacter(charName);
    if (!slug) {
      console.warn(`[ewgf] ${tekkenId}: unmapped character "${charName}" — skipped.`);
      continue;
    }
    const danName = side === 1 ? b.p1_dan_rank : b.p2_dan_rank;
    const region = side === 1 ? b.p1_region : b.p2_region;
    const at = Date.parse(b.battle_at);

    const acc = byChar.get(slug) ?? {
      rankedGames: 0,
      latestAt: -Infinity,
      danName: null,
      region: null,
    };
    if (b.battle_type === 'RANKED_BATTLE') acc.rankedGames += 1;
    if (Number.isFinite(at) && at > acc.latestAt) {
      acc.latestAt = at;
      acc.danName = danName;
      acc.region = region;
    }
    byChar.set(slug, acc);
  }

  const out: EwgfCharacterStat[] = [];
  for (const [character, acc] of byChar) {
    const { slug: rank, tier: rankTier } = rankFromName(acc.danName);
    out.push({
      character,
      rank,
      rankTier,
      rankedGames: acc.rankedGames,
      region: acc.region,
      lastSeen: Number.isFinite(acc.latestAt)
        ? new Date(acc.latestAt).toISOString()
        : null,
    });
  }
  return out;
}

/** Fetch a player's recent battles from EWGF and derive their per-character
 *  stats. Never throws on a single player's failure — logs and returns empty
 *  data so the daily job degrades gracefully (§3.2). */
export async function getPlayer(
  tekkenId: string,
  apiKey: string,
  baseUrl: string,
  battlesPath: string,
): Promise<EwgfPlayer> {
  const empty: EwgfPlayer = { characters: [], battles: [] };
  const url = `${baseUrl}${battlesPath}/${tekkenId}`;
  let body: BattlesResponse;
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
    if (res.status === 404) {
      console.warn(`[ewgf] ${tekkenId}: not found (HTTP 404).`);
      return empty;
    }
    if (!res.ok) {
      console.warn(`[ewgf] ${tekkenId}: HTTP ${res.status}.`);
      return empty;
    }
    body = (await res.json()) as BattlesResponse;
  } catch (err) {
    console.warn(`[ewgf] ${tekkenId}: fetch failed —`, (err as Error).message);
    return empty;
  }

  const battles = body.data ?? [];
  return { characters: deriveCharacters(tekkenId, battles), battles };
}
