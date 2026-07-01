import type { PairViewModel, SortKey, LeaderboardView } from '@/lib/leaderboard';
import { RankBadge } from './RankBadge';
import { MmrCell } from './MmrCell';
import { PlayerLink } from './PlayerAccent';
import { CharacterName } from './CharacterName';
import { platformIcon, platformLabel } from '@/lib/format';
import { accentColor } from '@/lib/accent';
import { useData } from '@/data/DataProvider';

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
  const { playerById } = useData();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-left align-middle">
            <th className="w-14 px-3 pb-1">
              <span className="eyebrow">#</span>
            </th>
            <th className="px-3 pb-1">
              <span className="eyebrow">Player</span>
            </th>
            <th className="px-3 pb-1">
              <span className="eyebrow">Character</span>
            </th>
            <th className="px-3 pb-1">
              <SortHeader
                label="Rank"
                active={sort === 'rank'}
                onClick={() => onSortChange('rank')}
              />
            </th>
            <th className="px-3 pb-1">
              <SortHeader
                label="MMR"
                active={sort === 'mmr'}
                onClick={() => onSortChange('mmr')}
              />
            </th>
            <th className="hidden px-3 pb-1 sm:table-cell">
              <span className="eyebrow">Main</span>
            </th>
            <th className="hidden px-3 pb-1 md:table-cell">
              <span className="eyebrow">Peak</span>
            </th>
            <th className="w-10 px-3 pb-1">
              <span className="eyebrow sr-only">Platform</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const player = playerById.get(p.playerId);
            const pos = startRank + i;
            const accent = accentColor(p.playerId);
            return (
              <tr
                key={p.pairId}
                className="group bg-surface/70 transition-colors hover:bg-surface-2"
              >
                <td
                  className="rounded-l px-3 py-2.5"
                  style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
                >
                  <span className="font-numeral text-2xl leading-none text-muted group-hover:text-fg">
                    {pos}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <PlayerLink playerId={p.playerId} tag={p.playerTag} />
                </td>
                <td className="px-3 py-2.5">
                  <CharacterName slug={p.character} isMain={p.isMain} />
                </td>
                <td className="px-3 py-2.5">
                  <RankBadge rank={p.rank} iconSize={22} />
                </td>
                <td className="px-3 py-2.5">
                  <MmrCell
                    mmr={p.mmr}
                    provisional={p.provisional}
                    confidence={p.confidence}
                  />
                </td>
                <td className="hidden px-3 py-2.5 text-muted sm:table-cell">
                  <CharacterName slug={player?.main_character ?? null} iconSize={18} />
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <RankBadge rank={p.peakRank} iconSize={18} showLabel={false} />
                </td>
                <td
                  className="rounded-r px-3 py-2.5 text-muted"
                  title={platformLabel(p.platform)}
                >
                  <span aria-hidden>{platformIcon(p.platform)}</span>
                  <span className="sr-only">{platformLabel(p.platform)}</span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="bg-surface/70 px-3 py-10 text-center text-muted">
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
