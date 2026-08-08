"use client";

import { useEffect, useState } from "react";
import LeagueStandingsTable from "@/components/LeagueStandingsTable";
import AcademyLeagueStandingsTable from "@/components/AcademyLeagueStandingsTable";
import { fetchLeagueStandings } from "@/lib/queries";
import {
  DEFAULT_STANDINGS_SETTINGS,
  type StandingsTableContent,
} from "@/lib/standings-content";
import { useClubContext, useClubId } from "@/components/ClubContextProvider";

export default function LeagueStandingsContainer() {
  const club = useClubContext();
  const clubId = useClubId();
  const [content, setContent] = useState<StandingsTableContent>({
    settings: DEFAULT_STANDINGS_SETTINGS,
    rows: [],
  });

  useEffect(() => {
    fetchLeagueStandings(clubId)
      .then(setContent)
      .catch((error) => {
        console.error("LeagueStandingsContainer:", error);
      });
  }, [clubId]);

  if (club.presentationTemplateKey === "academy@1") {
    return <AcademyLeagueStandingsTable settings={content.settings} rows={content.rows} />;
  }

  return (
    <LeagueStandingsTable
      settings={content.settings}
      rows={content.rows}
    />
  );
}
