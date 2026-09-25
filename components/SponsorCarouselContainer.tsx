"use client";

import { useEffect, useState } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";
import { AcademySectionLoadingSkeleton } from "@/components/AcademyLoadingSkeleton";
import { useBoundedAcademyLoading } from "@/lib/use-bounded-academy-loading";

export default function SponsorCarouselContainer() {
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

  if (showLoading && club.presentationTemplateKey === "academy@1") return <AcademySectionLoadingSkeleton height="min-h-48" />;
  return <SponsorCarousel sponsors={sponsors} />;
}
