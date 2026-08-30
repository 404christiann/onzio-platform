"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

type SponsorMark = {
  id: string;
  name: string;
  logoUrl: string | null;
};

const FALLBACK_SPONSORS: SponsorMark[] = [
  { id: "sponsor-preview-1", name: "Sponsor preview", logoUrl: "/images/sponsors/sponsor-placeholder.png" },
  { id: "sponsor-preview-2", name: "Sponsor preview", logoUrl: "/images/sponsors/sponsor-placeholder.png" },
  { id: "sponsor-preview-3", name: "Sponsor preview", logoUrl: "/images/sponsors/sponsor-placeholder.png" },
];

function sponsorToMark(sponsor: DBSiteSponsorLogo): SponsorMark {
  return {
    id: sponsor.id,
    name: sponsor.name,
    logoUrl: sponsor.logo_url.trim() || "/images/sponsors/sponsor-placeholder.png",
  };
}

export default function EditorialSponsorCarousel() {
  const club = useClubContext();
  const [sponsors, setSponsors] = useState<SponsorMark[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSiteSponsorLogos("carousel", club.id)
      .then((rows) => {
        if (!cancelled) setSponsors(rows.map(sponsorToMark));
      })
      .catch((error: unknown) => {
        console.error("EditorialSponsorCarousel:", error);
        if (!cancelled) setSponsors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  const marks = sponsors.length > 0 ? sponsors : FALLBACK_SPONSORS;
  const sponsorGroup = useMemo(
    () => Array.from({ length: 4 }, () => marks).flat(),
    [marks],
  );

  return (
    <section className="editorial-sponsor-carousel" aria-label="Club sponsors">
      <header className="editorial-sponsor-carousel-head">
        <span>Proudly supported by</span>
      </header>
      <div className="editorial-sponsor-marquee">
        <div className="editorial-sponsor-track">
          {[0, 1].map((groupIndex) => (
            <div
              key={groupIndex}
              className="editorial-sponsor-group"
              aria-hidden={groupIndex === 1 ? "true" : undefined}
            >
              {sponsorGroup.map((sponsor, index) => (
                <span
                  className="editorial-sponsor-mark"
                  key={`${groupIndex}-${sponsor.id}-${index}`}
                >
                  {sponsor.logoUrl ? (
                    <Image
                      src={sponsor.logoUrl}
                      alt={groupIndex === 0 && index < marks.length ? sponsor.name : ""}
                      fill
                      sizes="220px"
                      className="editorial-sponsor-logo"
                      {...imageDeliveryProps("sponsor-logo")}
                    />
                  ) : (
                    <span className="editorial-sponsor-wordmark">{sponsor.name}</span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
