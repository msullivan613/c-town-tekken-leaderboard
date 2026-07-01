import { useMemo, useState } from 'react';
import { useData } from '@/data/DataProvider';
import { formatDate, matchTypeLabel } from '@/lib/format';
import { CharacterIcon } from '@/components/icons';

const MATCH_TYPES = ['quick', 'ranked', 'player', 'group'] as const;

export function MatchesPage() {
  const { matches, players, playerById } = useData();
  const [player, setPlayer] = useState('');
  const [matchType, setMatchType] = useState('');

  const rows = useMemo(() => {
    let list = [...(matches?.matches ?? [])].reverse();
    if (player) list = list.filter((m) => m.playerA === player || m.playerB === player);
    if (matchType) list = list.filter((m) => m.matchType === matchType);
    return list;
  }, [matches, player, matchType]);

  const rejected = matches?.rejected ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-4xl">Matches</h1>

      {rejected.length > 0 && (
        <div className="rounded-lg border border-[rgb(240_150_70)] bg-[rgb(240_150_70)]/10 p-3 text-sm">
          <strong>{rejected.length} row(s) need fixing in the sheet:</strong>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {rejected.map((r) => (
              <li key={r.rowNumber}>
                Row {r.rowNumber}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="">All players</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.player_tag}
            </option>
          ))}
        </select>
        <select
          value={matchType}
          onChange={(e) => setMatchType(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="">Any match type</option>
          {MATCH_TYPES.map((t) => (
            <option key={t} value={t}>
              {matchTypeLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Player A</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Player B</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Event</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted">{formatDate(m.date)}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    {m.charA && <CharacterIcon slug={m.charA} size={20} />}
                    {playerById.get(m.playerA)?.player_tag ?? m.playerA}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  {m.scoreA}–{m.scoreB}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    {m.charB && <CharacterIcon slug={m.charB} size={20} />}
                    {playerById.get(m.playerB)?.player_tag ?? m.playerB}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{matchTypeLabel(m.matchType)}</td>
                <td className="px-3 py-2 text-muted">{m.event ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
