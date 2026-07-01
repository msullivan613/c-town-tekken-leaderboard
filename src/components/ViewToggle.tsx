import type { LeaderboardView } from '@/lib/leaderboard';

const OPTIONS: Array<{ value: LeaderboardView; label: string }> = [
  { value: 'players', label: 'Players' },
  { value: 'pairs', label: 'Pairs' },
];

export function ViewToggle({
  value,
  onChange,
}: {
  value: LeaderboardView;
  onChange: (v: LeaderboardView) => void;
}) {
  return (
    <div className="inline-flex border border-border bg-surface p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`eyebrow px-3.5 py-1.5 transition-colors ${
            value === opt.value
              ? 'bg-fg !text-bg'
              : 'hover:!text-fg'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
