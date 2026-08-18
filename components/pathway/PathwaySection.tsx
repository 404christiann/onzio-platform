import type { ReactNode } from "react";
import Link from "next/link";
import PathwayTrainingTrigger from "@/components/pathway/PathwayTrainingTrigger";

/**
 * Internal layout primitives shared by the pathway@1 section components
 * (MLA P1 Step 5). Not a registered section type of its own: it exists so the
 * pathway.* sections share one band shell, one eyebrow/heading/intro block,
 * and one CTA row rather than re-deriving spacing and type treatment in every
 * file. All visual values live in styles/pathway.css under the
 * [data-site-template="pathway"] scope, matching the Step 4 chrome.
 */

export type PathwayCta = {
  label: string;
  href: string;
  action?: "training-gateway";
};

/**
 * Light bands sit on --paper; dark bands sit on --primary-deep and flip to
 * the --on-dark token set. Only pathway.inverted-feature ships dark in
 * Phase 1, but the token is shared so any band can invert without a second
 * layout implementation.
 */
export type PathwayTone = "light" | "dark";

export type PathwayAlign = "start" | "center";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PathwaySection({
  tone = "light",
  className,
  children,
}: {
  tone?: PathwayTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={classes("pathway-section", className)} data-tone={tone}>
      <div className="pathway-section-inner">{children}</div>
    </section>
  );
}

export function PathwaySectionHead({
  eyebrow,
  heading,
  intro,
  align = "start",
}: {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  align?: PathwayAlign;
}) {
  if (!eyebrow && !heading && !intro) return null;
  return (
    <div className="pathway-section-head" data-align={align}>
      {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
      {heading && <h2 className="pathway-section-heading">{heading}</h2>}
      {intro && <p className="pathway-section-intro">{intro}</p>}
    </div>
  );
}

/**
 * Primary is the filled accent action, secondary the outlined one — the same
 * pair the nav CTA establishes. Both render as links. Training CTAs carry an
 * explicit action tag so JavaScript can open the hosted-selection gateway;
 * their normal href remains the shareable, progressive fallback page.
 */
export function PathwayCtaRow({
  primary,
  secondary,
  align = "start",
}: {
  primary?: PathwayCta;
  secondary?: PathwayCta;
  align?: PathwayAlign;
}) {
  if (!primary && !secondary) return null;
  return (
    <div className="pathway-cta-row" data-align={align}>
      {primary && (
        primary.action === "training-gateway" ? (
          <PathwayTrainingTrigger
            className="pathway-button"
            data-variant="primary"
            href={primary.href}
          >
            {primary.label}
          </PathwayTrainingTrigger>
        ) : (
          <Link className="pathway-button" data-variant="primary" href={primary.href}>
            {primary.label}
          </Link>
        )
      )}
      {secondary && (
        secondary.action === "training-gateway" ? (
          <PathwayTrainingTrigger
            className="pathway-button"
            data-variant="secondary"
            href={secondary.href}
          >
            {secondary.label}
          </PathwayTrainingTrigger>
        ) : (
          <Link className="pathway-button" data-variant="secondary" href={secondary.href}>
            {secondary.label}
          </Link>
        )
      )}
    </div>
  );
}
