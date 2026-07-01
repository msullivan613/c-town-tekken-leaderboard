import { useMemo, useState } from 'react';
import { useData } from '@/data/DataProvider';
import { config } from '@/config';
import {
  collapseToBestPair,
  sortPairs,
  type LeaderboardView,
  type SortKey,
} from '@/lib/leaderboard';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { ChampionHero } from '@/components/ChampionHero';
import { ViewToggle } from '@/components/ViewToggle';
import { RecentMatchesStrip } from '@/components/RecentMatchesStrip';
import { LastUpdated } from '@/components/LastUpdated';

export function LeaderboardPage() {
  const { pairs, lastUpdated, loading, error } = useData();
  const [view, setView] = useState<LeaderboardView>(
    config.leaderboard.defaultView,
  );
  const [sort, setSort] = useState<SortKey>(config.leaderboard.defaultSort);

  const rows = useMemo(() => {
    const base =
      view === 'players'
        ? collapseToBestPair(pairs, config.leaderboard.bestPairMetric)
        : pairs;
    return sortPairs(base, sort);
  }, [pairs, view, sort]);

  const champ = rows[0];
  const rest = rows.slice(1);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Tekken 8 · Crew Ladder</p>
          <h1 className="text-4xl font-bold sm:text-5xl">The Standings</h1>
          <LastUpdated iso={lastUpdated} />
        </div>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {error ? (
        <p className="border border-border bg-surface p-4 text-muted">
          Couldn&apos;t load roster: {error.message}
        </p>
      ) : loading ? (
        <p className="text-muted">Loading the board…</p>
      ) : (
        <>
          {champ && <ChampionHero champ={champ} />}
          <div className="mt-5">
            <LeaderboardTable
              rows={rest}
              view={view}
              sort={sort}
              startRank={2}
              onSortChange={setSort}
            />
          </div>
        </>
      )}

      <RecentMatchesStrip />
    </div>
  );
}
