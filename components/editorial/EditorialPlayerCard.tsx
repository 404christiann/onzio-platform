import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { splitPlayerName } from "@/lib/editorial-roster";
import type { Player } from "@/lib/data";

/**
 * Editorial player card, ported (visual design) from the approved concept
 * mockup via the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's EditorialPlayerCard.tsx. Data is unchanged from that port --
 * Player already comes from the same fetchRoster() the classic template's
 * /roster page uses, so nothing here needed rewiring.
 *
 * Starter tier is explicitly non-interactive: `data-interactive="false"`,
 * no hover statistics, no click affordance, and no profile modal -- that's
 * Pro/future scope (`/roster/[playerId]` is intentionally not built here).
 * Big jersey number, position label, small-first/big-last name typography,
 * and a full-color crest placeholder (never a hardcoded club asset -- it
 * arrives as a prop from EditorialIdentityContext, threaded through by
 * EditorialRoster/EditorialRosterView) when the player has no seeded photo.
 *
 * splitPlayerName lives in lib/editorial-roster.ts (a plain, non-JSX
 * module), not here, so contract tests can exercise it directly -- this
 * repo's vitest.config.ts has no JSX-transform plugin, so a .tsx file's
 * named exports cannot be dynamically imported in tests.
 */

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
