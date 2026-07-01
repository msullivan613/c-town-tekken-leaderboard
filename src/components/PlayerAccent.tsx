import { useState } from 'react';
import { Link } from 'react-router-dom';
import { accentColor } from '@/lib/accent';
import { useData } from '@/data/DataProvider';

const BASE = import.meta.env.BASE_URL;

/** Resolve a player's avatar image: explicit `avatar` → main-character
 *  portrait → null (caller renders a colored initial). */
function avatarImageSrc(
  avatar: string | undefined,
  mainCharacter: string | undefined,
): string | null {
  if (avatar) return `${BASE}${avatar.replace(/^\//, '')}`;
  if (mainCharacter) return `${BASE}char-icons/${mainCharacter}.webp`;
  return null;
}

/** A round player token that groups a player's rows by a stable accent color
 *  (§5.3). Shows the configured avatar, else the main-character portrait, else
 *  the tag initial — always inside the accent ring so grouping survives. */
export function PlayerAccent({
  playerId,
  tag,
  size = 28,
  character,
  glow = false,
}: {
  playerId: string;
  tag?: string;
  size?: number;
  /** Character portrait to prefer when the player has no explicit avatar.
   *  Defaults to the player's main character. */
  character?: string;
  glow?: boolean;
}) {
  const { playerById } = useData();
  const [broken, setBroken] = useState(false);
  const player = playerById.get(playerId);
  const displayTag = tag ?? player?.player_tag ?? playerId;
  const color = accentColor(playerId);
  const src = avatarImageSrc(player?.avatar, character ?? player?.main_character);
  const ring = glow ? `0 0 0 2px ${color}, 0 0 28px ${color}66` : `0 0 0 2px ${color}`;

  if (src && !broken) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={{ width: size, height: size, boxShadow: ring }}
        aria-hidden
      >
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(true)}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display text-bg"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      {displayTag.charAt(0).toUpperCase()}
    </span>
  );
}

export function PlayerLink({ playerId, tag }: { playerId: string; tag: string }) {
  return (
    <Link
      to={`/player/${playerId}`}
      className="inline-flex items-center gap-2 !text-fg hover:!text-accent"
      style={{ borderLeft: `3px solid ${accentColor(playerId)}`, paddingLeft: 8 }}
    >
      <PlayerAccent playerId={playerId} tag={tag} size={24} />
      <span className="font-medium">{tag}</span>
    </Link>
  );
}
