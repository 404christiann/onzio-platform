import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import PathwayMediaPlaceholder from "@/components/pathway/PathwayMediaPlaceholder";
import { PathwaySection } from "@/components/pathway/PathwaySection";

/**
 * pathway.feature-grid — Home's three-column "what your player can expect"
 * photo grid for the pathway@1 Home sections pass.
 *
 * Each column is a photograph over a short title and one paragraph. The
 * photos arrive as public URLs resolved server-side from the club's
 * homepage_slideshow_photos rows (the section's registered content domain);
 * a column whose photo has not been supplied — or is not readable for the
 * viewer, e.g. anonymously on a preview-lifecycle tenant — falls back to the
 * template's honest media placeholder rather than a broken image.
 *
 * The component declares a portrait media ratio while the feature-grid CSS
 * owns the final 4:5 crop used by this editorial gallery.
 */

export type PathwayFeatureColumn = {
  focusLabel?: string;
  title: string;
  body: string;
  media?: { src: string; alt: string };
  /** Honest description of the not-yet-supplied photo. */
  mediaCaption?: string;
};

export type PathwayFeatureGridProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  columns: PathwayFeatureColumn[];
};

export default function PathwayFeatureGrid({
  eyebrow,
  heading,
  intro,
  columns,
}: PathwayFeatureGridProps) {
  if (columns.length === 0) return null;

  return (
    <PathwaySection className="pathway-feature-grid-section">
      {(eyebrow || heading || intro) && (
        <div className="pathway-feature-grid-head">
          <div className="pathway-feature-grid-kicker">
            {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
            <span className="pathway-feature-grid-rule" aria-hidden="true" />
          </div>
          {heading && <h2 className="pathway-section-heading">{heading}</h2>}
          {intro && <p className="pathway-section-intro">{intro}</p>}
        </div>
      )}
      <ul
        className="pathway-feature-grid"
        aria-label="Training session highlights"
        tabIndex={0}
      >
        {columns.map((column) => (
          <li className="pathway-feature-cell" key={column.title}>
            {column.media ? (
              <figure className="pathway-media" data-ratio="portrait">
                {/* Nominal intrinsic size; CSS owns the rendered box and
                    delivery is unoptimized per the media rules. */}
                <ResilientImage
                  className="pathway-media-image"
                  src={column.media.src}
                  alt={column.media.alt}
                  width={900}
                  height={1125}
                  {...imageDeliveryProps("photograph")}
                />
              </figure>
            ) : (
              <PathwayMediaPlaceholder
                caption={column.mediaCaption}
                ratio="portrait"
              />
            )}
            {column.focusLabel && (
              <span className="pathway-feature-focus">{column.focusLabel}</span>
            )}
            <h3 className="pathway-feature-title">{column.title}</h3>
            <p className="pathway-feature-body">{column.body}</p>
          </li>
        ))}
      </ul>
    </PathwaySection>
  );
}
