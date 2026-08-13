import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { staffInitials } from "@/lib/editorial-roster";
import type { Staff } from "@/lib/data";

/**
 * Editorial staff card, ported (visual design) from the approved concept
 * mockup via the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's EditorialStaffCard.tsx.
 *
 * Starter tier is explicitly non-interactive: `data-interactive="false"`,
 * no click affordance, no profile modal. Initials are derived from the
 * staff member's name (the seeded `staff.initials` column is not trusted
 * here, matching the mockup's own `initials(name)` helper) rather than
 * trusting a stored field. Falls back to the club crest (never a hardcoded
 * club asset -- it arrives as a prop from EditorialIdentityContext) when the
 * staff member has no seeded photo.
 *
 * staffInitials lives in lib/editorial-roster.ts (a plain, non-JSX module),
 * not here, so contract tests can exercise it directly -- see
 * EditorialPlayerCard.tsx's doc comment for why.
 */

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
    <article className="staff-card grid overflow-hidden border border-[color:var(--ed-line)] bg-ed-panel-glass" data-interactive="false">
      <span className="staff-card-media relative min-h-[300px] overflow-hidden bg-ed-ink-ghost">
        {imageSrc && (
          <Image
            src={imageSrc}
            alt=""
            fill
            className={hasPhoto ? "is-photo object-cover object-top" : "is-crest object-contain p-16"}
            sizes="(max-width: 640px) 50vw, (max-width: 1050px) 33vw, 25vw"
            {...imageDeliveryProps(hasPhoto ? "roster-photo" : "club-logo")}
          />
        )}
      </span>
      <span className="staff-card-copy grid gap-4 p-5">
        <span className="staff-card-name font-display text-3xl font-black uppercase leading-none">{member.name}</span>
        <span className="staff-card-role flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.12em] text-ed-muted">
          <b className="inline-flex size-10 items-center justify-center rounded-full bg-ed-accent font-display text-xs font-black text-ed-on-accent">
            {staffInitials(member.name)}
          </b>
          {member.role}
        </span>
      </span>
    </article>
  );
}
