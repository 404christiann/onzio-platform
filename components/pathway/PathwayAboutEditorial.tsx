import ResilientImage from "@/components/ResilientImage";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayAboutEditorialProps = {
  leader: {
    heading: string;
    body: string[];
    media?: {
      src: string;
      alt: string;
    };
  };
};

const leaderMediaFallback = (
  <PathwayImageFallback
    className="pathway-about-leader-fallback"
    label="Leader photograph unavailable"
  />
);

/**
 * About's dedicated editorial sequence. The generic split feature remains
 * available to the rest of pathway@1; this composition preserves a long-form
 * leader letter and a portrait photograph without forcing either into a
 * landscape card.
 */
export default function PathwayAboutEditorial({
  leader,
}: PathwayAboutEditorialProps) {
  return (
    <div className="pathway-about-editorial">
      <section
        className="pathway-about-leader"
        aria-labelledby="pathway-about-leader-heading"
      >
        <div className="pathway-about-leader-grid">
          <figure
            className="pathway-about-leader-media"
            data-image-state={leader.media ? "provided" : "missing"}
          >
            {leader.media ? (
              <ResilientImage
                src={leader.media.src}
                alt={leader.media.alt}
                fill
                sizes="(max-width: 1180px) 100vw, 50vw"
                fallback={leaderMediaFallback}
                {...imageDeliveryProps("photograph")}
              />
            ) : (
              leaderMediaFallback
            )}
          </figure>

          <div className="pathway-about-leader-letter">
            <h1 id="pathway-about-leader-heading">{leader.heading}</h1>
            <div className="pathway-about-leader-body">
              {leader.body.map((paragraph, index) => (
                <p
                  data-closing={
                    index === leader.body.length - 1 ? "true" : undefined
                  }
                  key={paragraph}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
