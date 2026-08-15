import {
  PathwayCtaRow,
  type PathwayCta,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.hero — the page-opening band for every pathway@1 route
 * (MLA P1 Step 5).
 *
 * Two variants, both the same content shape:
 *  - "centered": the Home treatment (larger type, centered column).
 *  - "left":     the inner-page treatment (tighter, left-aligned).
 *
 * The headline is deliberately two discrete lines rather than one string
 * with a manual break, so the second line can carry its own accent
 * treatment and neither line depends on the viewport width to break where
 * the mockup breaks it.
 *
 * Content is passed in from components/pathway/content.ts; this component
 * holds no copy of its own so Phase 2 can swap that module for DB-backed
 * content without touching the markup.
 */

export type PathwayHeroVariant = "centered" | "left";

export type PathwayHeroProps = {
  eyebrow?: string;
  headlineTop: string;
  headlineBottom: string;
  sub?: string;
  primaryCta?: PathwayCta;
  secondaryCta?: PathwayCta;
  variant?: PathwayHeroVariant;
};

export default function PathwayHero({
  eyebrow,
  headlineTop,
  headlineBottom,
  sub,
  primaryCta,
  secondaryCta,
  variant = "left",
}: PathwayHeroProps) {
  const align = variant === "centered" ? "center" : "start";

  return (
    <section className="pathway-hero" data-variant={variant}>
      <div className="pathway-hero-inner">
        {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
        <h1 className="pathway-hero-headline">
          <span className="pathway-hero-line">{headlineTop}</span>
          <span className="pathway-hero-line" data-emphasis="true">
            {headlineBottom}
          </span>
        </h1>
        {sub && <p className="pathway-hero-sub">{sub}</p>}
        <PathwayCtaRow primary={primaryCta} secondary={secondaryCta} align={align} />
      </div>
    </section>
  );
}
