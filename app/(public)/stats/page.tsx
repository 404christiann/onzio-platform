"use client";

export const dynamic = "force-dynamic";

import ClubhouseStatsPage from "@/components/ClubhouseStatsPage";
import { useClubContext } from "@/components/ClubContextProvider";

export default function StatsPage() {
  const club = useClubContext();
  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseStatsPage />;
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="font-display text-sm font-bold uppercase tracking-widest">
        Team statistics are not published for this site yet.
      </p>
    </div>
  );
}
