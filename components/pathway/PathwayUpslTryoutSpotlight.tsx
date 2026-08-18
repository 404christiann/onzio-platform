import ResilientImage from "@/components/ResilientImage";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { PathwaySection } from "@/components/pathway/PathwaySection";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayUpslSpotlightCta = {
  label: string;
  href: string;
};

export type PathwayUpslSpotlightImage = {
  src: string;
  alt: string;
};

export type PathwayUpslTryoutSpotlightProps = {
  statusLabel?: string;
  heading: string;
  subheading: string;
  /** One entry per paragraph. */
  body: string[];
  date: string;
  time: string;
  location: string;
  cta: PathwayUpslSpotlightCta;
  image?: PathwayUpslSpotlightImage;
  /** Honest description shown when no photography is available. */
  imageFallbackCaption?: string;
};

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

/**
 * Photo-led tryout announcement for pathway@1's UPSL page.
 *
 * The component owns accessible content structure only. Visual treatment is
 * provided by pathway.css through the neutral class hooks below, so it can use
 * the active tenant tokens without embedding a club-specific palette or name.
 */
export default function PathwayUpslTryoutSpotlight({
  statusLabel,
  heading,
  subheading,
  body,
  date,
  time,
  location,
  cta,
  image,
  imageFallbackCaption,
}: PathwayUpslTryoutSpotlightProps) {
  const externalCta = isExternalHref(cta.href);
  const mediaFallback = (
    <PathwayImageFallback
      label={imageFallbackCaption ?? "UPSL tryout photograph unavailable"}
    />
  );

  return (
    <PathwaySection className="pathway-upsl-spotlight-section">
      <div className="pathway-upsl-spotlight" data-has-photo={image ? "true" : "false"}>
        <div className="pathway-upsl-spotlight-visual">
          {image ? (
            <figure className="pathway-upsl-spotlight-media">
              <ResilientImage
                className="pathway-upsl-spotlight-image"
                src={image.src}
                alt={image.alt}
                fill
                sizes="100vw"
                fallback={mediaFallback}
                {...imageDeliveryProps("hero-photo")}
              />
            </figure>
          ) : (
            <figure className="pathway-upsl-spotlight-media">
              {mediaFallback}
            </figure>
          )}
          <div className="pathway-upsl-spotlight-scrim" aria-hidden="true" />
        </div>

        <div className="pathway-upsl-spotlight-content">
          {statusLabel && (
            <p className="pathway-upsl-spotlight-status">{statusLabel}</p>
          )}
          <h1 className="pathway-upsl-spotlight-heading">{heading}</h1>
          <p className="pathway-upsl-spotlight-subheading">{subheading}</p>
          <div className="pathway-upsl-spotlight-body">
            {body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <dl className="pathway-upsl-spotlight-details">
            <div className="pathway-upsl-spotlight-detail">
              <dt>Date</dt>
              <dd>{date}</dd>
            </div>
            <div className="pathway-upsl-spotlight-detail">
              <dt>Time</dt>
              <dd>{time}</dd>
            </div>
            <div className="pathway-upsl-spotlight-detail">
              <dt>Location</dt>
              <dd>{location}</dd>
            </div>
          </dl>

          <a
            className="pathway-button pathway-upsl-spotlight-cta"
            data-variant="primary"
            href={cta.href}
            {...(externalCta
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {cta.label}
          </a>
        </div>
      </div>
    </PathwaySection>
  );
}
