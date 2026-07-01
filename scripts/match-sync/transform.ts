// Pure row → Match transform with validation & name resolution (spec §4.3).
// Kept separate from index.ts (I/O) so it's straightforward to unit-test.
import { canonicalizeCharacter } from '@/data/characters';
import type { Match, MatchType, RejectedRow } from '@/types/data-files';
import type { CharacterSlug, Player } from '@/types/domain';
import type { SheetRow } from './sheet';

export interface BuildResult {
  matches: Match[];
  rejected: RejectedRow[];
}

/** Case-insensitive tag/alias/id → player id map. */
export function buildTagIndex(players: Player[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const p of players) {
    idx.set(p.id.toLowerCase(), p.id);
    idx.set(p.player_tag.toLowerCase(), p.id);
    for (const alias of p.aliases ?? []) idx.set(alias.toLowerCase(), p.id);
  }
  return idx;
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseScore(s: string): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  return Number(s.trim());
}

const MATCH_TYPES: MatchType[] = ['quick', 'ranked', 'player', 'group'];

function normMatchType(s: string | undefined): MatchType {
  const v = (s ?? '').trim().toLowerCase().replace(/\s*match$/, '');
  return (MATCH_TYPES as string[]).includes(v) ? (v as MatchType) : null;
}

/** Combine the row's date + optional `time` (HH:MM[:SS], interpreted UTC) into an
 *  ISO-8601 conclusion timestamp. Blank/invalid time ⇒ null (day-only). */
function normPlayedAt(date: string, time: string | undefined): string | null {
  const t = (time ?? '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(hh)}:${pad(mm)}:${pad(ss)}Z`;
}

function resolveChar(
  raw: string | undefined,
): { ok: true; value: CharacterSlug | null } | { ok: false; name: string } {
  const name = (raw ?? '').trim();
  if (!name) return { ok: true, value: null };
  const slug = canonicalizeCharacter(name);
  if (!slug) return { ok: false, name };
  return { ok: true, value: slug };
}

export function buildMatches(rows: SheetRow[], players: Player[]): BuildResult {
  const tagIndex = buildTagIndex(players);
  const matches: Match[] = [];
  const rejected: RejectedRow[] = [];
  const perDateCount = new Map<string, number>();

  rows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    const reject = (reason: string) => rejected.push({ rowNumber, reason, raw });

    const date = (raw.date ?? '').trim();
    if (!isValidDate(date)) return reject(`invalid date '${raw.date ?? ''}'`);

    const tagA = (raw.player_a ?? '').trim();
    const tagB = (raw.player_b ?? '').trim();
    const idA = tagIndex.get(tagA.toLowerCase());
    const idB = tagIndex.get(tagB.toLowerCase());
    if (!idA) return reject(`unknown player tag '${tagA}'`);
    if (!idB) return reject(`unknown player tag '${tagB}'`);

    const scoreA = parseScore(raw.score_a ?? '');
    const scoreB = parseScore(raw.score_b ?? '');
    if (scoreA === null || scoreB === null)
      return reject(`non-integer score '${raw.score_a}'–'${raw.score_b}'`);
    if (scoreA === 0 && scoreB === 0) return reject('both scores are zero');

    const charA = resolveChar(raw.char_a);
    if (!charA.ok) return reject(`unknown character '${charA.name}'`);
    const charB = resolveChar(raw.char_b);
    if (!charB.ok) return reject(`unknown character '${charB.name}'`);

    const indexOnDate = perDateCount.get(date) ?? 0;
    perDateCount.set(date, indexOnDate + 1);

    matches.push({
      id: `${date}#${indexOnDate}`,
      date,
      playedAt: normPlayedAt(date, raw.time),
      playerA: idA,
      playerB: idB,
      charA: charA.value,
      charB: charB.value,
      scoreA,
      scoreB,
      matchType: normMatchType(raw.match_type),
    });
  });

  // Sort by date; Array.sort is stable, so sheet order is preserved within a
  // date (which matches the indexOnDate encoded in each id).
  matches.sort((a, b) => a.date.localeCompare(b.date));
  return { matches, rejected };
}
