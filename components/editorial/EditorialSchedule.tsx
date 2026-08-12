"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import EditorialScheduleView from "@/components/editorial/EditorialScheduleView";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import { monogram } from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

/**
 * Fetches the club's active-season fixtures once here (reusing
 * fetchActiveSeason()/fetchSchedule() -- the same tenant-scoped helpers the
 * classic /schedule page (app/(public)/schedule/page.tsx) already calls,
 * rather than duplicating a query) and passes them down to the
 * presentational EditorialScheduleView, mirroring EditorialHome/
 * EditorialRoster's fetch-once-and-pass-down composition from E3/E4.
 *
 * Starter is locked to the single active season, so unlike the classic
 * schedule page there is no season selector state here at all.
 */
export default function EditorialSchedule() {
  const club = useClubContext();
  const { identity, crestOnDarkUrl } = useEditorialIdentity();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSeason(club.id)
      .then((season) => (season ? fetchSchedule(season.id, club.id) : Promise.resolve([])))
      .then((rows) => {
        if (!cancelled) setFixtures(rows);
      })
      .catch((error: unknown) => {
        console.error("EditorialSchedule:", error);
        if (!cancelled) setFixtures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  const clubShortName = identity?.shortName || club.name;
  const clubInitials = identity?.initials || monogram(club.name);

  return (
    <EditorialScheduleView
      fixtures={fixtures}
      clubShortName={clubShortName}
      clubInitials={clubInitials}
      crestOnDarkUrl={crestOnDarkUrl}
      league={identity?.league}
    />
  );
}
