"use client";

import { useEffect, useState } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubId } from "@/components/ClubContextProvider";

export default function SponsorCarouselContainer() {
  const clubId = useClubId();
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>([]);

  useEffect(() => {
    fetchSiteSponsorLogos("carousel", clubId)
      .then(setSponsors)
      .catch((error) => {
        console.error("SponsorCarouselContainer:", error);
        setSponsors([]);
      });
  }, [clubId]);

  return <SponsorCarousel sponsors={sponsors} />;
}
