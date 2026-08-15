import type { CSSProperties } from "react";
import Link from "next/link";
import {
  PathwaySection,
  PathwaySectionHead,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.pathway-rail — pathway@1's signature module (MLA P1 Step 5).
 *
 * The four-stage spine (Academy -> Youth Club -> Senior Club -> UPSL) drawn
 * as numbered nodes joined by a visible connecting rail, so the progression
 * reads as one continuous route rather than four unrelated cards. Home page
 * only: the registry comments it as the signature Home-only section, and
 * repeating it on inner pages would flatten exactly the thing it exists to
 * communicate.
 *
 * The rail line is drawn in CSS (a connector segment per stage after the
 * first on desktop, a single continuous vertical line on mobile) so it
 * adapts to any stage count without the component measuring anything.
 *
 * Each stage links to its own route; hrefs are supplied by content.ts and
 * are all registered pathway@1 routes.
 */

export type PathwayRailStage = {
  label: string;
  href: string;
  caption?: string;
};

export type PathwayRailProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  stages: PathwayRailStage[];
};

export default function PathwayRail({
  eyebrow,
  heading,
  intro,
  stages,
}: PathwayRailProps) {
  if (stages.length === 0) return null;

  return (
    <PathwaySection className="pathway-rail-section">
      <PathwaySectionHead
        eyebrow={eyebrow}
        heading={heading}
        intro={intro}
        align="center"
      />
      <ol
        className="pathway-rail"
        style={{ "--pathway-rail-count": stages.length } as CSSProperties}
      >
        {stages.map((stage, index) => (
          <li className="pathway-rail-stage" key={stage.href}>
            <Link className="pathway-rail-link" href={stage.href}>
              <span className="pathway-rail-node" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="pathway-rail-label">{stage.label}</span>
              {stage.caption && (
                <span className="pathway-rail-caption">{stage.caption}</span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </PathwaySection>
  );
}
