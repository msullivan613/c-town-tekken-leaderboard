import { Link } from 'react-router-dom';
import type { Match } from '@/types/data-files';
import { useData } from '@/data/DataProvider';
import { formatDate } from '@/lib/format';
import { CharacterIcon } from './icons';

function tagOf(playerById: Map<string, { player_tag: string }>, id: string): string {
  return playerById.get(id)?.player_tag ?? id;
}

// Versus-screen match rows: P1 on the left, P2 on the right, score charged in
// the middle. The winner's side lights up.
export function RecentMatchesStrip({ limit = 20 }: { limit?: number }) {
  const { matches, playerById } = useData();
  const recent = (matches?.matches ?? []).slice(-limit).reverse();
  if (recent.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold">Recent Sets</h2>
        <Link to="/matches" className="eyebrow">
          All matches →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {recent.map((m: Match) => {
          const aWon = m.scoreA > m.scoreB;
          const bWon = m.scoreB > m.scoreA;
          return (
            <li
              key={m.id}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-surface/70 px-3 py-2 text-sm sm:gap-4"
            >
              {/* P1 side */}
              <div
                className={`flex items-center justify-end gap-2 text-right ${aWon ? 'text-fg' : 'text-muted'}`}
              >
                <span className="truncate font-display uppercase tracking-wide">
                  {tagOf(playerById, m.playerA)}
                </span>
                {m.charA && <CharacterIcon slug={m.charA} size={22} />}
              </div>

              {/* score core */}
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 font-numeral text-2xl leading-none">
                  <span className={aWon ? 'text-p1' : 'text-muted'}>{m.scoreA}</span>
                  <span className="text-xs text-muted">VS</span>
                  <span className={bWon ? 'text-p2' : 'text-muted'}>{m.scoreB}</span>
                </div>
                <span className="mt-0.5 text-[10px] uppercase tracking-widest text-muted">
                  {formatDate(m.date)}
                  {m.setting ? ` · ${m.setting}` : ''}
                </span>
              </div>

              {/* P2 side */}
              <div
                className={`flex items-center gap-2 ${bWon ? 'text-fg' : 'text-muted'}`}
              >
                {m.charB && <CharacterIcon slug={m.charB} size={22} />}
                <span className="truncate font-display uppercase tracking-wide">
                  {tagOf(playerById, m.playerB)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
