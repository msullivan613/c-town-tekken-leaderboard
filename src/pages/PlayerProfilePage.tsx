import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '@/data/DataProvider';
import { pairsForPlayer } from '@/lib/leaderboard';
import { directedH2H } from '@/lib/stats';
import { PlayerAccent } from '@/components/PlayerAccent';
import { RankBadge } from '@/components/RankBadge';
import { MmrCell } from '@/components/MmrCell';
import { CharacterName } from '@/components/CharacterName';
import { CharacterIcon } from '@/components/icons';
import { HistoryChart } from '@/components/HistoryChart';
import { MatchSideLabel } from '@/components/MatchSide';
import {
  EMPTY,
  concludedAgo,
  formatDate,
  formatPercent,
  matchTimestamp,
  platformLabel,
} from '@/lib/format';
import { characterDisplayName } from '@/data/characters';
import { rankBySlug } from '@/data/ranks';

export function PlayerProfilePage() {
  const { id = '' } = useParams();
  const { playerById, mainCharacterByPlayer, players, pairs, stats, history, matches } =
    useData();
  const player = playerById.get(id);
  const mainCharacter = mainCharacterByPlayer.get(id) ?? null;
  const [chartMode, setChartMode] = useState<'mmr' | 'rank'>('mmr');

  const myPairs = useMemo(() => pairsForPlayer(pairs, id), [pairs, id]);
  const pairIds = myPairs.map((p) => p.pairId);
  const myStats = stats?.players[id];

  const myMatches = useMemo(
    () =>
      (matches?.matches ?? [])
        .filter((m) => m.a.playerId === id || m.b.playerId === id)
        .sort((x, y) => matchTimestamp(y.playedAt) - matchTimestamp(x.playedAt))
        .slice(0, 15),
    [matches, id],
  );

  if (!player) {
    return (
      <div>
        <p className="text-muted">No player “{id}”.</p>
        <Link to="/">← Back to leaderboard</Link>
      </div>
    );
  }

  const peakRank = myPairs[0]?.peakRank ?? rankBySlug(player.peak_rank);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <PlayerAccent playerId={player.id} tag={player.player_tag} size={56} />
        <div>
          <h1 className="text-4xl">{player.player_tag}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span>{platformLabel(player.platform)}</span>
            <span className="inline-flex items-center gap-1.5">
              Main:{' '}
              {mainCharacter ? (
                <span className="inline-flex items-center gap-1.5 text-fg">
                  <CharacterIcon slug={mainCharacter} size={20} />
                  {characterDisplayName(mainCharacter)}
                </span>
              ) : (
                EMPTY
              )}
            </span>
            <span>
              Peak: {peakRank ? <RankBadge rank={peakRank} /> : EMPTY}
            </span>
          </div>
        </div>
      </header>

      {/* Stat cards */}
      {myStats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Win rate" value={formatPercent(myStats.winRate)} />
          <StatCard
            label="Match record"
            value={`${myStats.matchWins}–${myStats.matchLosses}`}
          />
          <StatCard label="Tracked matches" value={String(myStats.totalMatches)} />
          <StatCard
            label="Most played"
            value={
              myStats.mostPlayedCharacter
                ? characterDisplayName(myStats.mostPlayedCharacter)
                : EMPTY
            }
          />
        </section>
      )}

      {/* Characters */}
      <section>
        <h2 className="mb-2 text-xl">Characters</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Character</th>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">MMR</th>
                <th className="px-3 py-2">Games</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {myPairs.map((p) => (
                <tr key={p.pairId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <CharacterName slug={p.character} isMain={p.isMain} />
                  </td>
                  <td className="px-3 py-2">
                    <RankBadge rank={p.rank} />
                  </td>
                  <td className="px-3 py-2">
                    <MmrCell
                      mmr={p.mmr}
                      provisional={p.provisional}
                      confidence={p.confidence}
                    />
                  </td>
                  <td className="px-3 py-2 text-muted">{p.rankedGames || EMPTY}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(p.mmrUpdated)}</td>
                </tr>
              ))}
              {myPairs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No tracked characters yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* History */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl">History</h2>
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm">
            {(['mmr', 'rank'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                className={`px-3 py-1 rounded ${
                  chartMode === m ? 'bg-accent text-bg' : 'text-muted hover:text-fg'
                }`}
              >
                {m === 'mmr' ? 'MMR' : 'Rank'}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <HistoryChart
            file={chartMode === 'mmr' ? history.mmr : history.rank}
            pairIds={pairIds}
            mode={chartMode}
          />
        </div>
      </section>

      {/* Head-to-head */}
      <section>
        <h2 className="mb-2 text-xl">Head-to-head</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Opponent</th>
                <th className="px-3 py-2">Matches</th>
                <th className="px-3 py-2">Rounds</th>
              </tr>
            </thead>
            <tbody>
              {players
                .filter((o) => o.id !== id)
                .map((o) => {
                  const rec = directedH2H(stats, id, o.id);
                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link to={`/player/${o.id}`}>{o.player_tag}</Link>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums">
                        {rec ? `${rec.matches}–${rec.oppMatches}` : EMPTY}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-muted">
                        {rec ? `${rec.rounds}–${rec.oppRounds}` : EMPTY}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent matches */}
      <section>
        <h2 className="mb-2 text-xl">Recent matches</h2>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {myMatches.map((m) => {
            const meA = m.a.playerId === id;
            const myRounds = meA ? m.roundsA : m.roundsB;
            const oppRounds = meA ? m.roundsB : m.roundsA;
            const mySide = meA ? m.a : m.b;
            const oppSide = meA ? m.b : m.a;
            const won = (m.winner === 'a') === meA;
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-16 shrink-0 text-muted" title={m.playedAt}>
                  {concludedAgo(m.playedAt)}
                </span>
                <span className={won ? 'font-medium text-accent-2' : 'text-muted'}>
                  {won ? 'W' : 'L'}
                </span>
                <CharacterIcon slug={mySide.character} size={18} />
                <span className="font-mono tabular-nums">
                  {myRounds}–{oppRounds}
                </span>
                <span className="text-muted">vs</span>
                <MatchSideLabel side={oppSide} won={!won} iconSize={18} />
              </li>
            );
          })}
          {myMatches.length === 0 && (
            <li className="px-3 py-6 text-center text-muted">No matches yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface p-3">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-numeral text-3xl leading-none">{value}</div>
    </div>
  );
}
