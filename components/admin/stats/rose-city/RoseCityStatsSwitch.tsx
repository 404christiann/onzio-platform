"use client";

import { Suspense } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminStatsGroupsSkeleton } from "@/components/admin/AdminCompetitionSkeletons";
import { PageFrameSkeleton } from "@/components/admin/ui/editor-kit";
import { siteFor } from "@/lib/site-for";
import { CombinedStatsPage } from "../CombinedStatsPage";
import { StatsTablesSkeleton } from "./StatsTables";

/** The club's site package may supply its own Stats editor (Rose City's, on the editor kit). Every other club keeps the shared page. */
export function StatsPageForClub() {
  const club = useClubContext();
  const SiteStats = siteFor(club)?.adminEditors?.stats;
  if (SiteStats) {
    return <Suspense fallback={<div><PageFrameSkeleton cardCount={0} description /><StatsTablesSkeleton label="Loading stats" /></div>}><SiteStats /></Suspense>;
  }
  return <Suspense fallback={<AdminStatsGroupsSkeleton label="Loading stats" />}><CombinedStatsPage /></Suspense>;
}
