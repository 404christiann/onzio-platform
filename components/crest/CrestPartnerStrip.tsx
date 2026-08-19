"use client";

import { useEffect, useState } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

/**
 * crest.partner-strip -- the sponsor logo row (contentDomain
 * "site_sponsor_logos", requiredModule "sponsors", emptyBehavior "hide").
 *
 * Wraps the platform's existing sponsor-rendering component
 * (components/SponsorCarousel.tsx -- the same presentational component
 * components/SponsorCarouselContainer.tsx uses for the classic templates)
 * instead of re-implementing sponsor logo rendering. SponsorCarousel already
 * renders nothing when there are no sponsors; the wrapping
 * `.crest-partner-strip` class in styles/globals.css only re-points the
 * marquee's `--sponsor-band-*` custom properties so it reads white-dominant
 * with a deep-gold eyebrow instead of the shared component's black-ribbon
 * default, matching the rest of crest@1's palette.
 */
export default function CrestPartnerStrip() {
  const club = useClubContext();
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSiteSponsorLogos("carousel", club.id)
      .then((rows) => {
        if (!cancelled) setSponsors(rows);
      })
      .catch((error: unknown) => {
        console.error("CrestPartnerStrip: fetchSiteSponsorLogos:", error);
        if (!cancelled) setSponsors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  if (sponsors.length === 0) return null;

  return (
    <div className="crest-partner-strip">
      <SponsorCarousel sponsors={sponsors} compact />
    </div>
  );
}
