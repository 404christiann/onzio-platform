import ImageFallback from "@/components/ImageFallback";
import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";

export default function PathwayHomeHeroMedia({
  media,
}: {
  media?: { src: string; alt: string };
}) {
  return (
    <div
      className="pathway-home-hero-media"
      data-pathway-home-hero-photo="true"
    >
      {media ? (
        <ResilientImage
          className="pathway-home-hero-image"
          src={media.src}
          alt={media.alt}
          fill
          sizes="(max-width: 900px) 100vw, 64vw"
          priority
          fallback={
            <ImageFallback
              label="Club photograph unavailable"
              variant="photo"
              fill
            />
          }
          {...imageDeliveryProps("hero-photo")}
        />
      ) : (
        <ImageFallback
          label="Club photograph unavailable"
          variant="photo"
          fill
        />
      )}
      <span className="pathway-home-hero-accent" aria-hidden="true" />
    </div>
  );
}
