"use client";

import { useEffect, useState } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";

export default function SponsorCarouselContainer() {
  const club = useClubContext();
  const clubId = club.id;
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
