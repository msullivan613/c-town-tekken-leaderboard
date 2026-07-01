import { useState } from 'react';
import { useData } from '@/data/DataProvider';
import { rawH2H, directedH2H } from '@/lib/stats';
import { accentColor } from '@/lib/accent';
import { EMPTY } from '@/lib/format';
import type { Player } from '@/types/domain';

export function HeadToHeadPage() {
  const { players, stats } = useData();
  const [selected, setSelected] = useState<{ a: Player; b: Player } | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-4xl">Head-to-head</h1>
      <p className="text-sm text-muted">
        Cell = row player&apos;s game record vs column player. Click a cell for the
        full breakdown.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="px-3 py-2" />
              {players.map((p) => (
                <th key={p.id} className="px-3 py-2 text-xs" title={p.player_tag}>
                  <span style={{ color: accentColor(p.id) }}>
                    {p.player_tag.slice(0, 6)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <th
                  className="whitespace-nowrap px-3 py-2 text-left text-xs"
                  style={{ color: accentColor(row.id) }}
                >
                  {row.player_tag}
                </th>
                {players.map((col) => {
                  if (row.id === col.id) {
                    return (
                      <td key={col.id} className="bg-surface px-3 py-2 text-center text-muted">
                        ·
                      </td>
                    );
                  }
                  const rec = directedH2H(stats, row.id, col.id);
                  const total = rec ? rec.games + rec.oppGames : 0;
                  const share = total ? rec!.games / total : 0.5;
                  return (
                    <td
                      key={col.id}
                      className="cursor-pointer px-3 py-2 text-center font-mono tabular-nums hover:ring-1 hover:ring-accent"
                      style={{
                        backgroundColor: rec
                          ? `rgb(${Math.round(255 * (1 - share))} ${Math.round(180 * share)} 90 / 0.18)`
                          : undefined,
                      }}
                      onClick={() => rec && setSelected({ a: row, b: col })}
                    >
                      {rec ? `${rec.games}–${rec.oppGames}` : EMPTY}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <MatchupDrilldown
          a={selected.a}
          b={selected.b}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function MatchupDrilldown({
  a,
  b,
  onClose,
}: {
  a: Player;
  b: Player;
  onClose: () => void;
}) {
  const { stats } = useData();
  const rec = rawH2H(stats, a.id, b.id);
  if (!rec) return null;
  // headToHead is keyed idA<idB; map to a-vs-b orientation.
  const aIsFirst = a.id < b.id;
  const aGames = aIsFirst ? rec.gamesA : rec.gamesB;
  const bGames = aIsFirst ? rec.gamesB : rec.gamesA;
  const aSets = aIsFirst ? rec.setsA : rec.setsB;
  const bSets = aIsFirst ? rec.setsB : rec.setsA;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl">
          {a.player_tag} vs {b.player_tag}
        </h2>
        <button type="button" className="text-sm text-muted" onClick={onClose}>
          Close ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase text-muted">Games</div>
          <div className="font-numeral text-4xl leading-none">
            {aGames}
            <span className="text-muted"> – </span>
            {bGames}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted">Sets</div>
          <div className="font-numeral text-4xl leading-none">
            {aSets}
            <span className="text-muted"> – </span>
            {bSets}
          </div>
        </div>
      </div>
    </div>
  );
}
