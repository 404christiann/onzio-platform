"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useCinematicContent } from "./CinematicContent";
import CinematicSponsors from "./CinematicSponsors";

/**
 * Sam's News pages end with the same partner strip as Home. The News routes pass the sponsors read on the server, so
 * the strip is there on first paint and nothing moves; without them (admin previews) it fetches in the browser.
 */
export default function CinematicNewsPartners({ initialSponsors }: { initialSponsors?: DBSiteSponsorLogo[] }) {
  const club = useClubContext();
  const { content } = useCinematicContent();
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>(initialSponsors ?? []);
  const served = initialSponsors !== undefined;
  useEffect(() => {
    if (served) return;
    let active = true;
    fetchSiteSponsorLogos("carousel", club.id).then(value => { if (active) setSponsors(value); }).catch(error => console.error("News sponsors:", error));
    return () => { active = false; };
  }, [club.id, served]);
  return <CinematicSponsors sponsors={sponsors} treatments={content?.presentation.sponsorTreatments ?? {}} heading="Powered by our partners" />;
}
