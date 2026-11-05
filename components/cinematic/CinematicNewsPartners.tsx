"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { useCinematicContent } from "./CinematicContent";
import CinematicSponsors from "./CinematicSponsors";

/** Sam's News pages end with the same partner strip as Home. */
export default function CinematicNewsPartners() {
  const club = useClubContext();
  const { content } = useCinematicContent();
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>([]);
  useEffect(() => {
    let active = true;
    fetchSiteSponsorLogos("carousel", club.id).then(value => { if (active) setSponsors(value); }).catch(error => console.error("News sponsors:", error));
    return () => { active = false; };
  }, [club.id]);
  return <CinematicSponsors sponsors={sponsors} treatments={content?.presentation.sponsorTreatments ?? {}} heading="Powered by our partners" />;
}
