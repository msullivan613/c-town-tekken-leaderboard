export const EMPTY = '—';

export function formatMmr(rating: number | null | undefined): string {
  if (rating == null) return EMPTY;
  return Math.round(rating).toLocaleString();
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction == null) return EMPTY;
  return `${Math.round(fraction * 100)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "2h ago", "3d ago" — for the Last updated label. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return EMPTY;
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function matchTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'quick':
      return 'Quick Match';
    case 'ranked':
      return 'Ranked Match';
    case 'player':
      return 'Player Match';
    case 'group':
      return 'Group Match';
    default:
      return EMPTY;
  }
}

/** Sortable epoch ms for an ISO timestamp. */
export function matchTimestamp(playedAt: string): number {
  const t = Date.parse(playedAt);
  return Number.isNaN(t) ? 0 : t;
}

/** "how long ago this match concluded" (e.g. "2h ago", "3d ago"). */
export function concludedAgo(playedAt: string): string {
  return relativeTime(playedAt);
}

export function platformLabel(platform: string): string {
  switch (platform) {
    case 'steam':
      return 'Steam';
    case 'playstation':
      return 'PlayStation';
    case 'xbox':
      return 'Xbox';
    default:
      return platform;
  }
}

export function platformIcon(platform: string): string {
  switch (platform) {
    case 'steam':
      return '🖥';
    case 'playstation':
      return '🎮';
    case 'xbox':
      return '🎮';
    default:
      return '•';
  }
}
