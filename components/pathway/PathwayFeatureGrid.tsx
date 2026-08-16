import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import PathwayMediaPlaceholder from "@/components/pathway/PathwayMediaPlaceholder";
import {
  PathwaySection,
  PathwaySectionHead,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.feature-grid — Home's three-column "what your player can expect"
 * photo grid (MLA P1, Home sections pass).
 *
 * Each column is a photograph over a short title and one paragraph. The
 * photos arrive as public URLs resolved server-side from the club's
 * homepage_slideshow_photos rows (the section's registered content domain);
 * a column whose photo has not been supplied — or is not readable for the
 * viewer, e.g. anonymously on a preview-lifecycle tenant — falls back to the
 * template's honest media placeholder rather than a broken image.
 *
 * Photos are cropped square by the CSS ratio contract: the three source
 * photographs ship in three different orientations (portrait, square,
 * landscape) and a uniform square crop is the only one that treats all
 * three acceptably while keeping the grid's rhythm.
 */

export type PathwayFeatureColumn = {
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
      <PathwaySectionHead
        eyebrow={eyebrow}
        heading={heading}
        intro={intro}
        align="center"
      />
      <ul className="pathway-feature-grid">
        {columns.map((column) => (
          <li className="pathway-feature-cell" key={column.title}>
            {column.media ? (
              <figure className="pathway-media" data-ratio="square">
                {/* Nominal intrinsic size; CSS owns the rendered box and
                    delivery is unoptimized per the media rules. */}
                <Image
                  className="pathway-media-image"
                  src={column.media.src}
                  alt={column.media.alt}
                  width={900}
                  height={900}
                  {...imageDeliveryProps("photograph")}
                />
              </figure>
            ) : (
              <PathwayMediaPlaceholder
                caption={column.mediaCaption}
                ratio="square"
              />
            )}
            <h3 className="pathway-feature-title">{column.title}</h3>
            <p className="pathway-feature-body">{column.body}</p>
          </li>
        ))}
      </ul>
    </PathwaySection>
  );
}
