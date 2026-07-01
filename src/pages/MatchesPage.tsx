import { useMemo, useState } from 'react';
import { useData } from '@/data/DataProvider';
import { concludedAgo, matchTimestamp, matchTypeLabel } from '@/lib/format';
import { MatchSideLabel } from '@/components/MatchSide';

const MATCH_TYPES = ['quick', 'ranked', 'player', 'group'] as const;

export function MatchesPage() {
  const { matches, players } = useData();
  const [player, setPlayer] = useState('');
  const [matchType, setMatchType] = useState('');
  const [crewOnly, setCrewOnly] = useState(false);

  const rows = useMemo(() => {
    let list = [...(matches?.matches ?? [])].sort(
      (a, b) => matchTimestamp(b.playedAt) - matchTimestamp(a.playedAt),
    );
    if (player)
      list = list.filter((m) => m.a.playerId === player || m.b.playerId === player);
    if (matchType) list = list.filter((m) => m.battleType === matchType);
    if (crewOnly) list = list.filter((m) => m.crew);
    return list;
  }, [matches, player, matchType, crewOnly]);

  return (
    <div className="space-y-4">
      <h1 className="text-4xl">Matches</h1>
      <p className="text-sm text-muted">
        Auto-gathered from tknow.gg — crew rivalries plus each player&apos;s recent
        games against anyone.
      </p>

      <div className="flex flex-wrap items-center gap-3">
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
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={crewOnly}
            onChange={(e) => setCrewOnly(e.target.checked)}
          />
          Crew vs crew only
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2 text-right">Player</th>
              <th className="px-3 py-2 text-center">Rounds</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const aWon = m.winner === 'a';
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted" title={m.playedAt}>
                    {concludedAgo(m.playedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <MatchSideLabel side={m.a} align="right" won={aWon} iconSize={20} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums">
                    <span className={aWon ? 'text-p1' : 'text-muted'}>{m.roundsA}</span>
                    <span className="text-muted">–</span>
                    <span className={!aWon ? 'text-p2' : 'text-muted'}>{m.roundsB}</span>
                  </td>
                  <td className="px-3 py-2">
                    <MatchSideLabel side={m.b} align="left" won={!aWon} iconSize={20} />
                  </td>
                  <td className="px-3 py-2 text-muted">{matchTypeLabel(m.battleType)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
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
