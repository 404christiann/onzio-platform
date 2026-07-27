"use client";

import { useEffect, useState } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { DEFAULT_CAROUSEL_SPONSORS } from "@/lib/sponsor-content";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubId } from "@/components/ClubContextProvider";

export default function SponsorCarouselContainer() {
  const clubId = useClubId();
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>(DEFAULT_CAROUSEL_SPONSORS);

  useEffect(() => {
    fetchSiteSponsorLogos("carousel", clubId)
      .then(setSponsors)
      .catch((error) => {
        console.error("SponsorCarouselContainer:", error);
        setSponsors(DEFAULT_CAROUSEL_SPONSORS);
      });
  }, [clubId]);

  return <SponsorCarousel sponsors={sponsors} />;
}
