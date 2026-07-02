import { Link } from 'react-router-dom';
import type { MatchSide } from '@/types/data-files';
import { useData } from '@/data/DataProvider';
import { CharacterIcon } from './icons';

// Renders one side of a match: the character portrait + the fighter's name. Crew
// members link to their profile and use their roster tag; external opponents show
// their tknow name, unlinked.
//
// Two orthogonal signals keep the row readable (issue #11):
//   • font weight + brightness say WHO WON — the winner is bold and fully lit, the
//     loser is dimmed and normal-weight.
//   • an accent underline (present only on the linked crew name) says WHO IS
//     TRACKED — it stays put whether that player won or lost.
// Because the two cues live on different visual channels, a crew member winning no
// longer stacks two "bold" treatments into one indistinct blob.
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
    won ? 'font-bold text-fg' : 'font-normal text-fg/50'
  }`;

  const name = crew ? (
    <Link
      to={`/player/${side.playerId}`}
      className={`${nameClass} underline decoration-accent-2/70 decoration-2 underline-offset-4 !text-inherit hover:!text-accent-2`}
    >
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
