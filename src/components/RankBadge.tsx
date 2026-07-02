import type { RankTier } from '@/data/ranks';
import { EMPTY } from '@/lib/format';
import { RankIcon } from './icons';

export function RankBadge({
  rank,
  iconSize = 24,
  showLabel = true,
  labelClassName,
}: {
  rank: RankTier | null;
  iconSize?: number;
  showLabel?: boolean;
  /** Extra classes on the label span (e.g. `hidden sm:inline` to hide it on
   *  narrow screens while keeping the icon). */
  labelClassName?: string;
}) {
  if (!rank) return <span className="text-muted">{EMPTY}</span>;
  const color = `rgb(var(${rank.colorVar}))`;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-medium"
      style={{ color }}
      title={rank.display}
    >
      <RankIcon rank={rank} size={iconSize} />
      {showLabel && <span className={labelClassName}>{rank.display}</span>}
    </span>
  );
}
