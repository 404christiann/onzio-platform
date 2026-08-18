import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
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
 *
 * Editorial extensions (MLA P1, Home sections pass) — all optional, so every
 * existing call site is untouched:
 *
 *  - `media`: a real photograph. When supplied it replaces
 *    PathwayMediaPlaceholder inside the same figure/ratio contract, so the
 *    grid geometry is identical whether the club has photography or not.
 *  - `subsections`: titled sub-blocks after the main body (the reference
 *    bio card is one continuous card with "Our leader" and "What we offer"
 *    inside it — two adjacent split-features would break the photo's
 *    relationship to the whole card and double the band padding, so the
 *    component grew instead).
 *  - bullets may now be `{ title, description }` pairs as well as plain
 *    strings, rendered as a titled row in the same hairline list.
 */

export type PathwayBullet = string | { title: string; description?: string };

export type PathwaySplitSubsection = {
  heading: string;
  body?: string[];
  bullets?: PathwayBullet[];
};

export type PathwaySplitMedia = {
  src: string;
  alt: string;
};

export type PathwaySplitFeatureProps = {
  eyebrow?: string;
  heading: string;
  /** One entry per paragraph. */
  body?: string[];
  bullets?: PathwayBullet[];
  subsections?: PathwaySplitSubsection[];
  primaryCta?: PathwayCta;
  secondaryCta?: PathwayCta;
  /** Real photograph for the media column; wins over mediaCaption. */
  media?: PathwaySplitMedia;
  /** Honest description of the not-yet-supplied asset; see PathwayMediaPlaceholder. */
  mediaCaption?: string;
  mediaSide?: "start" | "end";
  tone?: PathwayTone;
};

function BulletList({ bullets }: { bullets: PathwayBullet[] }) {
  if (bullets.length === 0) return null;
  return (
    <ul className="pathway-split-bullets">
      {bullets.map((bullet) =>
        typeof bullet === "string" ? (
          <li key={bullet}>{bullet}</li>
        ) : (
          <li key={bullet.title} data-detailed="true">
            <strong className="pathway-split-bullet-title">{bullet.title}</strong>
            {bullet.description && (
              <span className="pathway-split-bullet-description">
                {bullet.description}
              </span>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

export default function PathwaySplitFeature({
  eyebrow,
  heading,
  body,
  bullets,
  subsections,
  primaryCta,
  secondaryCta,
  media,
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
          {bullets && <BulletList bullets={bullets} />}
          {subsections?.map((subsection) => (
            <div className="pathway-split-subsection" key={subsection.heading}>
              <h3 className="pathway-split-subheading">{subsection.heading}</h3>
              {subsection.body?.map((paragraph) => (
                <p className="pathway-split-body" key={paragraph}>
                  {paragraph}
                </p>
              ))}
              {subsection.bullets && <BulletList bullets={subsection.bullets} />}
            </div>
          ))}
          <PathwayCtaRow primary={primaryCta} secondary={secondaryCta} />
        </div>
        <div className="pathway-split-media">
          {media ? (
            <figure className="pathway-media" data-ratio="landscape" data-tone={tone}>
              {/* Nominal intrinsic size only: the CSS ratio contract sizes the
                  rendered box, and delivery is unoptimized per the media rules
                  (normalized assets are served directly). */}
              <Image
                className="pathway-media-image"
                src={media.src}
                alt={media.alt}
                width={1200}
                height={900}
                {...imageDeliveryProps("photograph")}
              />
            </figure>
          ) : (
            <PathwayMediaPlaceholder
              caption={mediaCaption}
              ratio="landscape"
              tone={tone}
            />
          )}
        </div>
      </div>
    </PathwaySection>
  );
}
