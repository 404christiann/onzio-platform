import PathwayMediaPlaceholder from "@/components/pathway/PathwayMediaPlaceholder";
import {
  PathwayCtaRow,
  PathwaySection,
  type PathwayCta,
  type PathwayTone,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.split-feature — text column beside a media column
 * (MLA P1 Step 5). Used on Academy, Book Training, Youth Club and About.
 *
 * Desktop grid is `minmax(0, 1fr) minmax(460px, 480px)`: the copy column
 * takes the remaining space and the media column holds the mockup's fixed
 * band, with both columns bottom-aligned so the copy's last line sits on the
 * same baseline as the foot of the image. Below the breakpoint the columns
 * stack (copy first) and the media column drops its minimum width.
 *
 * `tone` is the single switch that produces pathway.inverted-feature — see
 * PathwayInvertedFeature.tsx, which is this component with tone="dark". The
 * layout is implemented once on purpose; a second copy would drift.
 *
 * `mediaSide` flips which column the media sits in so consecutive features
 * on one page can alternate without a second component.
 */

export type PathwaySplitFeatureProps = {
  eyebrow?: string;
  heading: string;
  /** One entry per paragraph. */
  body?: string[];
  bullets?: string[];
  primaryCta?: PathwayCta;
  secondaryCta?: PathwayCta;
  /** Honest description of the not-yet-supplied asset; see PathwayMediaPlaceholder. */
  mediaCaption?: string;
  mediaSide?: "start" | "end";
  tone?: PathwayTone;
};

export default function PathwaySplitFeature({
  eyebrow,
  heading,
  body,
  bullets,
  primaryCta,
  secondaryCta,
  mediaCaption,
  mediaSide = "end",
  tone = "light",
}: PathwaySplitFeatureProps) {
  return (
    <PathwaySection tone={tone} className="pathway-split-section">
      <div className="pathway-split" data-media-side={mediaSide}>
        <div className="pathway-split-copy">
          {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
          <h2 className="pathway-section-heading">{heading}</h2>
          {body?.map((paragraph) => (
            <p className="pathway-split-body" key={paragraph}>
              {paragraph}
            </p>
          ))}
          {bullets && bullets.length > 0 && (
            <ul className="pathway-split-bullets">
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          <PathwayCtaRow primary={primaryCta} secondary={secondaryCta} />
        </div>
        <div className="pathway-split-media">
          <PathwayMediaPlaceholder
            caption={mediaCaption}
            ratio="landscape"
            tone={tone}
          />
        </div>
      </div>
    </PathwaySection>
  );
}
