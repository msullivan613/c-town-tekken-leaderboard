import type { PairViewModel, SortKey, LeaderboardView } from '@/lib/leaderboard';
import { RankBadge } from './RankBadge';
import { MmrCell } from './MmrCell';
import { PlayerLink } from './PlayerAccent';
import { CharacterName } from './CharacterName';
import { accentColor } from '@/lib/accent';

interface Props {
  rows: PairViewModel[];
  view: LeaderboardView;
  sort: SortKey;
  startRank?: number;
  onSortChange: (s: SortKey) => void;
}

function SortHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`eyebrow inline-flex items-center gap-1 ${
        active ? '!text-accent-2' : 'hover:!text-fg'
      }`}
    >
      {label}
      {active && <span aria-hidden>▾</span>}
    </button>
  );
}

export function LeaderboardTable({
  rows,
  view,
  sort,
  startRank = 1,
  onSortChange,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-left align-middle">
            <th className="w-10 px-2 pb-1 sm:w-14 sm:px-3">
              <span className="eyebrow">#</span>
            </th>
            <th className="px-2 pb-1 sm:px-3">
              <span className="eyebrow">Player</span>
            </th>
            <th className="px-2 pb-1 sm:px-3">
              <span className="eyebrow">Character</span>
            </th>
            <th className="px-2 pb-1 sm:px-3">
              <SortHeader
                label="Rank"
                active={sort === 'rank'}
                onClick={() => onSortChange('rank')}
              />
            </th>
            <th className="px-2 pb-1 sm:px-3">
              <SortHeader
                label="MMR"
                active={sort === 'mmr'}
                onClick={() => onSortChange('mmr')}
              />
            </th>
            <th className="hidden px-2 pb-1 sm:table-cell sm:px-3">
              <span className="eyebrow">Peak</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const pos = startRank + i;
            const accent = accentColor(p.playerId);
            return (
              <tr
                key={p.pairId}
                className="group bg-surface/70 transition-colors hover:bg-surface-2"
              >
                <td
                  className="rounded-l px-2 py-2.5 sm:px-3"
                  style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
                >
                  <span className="font-numeral text-xl leading-none text-muted group-hover:text-fg sm:text-2xl">
                    {pos}
                  </span>
                </td>
                <td className="px-2 py-2.5 sm:px-3">
                  <PlayerLink playerId={p.playerId} tag={p.playerTag} />
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                  <CharacterName slug={p.character} isMain={p.isMain} />
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                  <RankBadge
                    rank={p.rank}
                    iconSize={22}
                    labelClassName="hidden sm:inline"
                  />
                </td>
                <td className="rounded-r px-2 py-2.5 sm:rounded-none sm:px-3">
                  <MmrCell
                    mmr={p.mmr}
                    provisional={p.provisional}
                    confidence={p.confidence}
                  />
                </td>
                <td className="hidden rounded-r px-2 py-2.5 sm:table-cell sm:px-3">
                  <RankBadge rank={p.peakRank} iconSize={18} showLabel={false} />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="bg-surface/70 px-3 py-10 text-center text-muted">
                No qualifying pairs yet — data appears after the first pipeline run.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {view === 'pairs' && rows.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          The bar on each row marks the player — one person can hold several spots.
        </p>
      )}
    </div>
  );
}
