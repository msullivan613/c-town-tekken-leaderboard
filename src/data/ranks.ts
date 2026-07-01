// Tekken 8 rank ladder, generated from EWGF's verified `rankOrderMap` (spec §7.5).
//
// EWGF returns `currentSeasonDanRank` as an integer. We use the *normalized* dan
// integer as our `tier` (higher = better) and derive a stable slug for storage.
// Two encodings of "God of Destruction" (29..37 and 100..107/765) are normalized
// onto a single 29..37 ordering.

export interface RankTier {
  slug: string; // "tekken_god_supreme"
  display: string; // "Tekken God Supreme"
  tier: number; // normalized dan integer, higher = better
  colorVar: string; // CSS custom-property token, e.g. "--rank-god"
  icon: string; // asset path (BASE_URL-relative)
}

// Verified rankOrderMap (spec §7.5). The 100+/765 block is an alt encoding of
// 29..37 and is intentionally omitted here — normalizeDanRank() folds it down.
export const rankOrderMap: Record<number, string> = {
  0: 'Beginner',
  1: '1st Dan',
  2: '2nd Dan',
  3: 'Fighter',
  4: 'Strategist',
  5: 'Combatant',
  6: 'Brawler',
  7: 'Ranger',
  8: 'Cavalry',
  9: 'Warrior',
  10: 'Assailant',
  11: 'Dominator',
  12: 'Vanquisher',
  13: 'Destroyer',
  14: 'Eliminator',
  15: 'Garyu',
  16: 'Shinryu',
  17: 'Tenryu',
  18: 'Mighty Ruler',
  19: 'Flame Ruler',
  20: 'Battle Ruler',
  21: 'Fujin',
  22: 'Raijin',
  23: 'Kishin',
  24: 'Bushin',
  25: 'Tekken King',
  26: 'Tekken Emperor',
  27: 'Tekken God',
  28: 'Tekken God Supreme',
  29: 'God of Destruction',
  30: 'God of Destruction I',
  31: 'God of Destruction II',
  32: 'God of Destruction III',
  33: 'God of Destruction IV',
  34: 'God of Destruction V',
  35: 'God of Destruction VI',
  36: 'God of Destruction VII',
  37: 'God of Destruction Infinity',
};

/**
 * Normalize EWGF's `currentSeasonDanRank` to our `tier`.
 * - 100..107 are the same as 29..36 (offset by 71).
 * - 765 is the alt encoding of "God of Destruction Infinity" (37).
 * - null (unranked this season) → null.
 */
export function normalizeDanRank(danRank: number | null | undefined): number | null {
  if (danRank == null) return null;
  if (danRank === 765) return 37;
  if (danRank >= 100) return danRank - 71;
  return danRank;
}

function slugifyRank(display: string): string {
  return display
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Broad color bands (design tokens defined in src/styles/tokens.css). The design
// pass owns the exact palette; this just groups ranks into shared-color families.
function colorVarForTier(tier: number): string {
  if (tier >= 29) return '--rank-destruction';
  if (tier >= 27) return '--rank-god';
  if (tier >= 25) return '--rank-king';
  if (tier >= 21) return '--rank-fujin';
  if (tier >= 18) return '--rank-ruler';
  if (tier >= 15) return '--rank-garyu';
  if (tier >= 12) return '--rank-vanquisher';
  if (tier >= 9) return '--rank-warrior';
  if (tier >= 6) return '--rank-brawler';
  if (tier >= 3) return '--rank-fighter';
  if (tier >= 1) return '--rank-dan';
  return '--rank-beginner';
}

export const RANK_LADDER: RankTier[] = Object.entries(rankOrderMap)
  .map(([tierStr, display]) => {
    const tier = Number(tierStr);
    const slug = slugifyRank(display);
    return {
      slug,
      display,
      tier,
      colorVar: colorVarForTier(tier),
      icon: `rank-icons/${slug}.webp`,
    };
  })
  .sort((a, b) => a.tier - b.tier);

const BY_TIER = new Map<number, RankTier>(RANK_LADDER.map((r) => [r.tier, r]));
const BY_SLUG = new Map<string, RankTier>(RANK_LADDER.map((r) => [r.slug, r]));

export function rankByTier(tier: number | null | undefined): RankTier | null {
  if (tier == null) return null;
  return BY_TIER.get(tier) ?? null;
}

export function rankBySlug(slug: string | null | undefined): RankTier | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

/** Map a raw EWGF dan integer to our stored { slug, tier }, or nulls if unranked. */
export function rankFromDanRank(danRank: number | null | undefined): {
  slug: string | null;
  tier: number | null;
} {
  const tier = normalizeDanRank(danRank);
  if (tier == null) return { slug: null, tier: null };
  return { slug: rankByTier(tier)?.slug ?? null, tier };
}

// EWGF's public API returns rank as a *display name* ("Tekken God"), not an int.
const BY_DISPLAY = new Map<string, RankTier>(
  RANK_LADDER.map((r) => [r.display.toLowerCase(), r]),
);

/** Map an EWGF rank display name to our stored { slug, tier }, or nulls if unknown. */
export function rankFromName(name: string | null | undefined): {
  slug: string | null;
  tier: number | null;
} {
  if (!name) return { slug: null, tier: null };
  const r = BY_DISPLAY.get(name.trim().toLowerCase());
  return r ? { slug: r.slug, tier: r.tier } : { slug: null, tier: null };
}
