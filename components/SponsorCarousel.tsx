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

  const marqueeSponsors = sponsors.length === 1 ? sponsors : [...sponsors, ...sponsors];

  return (
    <section
      className={`sponsor-carousel-section ${compact ? "sponsor-carousel-section--compact" : ""}`}
      style={{ backgroundColor: "#0D0D0D" }}
    >
      <header className="sponsor-carousel-head">
        <span className="sponsor-carousel-eyebrow">Proudly supported by</span>
      </header>
      <div className="sponsor-carousel-marquee">
        <div className="sponsor-carousel-track">
          {marqueeSponsors.map((sponsor, index) => (
            <span className="sponsor-carousel-logo" key={`${sponsor.id}-${index}`}>
              <Image
                src={sponsor.logo_url}
                alt={sponsor.name}
                width={260}
                height={80}
                className="h-full w-auto object-contain"
                {...imageDeliveryProps("sponsor-logo")}
              />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
