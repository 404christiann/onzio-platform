import Image from "@/components/ResilientImage";
import PathwayMediaPlaceholder from "@/components/pathway/PathwayMediaPlaceholder";
import {
  PathwayCtaRow,
  PathwaySection,
  type PathwayCta,
} from "@/components/pathway/PathwaySection";
import { imageDeliveryProps } from "@/lib/image-delivery";

/**
 * Homepage-only editorial story treatment for pathway@1's leader section.
 * Native details/summary elements keep the interaction keyboard accessible
 * without turning the section into a client component.
 */

export type PathwayCalmStoryParagraph = {
  lead?: string;
  text: string;
};

export type PathwayCalmStoryOffer = {
  title: string;
  description: string;
};

export type PathwayCalmStoryItem = {
  label: string;
  paragraphs?: PathwayCalmStoryParagraph[];
  offers?: PathwayCalmStoryOffer[];
};

export type PathwayCalmStoryProps = {
  heading: string;
  portraitCaption: string;
  items: PathwayCalmStoryItem[];
  primaryCta?: PathwayCta;
  secondaryCta?: PathwayCta;
  media?: { src: string; alt: string };
  mediaCaption?: string;
};

export default function PathwayCalmStory({
  heading,
  portraitCaption,
  items,
  primaryCta,
  secondaryCta,
  media,
  mediaCaption,
}: PathwayCalmStoryProps) {
  return (
    <PathwaySection className="pathway-calm-story-section">
      <article className="pathway-calm-story-card">
        <div className="pathway-calm-story-media">
          {media ? (
            <figure className="pathway-calm-story-portrait">
              <Image
                className="pathway-calm-story-image"
                src={media.src}
                alt={media.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 41vw"
                {...imageDeliveryProps("photograph")}
              />
              <span className="pathway-calm-story-scrim" aria-hidden="true" />
              <figcaption className="pathway-calm-story-caption">
                <span aria-hidden="true" />
                {portraitCaption}
              </figcaption>
            </figure>
          ) : (
            <PathwayMediaPlaceholder
              className="pathway-calm-story-placeholder"
              caption={mediaCaption}
              ratio="portrait"
            />
          )}
        </div>

        <div className="pathway-calm-story-content">
          <h2 className="pathway-section-heading">{heading}</h2>

          <div className="pathway-calm-story-accordion">
            {items.map((item, index) => (
              <details
                className="pathway-calm-story-item"
                key={item.label}
                open={index === 0}
              >
                <summary className="pathway-calm-story-summary">
                  <span className="pathway-calm-story-marker" aria-hidden="true" />
                  <span className="pathway-calm-story-label">{item.label}</span>
                  <span className="pathway-calm-story-icon" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="pathway-calm-story-panel">
                  {item.paragraphs?.map((paragraph) => (
                    <p key={`${paragraph.lead ?? ""}${paragraph.text}`}>
                      {paragraph.lead && <strong>{paragraph.lead} </strong>}
                      {paragraph.text}
                    </p>
                  ))}
                  {item.offers && (
                    <ul className="pathway-calm-story-offers">
                      {item.offers.map((offer) => (
                        <li key={offer.title}>
                          <strong>{offer.title}</strong>
                          <span>{offer.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>

          <PathwayCtaRow primary={primaryCta} secondary={secondaryCta} />
        </div>
      </article>
    </PathwaySection>
  );
}
