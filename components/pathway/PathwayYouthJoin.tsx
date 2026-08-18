import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { PathwaySection } from "@/components/pathway/PathwaySection";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayYouthJoinItem = {
  label: string;
  href?: string;
};

export type PathwayYouthJoinProps = {
  eyebrow?: string;
  heading: string;
  headingLevel?: "h1" | "h2";
  body: string[];
  listIntro?: string;
  items: PathwayYouthJoinItem[];
  media?: { src: string; alt: string };
};

const youthMediaFallback = (
  <PathwayImageFallback label="Youth Club photograph unavailable" />
);

/**
 * A neutral pathway@1 Youth Club invitation. The route owns every word,
 * destination, and photograph; this component provides the semantic split
 * composition and a resilient direct-delivery media boundary.
 */
export default function PathwayYouthJoin({
  eyebrow,
  heading,
  headingLevel = "h2",
  body,
  listIntro,
  items,
  media,
}: PathwayYouthJoinProps) {
  const HeadingTag = headingLevel;

  return (
    <PathwaySection className="pathway-youth-join-section">
      <article className="pathway-youth-join">
        <div className="pathway-youth-join-copy">
          {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
          <HeadingTag className="pathway-youth-join-heading">
            {heading}
          </HeadingTag>
          <div className="pathway-youth-join-body">
            {body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          {listIntro && <p className="pathway-youth-join-list-intro">{listIntro}</p>}
          <ul className="pathway-youth-join-list">
            {items.map((item) => (
              <li key={item.label}>
                {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
              </li>
            ))}
          </ul>
        </div>

        <figure
          className="pathway-youth-join-media"
          data-image-state={media ? "provided" : "missing"}
        >
          {media ? (
            <ResilientImage
              className="pathway-youth-join-image"
              src={media.src}
              alt={media.alt}
              fill
              sizes="(max-width: 900px) 100vw, 56vw"
              fallback={youthMediaFallback}
              {...imageDeliveryProps("photograph")}
            />
          ) : (
            youthMediaFallback
          )}
          <span className="pathway-youth-join-accent" aria-hidden="true" />
        </figure>
      </article>
    </PathwaySection>
  );
}
