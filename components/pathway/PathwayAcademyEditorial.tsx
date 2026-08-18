import ResilientImage from "@/components/ResilientImage";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { PathwaySection } from "@/components/pathway/PathwaySection";
import { imageDeliveryProps } from "@/lib/image-delivery";

/**
 * Academy-page editorial introduction for pathway@1.
 *
 * Copy and photography stay tenant-owned inputs. The component contributes
 * only semantic split-layout hooks; pathway.css owns the final presentation.
 * A missing source and a source that fails in the browser share the same
 * labelled, fill-sized fallback so the media column never collapses or shows
 * broken-image chrome.
 */

export type PathwayAcademyEditorialMedia = {
  src: string;
  alt: string;
};

export type PathwayAcademyEditorialProps = {
  eyebrow?: string;
  heading: string;
  headingLevel?: "h1" | "h2";
  /** One entry per paragraph. */
  body: string[];
  media?: PathwayAcademyEditorialMedia;
};

const academyMediaFallback = (
  <PathwayImageFallback label="Academy photograph unavailable" />
);

export default function PathwayAcademyEditorial({
  eyebrow,
  heading,
  headingLevel = "h2",
  body,
  media,
}: PathwayAcademyEditorialProps) {
  const HeadingTag = headingLevel;

  return (
    <PathwaySection className="pathway-academy-editorial-section">
      <article className="pathway-academy-editorial">
        <div className="pathway-academy-editorial-copy">
          <header className="pathway-academy-editorial-head">
            {eyebrow && (
              <div className="pathway-academy-editorial-kicker">
                <span className="pathway-eyebrow">{eyebrow}</span>
                <span
                  className="pathway-academy-editorial-rule"
                  aria-hidden="true"
                />
              </div>
            )}
            <HeadingTag className="pathway-section-heading">
              {heading}
            </HeadingTag>
          </header>

          <div className="pathway-academy-editorial-body">
            {body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <figure
          className="pathway-academy-editorial-media"
          data-image-state={media ? "provided" : "missing"}
        >
          {media ? (
            <ResilientImage
              className="pathway-academy-editorial-image"
              src={media.src}
              alt={media.alt}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 52vw"
              fallback={academyMediaFallback}
              {...imageDeliveryProps("photograph")}
            />
          ) : (
            academyMediaFallback
          )}
          <span
            className="pathway-academy-editorial-accent"
            aria-hidden="true"
          />
        </figure>
      </article>
    </PathwaySection>
  );
}
