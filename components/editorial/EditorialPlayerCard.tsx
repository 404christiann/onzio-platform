import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type { Player } from "@/lib/data";

/**
 * Editorial player card, ported from the approved concept mockup
 * (soccerplatformmockups src/components/public/PlayerCard.tsx).
 *
 * Starter tier is explicitly non-interactive: `data-interactive="false"`,
 * no hover statistics, no click affordance, and no profile modal — that's
 * Pro/future scope (`/roster/[playerId]` is intentionally not built here).
 * Big jersey number, position label, small-first/big-last name typography,
 * and a full-color crest placeholder (never a hardcoded club asset — it
 * arrives as a prop from `EditorialIdentityContext`) when the player has no
 * seeded photo.
 */

/**
 * Splits "Jonah Reed" into { first: "Jonah", last: "Reed" } on the last
 * space, mirroring the mockup's separate firstName/lastName fields (the real
 * seed stores one combined `name` string). A single-word name renders
 * entirely on the bold line.
 */
export function splitPlayerName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return { first: "", last: trimmed };
  return {
    first: trimmed.slice(0, lastSpace),
    last: trimmed.slice(lastSpace + 1),
  };
}

export default function EditorialPlayerCard({
  player,
  crestUrl,
}: {
  player: Player;
  crestUrl: string;
}) {
  const hasPhoto = Boolean(player.image?.trim());
  const imageSrc = hasPhoto ? player.image : crestUrl;
  const { first, last } = splitPlayerName(player.name);

  return (
    <article className="player-card" data-interactive="false">
      <span className="player-card-number" aria-hidden>
        {player.number}
      </span>
      <span className="player-card-media">
        {imageSrc && (
          <Image
            src={imageSrc}
            alt=""
            fill
            className={hasPhoto ? "is-photo" : "is-crest"}
            sizes="(max-width: 640px) 50vw, (max-width: 1050px) 33vw, 25vw"
            {...imageDeliveryProps(hasPhoto ? "roster-photo" : "club-logo")}
          />
        )}
      </span>
      <span className="player-card-identity">
        <span className="player-card-topline">
          <strong>{String(player.number).padStart(2, "0")}</strong>
          <small>{player.position}</small>
        </span>
        <span className="player-card-name">
          {first && <small>{first}</small>}
          <strong>{last}</strong>
        </span>
      </span>
    </article>
  );
}
