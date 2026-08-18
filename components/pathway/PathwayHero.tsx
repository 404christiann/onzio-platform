import ResilientImage from "@/components/ResilientImage";
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
 * `backgroundMedia` (optional, currently Home only) places a full-bleed
 * photograph behind the band under a club-navy scrim, and flips the band
 * to its on-photo treatment (`data-photo="true"` in pathway.css): white
 * text, the accent moved off the type onto a small underline rule and the
 * primary CTA fill. A photograph's brightness varies across the frame in
 * ways no light tint can neutralize, so the scrim is deliberately strong
 * enough that the text passes contrast over *any* pixel of *any*
 * photograph — the legibility guarantee lives in the scrim + white type,
 * not in the particular image seeded behind it. The image is decorative
 * (empty alt, aria-hidden wrapper); if it fails to load, ResilientImage
 * renders nothing and the scrim alone paints a solid navy band with the
 * same legible text.
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
  backgroundMedia?: { src: string; alt: string };
  headingLevel?: "h1" | "h2";
};

export default function PathwayHero({
  eyebrow,
  headlineTop,
  headlineBottom,
  sub,
  primaryCta,
  secondaryCta,
  variant = "left",
  backgroundMedia,
  headingLevel = "h1",
}: PathwayHeroProps) {
  const align = variant === "centered" ? "center" : "start";
  const HeadingTag = headingLevel;

  return (
    <section
      className="pathway-hero"
      data-variant={variant}
      data-photo={backgroundMedia ? "true" : undefined}
    >
      {backgroundMedia && (
        <div className="pathway-hero-photo" aria-hidden="true">
          <ResilientImage
            src={backgroundMedia.src}
            alt=""
            fill
            sizes="100vw"
            priority
          />
          <div className="pathway-hero-scrim" />
        </div>
      )}
      <div className="pathway-hero-inner">
        {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
        <HeadingTag className="pathway-hero-headline">
          <span className="pathway-hero-line">{headlineTop}</span>
          <span className="pathway-hero-line" data-emphasis="true">
            {headlineBottom}
          </span>
        </HeadingTag>
        {sub && <p className="pathway-hero-sub">{sub}</p>}
        <PathwayCtaRow primary={primaryCta} secondary={secondaryCta} align={align} />
      </div>
    </section>
  );
}
