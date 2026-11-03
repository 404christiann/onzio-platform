"use client";

import { useEffect, useState } from "react";
import LeagueStandingsTable from "@/components/LeagueStandingsTable";
import AcademyStandingsSection from "@/components/sites/diverse-city/AcademyStandingsSection";
import { fetchLeagueStandings } from "@/lib/queries";
import {
  DEFAULT_STANDINGS_SETTINGS,
  type StandingsTableContent,
} from "@/lib/standings-content";
import { useClubId } from "@/components/ClubContextProvider";

export default function LeagueStandingsContainer({ tableStyle }: { tableStyle?: "academy" } = {}) {
  const clubId = useClubId();
  const [content, setContent] = useState<StandingsTableContent>({
    settings: DEFAULT_STANDINGS_SETTINGS,
    rows: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeagueStandings(clubId)
      .then(setContent)
      .catch((error) => {
        console.error("LeagueStandingsContainer:", error);
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  if (tableStyle === "academy") {
    return <AcademyStandingsSection loading={loading} content={content} clubId={clubId} />;
  }

  return (
    <LeagueStandingsTable
      settings={content.settings}
      rows={content.rows}
    />
  );
}
