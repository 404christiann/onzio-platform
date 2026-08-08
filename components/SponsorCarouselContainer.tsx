"use client";

import { useEffect, useState } from "react";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";

// Mockup-parity "Sponsor opportunity" slots for academy@1 (Christian
// pre-authorized reusing the sales mockup's sponsor imagery for now;
// admin-editable real sponsors replace these as they are added). Static
// public assets, not tenant media — they are template chrome, same class
// as the nav's federation badges.
const ACADEMY_PLACEHOLDER_COUNT = 3;

function academyPlaceholders(count: number): DBSiteSponsorLogo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `academy-sponsor-placeholder-${index}`,
    placement: "carousel",
    name: "Sponsor opportunity",
    logo_url: "/images/sponsors/sponsor-placeholder.png",
    sort_order: 1000 + index,
    created_at: "",
  })) as DBSiteSponsorLogo[];
}

export default function SponsorCarouselContainer() {
  const club = useClubContext();
  const clubId = club.id;
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>([]);

  useEffect(() => {
    fetchSiteSponsorLogos("carousel", clubId)
      .then(setSponsors)
      .catch((error) => {
        console.error("SponsorCarouselContainer:", error);
        setSponsors([]);
      });
  }, [clubId]);

  // The mockup's homepage band shows the real sponsor plus placeholder
  // "Sponsor opportunity" slots; pad academy@1 up to three entries until
  // enough real sponsors exist.
  const displaySponsors =
    isAcademy && sponsors.length > 0 && sponsors.length < ACADEMY_PLACEHOLDER_COUNT
      ? [
          ...sponsors,
          ...academyPlaceholders(ACADEMY_PLACEHOLDER_COUNT - sponsors.length),
        ]
      : sponsors;

  return <SponsorCarousel sponsors={displaySponsors} />;
}
