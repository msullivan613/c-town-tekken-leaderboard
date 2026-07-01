import { Link } from 'react-router-dom';
import type { Match } from '@/types/data-files';
import { useData } from '@/data/DataProvider';
import { concludedAgo, matchTimestamp, matchTypeLabel } from '@/lib/format';
import { MatchSideLabel } from './MatchSide';

// Versus-screen match rows: P1 on the left, P2 on the right, rounds charged in
// the middle. The winner's side lights up. Opponents may be non-crew randoms.
export function RecentMatchesStrip({ limit = 20 }: { limit?: number }) {
  const { matches } = useData();
  const recent = [...(matches?.matches ?? [])]
    .sort((a, b) => matchTimestamp(b.playedAt) - matchTimestamp(a.playedAt))
    .slice(0, limit);
  if (recent.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold">Recent Matches</h2>
        <Link to="/matches" className="eyebrow">
          All matches →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {recent.map((m: Match) => {
          const aWon = m.winner === 'a';
          return (
            <li
              key={m.id}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-surface/70 px-3 py-2 text-sm sm:gap-4"
            >
              <div className="justify-self-end">
                <MatchSideLabel side={m.a} align="right" won={aWon} />
              </div>

              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 font-numeral text-2xl leading-none">
                  <span className={aWon ? 'text-p1' : 'text-muted'}>{m.roundsA}</span>
                  <span className="text-xs text-muted">VS</span>
                  <span className={!aWon ? 'text-p2' : 'text-muted'}>{m.roundsB}</span>
                </div>
                <span
                  className="mt-0.5 text-[10px] uppercase tracking-widest text-muted"
                  title={m.playedAt}
                >
                  {concludedAgo(m.playedAt)}
                  {m.battleType ? ` · ${matchTypeLabel(m.battleType)}` : ''}
                </span>
              </div>

              <div className="justify-self-start">
                <MatchSideLabel side={m.b} align="left" won={!aWon} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
