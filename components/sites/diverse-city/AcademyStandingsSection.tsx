"use client";

import type { StandingsTableContent } from "@/lib/standings-content";
import { useBoundedAcademyLoading } from "@/lib/use-bounded-academy-loading";
import { AcademySectionLoadingSkeleton } from "./LoadingSkeleton";
import AcademyStandingsTable from "@/components/sites/diverse-city/AcademyStandingsTable";

export default function AcademyStandingsSection({
  loading,
  content,
  clubId,
}: {
  loading: boolean;
  content: StandingsTableContent;
  clubId: string;
}) {
  const showLoading = useBoundedAcademyLoading(loading, clubId);
  if (showLoading) return <AcademySectionLoadingSkeleton />;
  return <AcademyStandingsTable settings={content.settings} rows={content.rows} />;
}
