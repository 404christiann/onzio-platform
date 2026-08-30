"use client";

import Image from "@/components/ResilientImage";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { imageDeliveryProps } from "@/lib/image-delivery";

type SponsorCarouselProps = {
  sponsors: DBSiteSponsorLogo[];
  compact?: boolean;
};

export default function SponsorCarousel({ sponsors, compact = false }: SponsorCarouselProps) {
  if (sponsors.length === 0) return null;

  // Mockup-parity marquee structure: each animated group repeats the sponsor
  // list enough times to fill the track, and the track renders two identical
  // groups so the translateX(-50%) loop is seamless. The previous
  // single-pass structure clipped a lone logo half off the left edge on
  // mobile because the animation still translated a track that only
  // contained one logo.
  const sponsorGroup = Array.from({ length: 4 }, () => sponsors).flat();

  return (
    <section
      className={`sponsor-carousel-section ${compact ? "sponsor-carousel-section--compact" : ""}`}
      style={{ backgroundColor: "var(--sponsor-band-bg, #0D0D0D)" }}
    >
      <header className="sponsor-carousel-head">
        <span className="sponsor-carousel-eyebrow">Proudly supported by</span>
      </header>
      <div className="sponsor-carousel-marquee">
        <div className="sponsor-carousel-track">
          {[0, 1].map((groupIndex) => (
            <div
              key={groupIndex}
              className="sponsor-carousel-group"
              aria-hidden={groupIndex === 1 ? "true" : undefined}
            >
              {sponsorGroup.map((sponsor, index) => (
                <span
                  className="sponsor-carousel-logo relative w-[260px]"
                  key={`${groupIndex}-${sponsor.id}-${index}`}
                >
                  <Image
                    src={sponsor.logo_url}
                    alt={groupIndex === 0 && index < sponsors.length ? sponsor.name : ""}
                    fill
                    sizes="260px"
                    loading="eager"
                    className="object-contain"
                    {...imageDeliveryProps("sponsor-logo")}
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
