"use client";

import { useEffect, useState, type ReactNode } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";
import { useBoundedAcademyLoading } from "@/lib/use-bounded-academy-loading";

export default function SponsorCarouselContainer({ loadingFallback }: { loadingFallback?: ReactNode } = {}) {
  const club = useClubContext();
  const clubId = club.id;
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useBoundedAcademyLoading(loading, clubId);

  useEffect(() => {
    fetchSiteSponsorLogos("carousel", clubId)
      .then(setSponsors)
      .catch((error) => {
        console.error("SponsorCarouselContainer:", error);
        setSponsors([]);
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  if (showLoading && loadingFallback !== undefined) return loadingFallback;
  return <SponsorCarousel sponsors={sponsors} />;
}
