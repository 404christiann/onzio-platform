import PathwayHomeHeroMedia from "@/components/pathway/PathwayHomeHeroMedia";
import {
  PathwayCtaRow,
  type PathwayCta,
} from "@/components/pathway/PathwaySection";

/**
 * Home-only renderer for the registered pathway.hero section.
 *
 * The public route remains a Server Component: it resolves the tenant and
 * media slot before passing serializable copy/media props here. The approved
 * Whole-club photograph composition is static, so the hero owns no client
 * state; only the shared ResilientImage boundary manages delivery fallback.
 */
export type PathwayHomeHeroProps = {
  eyebrow?: string;
  headlineTop: string;
  headlineBottom: string;
  sub?: string;
  primaryCta?: PathwayCta;
  secondaryCta?: PathwayCta;
  media?: { src: string; alt: string };
};

export default function PathwayHomeHero({
  eyebrow,
  headlineTop,
  headlineBottom,
  sub,
  primaryCta,
  secondaryCta,
  media,
}: PathwayHomeHeroProps) {
  return (
    <section
      className="pathway-home-hero"
      data-pathway-home-hero="true"
    >
      <div className="pathway-home-hero-frame">
        <div className="pathway-home-hero-content">
          <div>
            {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
            <h1 className="pathway-home-hero-headline">
              <span>{headlineTop}</span>
              <span>{headlineBottom}</span>
            </h1>
            {sub && <p className="pathway-home-hero-sub">{sub}</p>}
            <PathwayCtaRow
              primary={primaryCta}
              secondary={secondaryCta}
            />
          </div>
        </div>

        <PathwayHomeHeroMedia media={media} />
      </div>
    </section>
  );
}
