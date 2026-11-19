"use client";

import { Suspense } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminStatsGroupsSkeleton } from "@/components/admin/AdminCompetitionSkeletons";
import { PageFrameSkeleton } from "@/components/admin/ui/editor-kit";
import { CombinedStatsPage } from "../CombinedStatsPage";
import { RoseCityStatsPage } from "./RoseCityStatsPage";
import { StatsTablesSkeleton } from "./StatsTables";

/** Rose City is chosen by its slug, not by its template key (tests/architecture/template-selectors). Every other club keeps the shared page. */
const ROSE_CITY_SLUG = "rose-city";

export function StatsPageForClub() {
  const club = useClubContext();
  const classic = useAdminPortal().portal !== "reimagined";
  if (club.slug === ROSE_CITY_SLUG && classic) {
    return <Suspense fallback={<div><PageFrameSkeleton cardCount={0} description /><StatsTablesSkeleton label="Loading stats" /></div>}><RoseCityStatsPage /></Suspense>;
  }
  return <Suspense fallback={<AdminStatsGroupsSkeleton label="Loading stats" />}><CombinedStatsPage /></Suspense>;
}
