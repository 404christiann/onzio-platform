"use client";

export const dynamic = "force-dynamic";

import ClubhouseSponsorsPage from "@/components/ClubhouseSponsorsPage";
import AcademySponsorsPage from "@/components/sites/diverse-city/AcademySponsorsPage";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEffect, useState } from "react";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

export default function SponsorsPage() {
  const club = useClubContext();
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[] | null>(null);

  useEffect(() => {
    if (club.presentationTemplateKey !== "academy@1") return;
    let cancelled = false;
    setSponsors(null);
    fetchSiteSponsorLogos("carousel", club.id)
      .then((logos) => {
        if (!cancelled) setSponsors(logos);
      })
      .catch((error: unknown) => {
        console.error("SponsorsPage: fetchSiteSponsorLogos:", error);
        if (!cancelled) setSponsors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id, club.presentationTemplateKey]);

  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseSponsorsPage />;
  if (club.presentationTemplateKey === "academy@1") {
    return sponsors ? <AcademySponsorsPage sponsors={sponsors} clubName={club.name} /> : null;
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="font-display text-sm font-bold uppercase tracking-widest">
        Partners are not published for this site yet.
      </p>
    </div>
  );
}
