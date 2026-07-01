// Core domain types shared by the frontend and the pipeline scripts (spec §1.2).
import type { CharacterSlug } from '@/data/characters';

export type { CharacterSlug };

export type Platform = 'steam' | 'playstation' | 'xbox';

export type WavuConfidence = 'leaderboard' | 'unqualified' | 'provisional';

export interface PlayerSocials {
  twitch?: string;
  twitter?: string;
  youtube?: string;
  discord?: string;
}

export interface Player {
  id: string; // stable internal slug, used in URLs and as the join key
  tekken_id: string | null; // dashed Polaris id (§7.1); null if unresolved
  player_tag: string; // display name (matches EWGF/Wavu handle)
  platform: Platform;
  main_character: CharacterSlug;
  peak_rank: string | null; // rank slug override/fallback, or null → derive
  aliases?: string[]; // extra tags the match sheet may use (§4.3)
  // Optional profile picture, path under public/ (e.g. "avatars/nick.png").
  // When unset, the UI falls back to the main-character portrait, then to a
  // colored initial. The per-player accent ring is applied either way.
  avatar?: string;
  socials?: PlayerSocials;
}

/** Composite `${tekken_id}:${character}` join key across ranks/glicko/history. */
export function makePairId(tekkenId: string, character: CharacterSlug): string {
  return `${tekkenId}:${character}`;
}
