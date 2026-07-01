// Canonical Tekken 8 character table.
//
// Verified (spec §7.6): EWGF `playedCharacters` and Wavu `.char` use the SAME
// display names ("Devil Jin", "Jack-8", "Yoshimitsu"), so the canonical key is
// the display name. We keep a URL-safe `slug` alongside it. No per-provider
// alias machinery is needed; an unrecognized name is logged and skipped by the
// pipeline (never silently mis-joined).

export interface CharacterMeta {
  slug: string; // URL-safe id, e.g. "devil_jin"
  displayName: string; // EWGF/Wavu display name, e.g. "Devil Jin"
}

// Source of truth: EWGF characterIdMap (spec §7.6). Order = roster/display order.
// slug rule: lowercase, drop apostrophes/periods, spaces→'_', hyphens removed.
const ROSTER: ReadonlyArray<readonly [displayName: string, slug: string]> = [
  ['Paul', 'paul'],
  ['Law', 'law'],
  ['King', 'king'],
  ['Yoshimitsu', 'yoshimitsu'],
  ['Hwoarang', 'hwoarang'],
  ['Xiaoyu', 'xiaoyu'],
  ['Jin', 'jin'],
  ['Bryan', 'bryan'],
  ['Kazuya', 'kazuya'],
  ['Steve', 'steve'],
  ['Jack-8', 'jack8'],
  ['Asuka', 'asuka'],
  ['Devil Jin', 'devil_jin'],
  ['Feng', 'feng'],
  ['Lili', 'lili'],
  ['Dragunov', 'dragunov'],
  ['Leo', 'leo'],
  ['Lars', 'lars'],
  ['Alisa', 'alisa'],
  ['Claudio', 'claudio'],
  ['Shaheen', 'shaheen'],
  ['Nina', 'nina'],
  ['Lee', 'lee'],
  ['Kuma', 'kuma'],
  ['Panda', 'panda'],
  ['Zafina', 'zafina'],
  ['Leroy', 'leroy'],
  ['Jun', 'jun'],
  ['Reina', 'reina'],
  ['Azucena', 'azucena'],
  ['Victor', 'victor'],
  ['Raven', 'raven'],
  ['Eddy', 'eddy'],
  ['Lidia', 'lidia'],
  ['Heihachi', 'heihachi'],
  ['Clive', 'clive'],
  ['Anna', 'anna'],
  ['Fahkumram', 'fahkumram'],
  ['Armor King', 'armor_king'],
  ['Kunimitsu', 'kunimitsu'],
  ['Miary Zo', 'miary_zo'],
];

export type CharacterSlug = string;

export const CHARACTERS: Record<string, CharacterMeta> = Object.fromEntries(
  ROSTER.map(([displayName, slug]) => [slug, { slug, displayName }]),
);

const BY_DISPLAY_NAME = new Map<string, CharacterMeta>(
  ROSTER.map(([displayName, slug]) => [
    displayName.toLowerCase(),
    { slug, displayName },
  ]),
);

const BY_SLUG = new Map<string, CharacterMeta>(
  ROSTER.map(([displayName, slug]) => [slug, { slug, displayName }]),
);

/** Resolve an EWGF/Wavu display name to our canonical slug, or null if unknown. */
export function canonicalizeCharacter(name: string | null | undefined): CharacterSlug | null {
  if (!name) return null;
  const meta = BY_DISPLAY_NAME.get(name.trim().toLowerCase());
  return meta ? meta.slug : null;
}

/** Both providers share names, so these are aliases of canonicalizeCharacter. */
export const fromEwgf = canonicalizeCharacter;
export const fromWavu = canonicalizeCharacter;

export function characterMeta(slug: CharacterSlug): CharacterMeta | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Human display name for a slug; falls back to the slug itself if unknown. */
export function characterDisplayName(slug: CharacterSlug): string {
  return BY_SLUG.get(slug)?.displayName ?? slug;
}

export function isKnownCharacter(slug: CharacterSlug): boolean {
  return BY_SLUG.has(slug);
}

// Numeric character id → display name (verified against tknow.gg's character
// table and EWGF's characterIdMap, spec §7.6/§7.9 — the two agree). tknow keys
// characters by this id in `current_ranks` and match rows. Gaps in the id space
// (25, 26, 27, 30, 31, 37, …) are reserved for as-yet-unreleased characters
// (e.g. Bob, Roger Jr., Yujiro); an unmapped id is logged and skipped by
// fromCharacterId until it ships and is added here.
export const characterIdMap: Record<number, string> = {
  0: 'Paul',
  1: 'Law',
  2: 'King',
  3: 'Yoshimitsu',
  4: 'Hwoarang',
  5: 'Xiaoyu',
  6: 'Jin',
  7: 'Bryan',
  8: 'Kazuya',
  9: 'Steve',
  10: 'Jack-8',
  11: 'Asuka',
  12: 'Devil Jin',
  13: 'Feng',
  14: 'Lili',
  15: 'Dragunov',
  16: 'Leo',
  17: 'Lars',
  18: 'Alisa',
  19: 'Claudio',
  20: 'Shaheen',
  21: 'Nina',
  22: 'Lee',
  23: 'Kuma',
  24: 'Panda',
  28: 'Zafina',
  29: 'Leroy',
  32: 'Jun',
  33: 'Reina',
  34: 'Azucena',
  35: 'Victor',
  36: 'Raven',
  38: 'Eddy',
  39: 'Lidia',
  40: 'Heihachi',
  41: 'Clive',
  42: 'Anna',
  43: 'Fahkumram',
  44: 'Armor King',
  45: 'Miary Zo',
  46: 'Kunimitsu',
};

/** Resolve a numeric character id (tknow/EWGF) to our canonical slug, or null. */
export function fromCharacterId(id: number | null | undefined): CharacterSlug | null {
  if (id == null) return null;
  const name = characterIdMap[id];
  return name ? canonicalizeCharacter(name) : null;
}
