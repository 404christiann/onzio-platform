"use client";

export const dynamic = "force-dynamic";

import ClubhouseSponsorsPage from "@/components/ClubhouseSponsorsPage";
import { useClubContext } from "@/components/ClubContextProvider";

export default function SponsorsPage() {
  const club = useClubContext();
  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseSponsorsPage />;
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="font-display text-sm font-bold uppercase tracking-widest">
        Partners are not published for this site yet.
      </p>
    </div>
  );
}
