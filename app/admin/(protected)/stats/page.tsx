import { Suspense } from "react";
import { AdminStatsGroupsSkeleton } from "@/components/admin/AdminCompetitionSkeletons";
import { CombinedStatsPage } from "@/components/admin/stats/CombinedStatsPage";

export default function StatsPage() {
  return <Suspense fallback={<AdminStatsGroupsSkeleton label="Loading stats" />}><CombinedStatsPage /></Suspense>;
}
