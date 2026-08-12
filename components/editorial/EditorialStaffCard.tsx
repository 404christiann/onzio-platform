import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type { Staff } from "@/lib/data";

/**
 * Editorial staff card, ported from the approved concept mockup
 * (soccerplatformmockups src/components/public/StaffCard.tsx).
 *
 * Starter tier is explicitly non-interactive: `data-interactive="false"`,
 * no click affordance, no profile modal. Initials are derived from the
 * staff member's name (the seeded `staff.initials` column defaults to an
 * empty string and is never populated by the Lions seed), matching the
 * mockup's own `initials(name)` helper rather than trusting a stored field.
 * Falls back to the club crest (never a hardcoded club asset — it arrives
 * as a prop from `EditorialIdentityContext`) when the staff member has no
 * seeded photo.
 */

/** "Marcus Hale" -> "MH", mirroring the mockup's staff initials helper. */
export function staffInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3);
}

export default function EditorialStaffCard({
  member,
  crestUrl,
}: {
  member: Staff;
  crestUrl: string;
}) {
  const hasPhoto = Boolean(member.image?.trim());
  const imageSrc = hasPhoto ? member.image : crestUrl;

  return (
    <article className="staff-card" data-interactive="false">
      <span className="staff-card-media">
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
      <span className="staff-card-copy">
        <span className="staff-card-name">{member.name}</span>
        <span className="staff-card-role">
          <b>{staffInitials(member.name)}</b>
          {member.role}
        </span>
      </span>
    </article>
  );
}
