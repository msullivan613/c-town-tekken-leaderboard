import { Link } from 'react-router-dom';
import type { MatchSide } from '@/types/data-files';
import { useData } from '@/data/DataProvider';
import { CharacterIcon } from './icons';

// Renders one side of a match: the character portrait + the fighter's name. Crew
// members link to their profile and use their roster tag; external opponents show
// their tknow name, unlinked and muted.
export function MatchSideLabel({
  side,
  align = 'left',
  won,
  iconSize = 22,
}: {
  side: MatchSide;
  align?: 'left' | 'right';
  won?: boolean;
  iconSize?: number;
}) {
  const { playerById } = useData();
  const player = side.playerId ? playerById.get(side.playerId) : undefined;
  const tag = player?.player_tag ?? side.name;
  const crew = Boolean(side.playerId);
  const nameClass = `truncate font-display uppercase tracking-wide ${
    won ? 'text-fg' : crew ? 'text-fg/80' : 'text-muted'
  }`;

  const name = crew ? (
    <Link to={`/player/${side.playerId}`} className={`${nameClass} !text-inherit hover:!text-accent-2`}>
      {tag}
    </Link>
  ) : (
    <span className={nameClass}>{tag}</span>
  );
  const icon = <CharacterIcon slug={side.character} size={iconSize} />;

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {icon}
      {name}
    </span>
  );
}
