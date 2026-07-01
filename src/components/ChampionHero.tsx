import { Link } from 'react-router-dom';
import type { PairViewModel } from '@/lib/leaderboard';
import { CharacterIcon, RankIcon } from './icons';
import { characterDisplayName } from '@/data/characters';
import { accentColor } from '@/lib/accent';
import { formatMmr, platformLabel } from '@/lib/format';

// Signature element: the current crew king, versus-screen style. Updates to
// whoever sits at #1 for the active view/sort.
export function ChampionHero({ champ }: { champ: PairViewModel }) {
  const color = accentColor(champ.playerId);
  // Absolute MMR scale so the charge reads as a real level, not just "#1 = full".
  const pct =
    champ.mmr == null ? 0 : Math.max(6, Math.min(100, ((champ.mmr - 1000) / 1000) * 100));
  const rankColor = champ.rank ? `rgb(var(${champ.rank.colorVar}))` : 'rgb(var(--gold))';

  return (
    <section
      className="hud-notch animate-rise relative overflow-hidden border border-border bg-surface"
      style={{
        background: `linear-gradient(120deg, ${color}22, rgb(var(--surface)) 42%)`,
      }}
    >
      {/* crown accent bar */}
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />

      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="relative shrink-0">
          <div
            className="rounded-full p-1"
            style={{ boxShadow: `0 0 0 2px ${color}, 0 0 28px ${color}66` }}
          >
            <CharacterIcon slug={champ.character} size={96} />
          </div>
          <span
            className="absolute -bottom-1 -right-1 rounded-full border-2 border-surface bg-gold px-2 font-numeral text-lg leading-6 text-bg"
            title="Reigning #1"
          >
            1
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-gold">Reigning #1</span>
            <span className="h-px flex-1" style={{ background: `${color}55` }} />
            <span className="eyebrow">{platformLabel(champ.platform)}</span>
          </div>

          <Link
            to={`/player/${champ.playerId}`}
            className="mt-1 block font-display text-4xl font-bold uppercase !text-fg hover:!text-fg sm:text-5xl"
          >
            {champ.playerTag}
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-muted">
            <CharacterIcon slug={champ.character} size={18} />
            <span className="font-display uppercase tracking-wide">
              {characterDisplayName(champ.character)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <RankIcon rank={champ.rank} size={34} />
              <span
                className="font-display text-lg font-semibold uppercase"
                style={{ color: rankColor }}
              >
                {champ.rank?.display ?? 'Unranked'}
              </span>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">MMR</span>
                <span
                  className={`font-numeral text-3xl leading-none ${champ.provisional ? 'text-muted' : 'text-fg'}`}
                >
                  {formatMmr(champ.mmr)}
                </span>
              </div>
              <div className="meter mt-1.5">
                <span className="animate-meter" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
