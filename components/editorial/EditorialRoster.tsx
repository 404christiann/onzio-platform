"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import EditorialRosterView, {
  EMPTY_ROSTER,
  type RosterData,
} from "@/components/editorial/EditorialRosterView";
import { fetchRoster, fetchStaff } from "@/lib/queries";
import type { Staff } from "@/lib/data";

/**
 * Fetches the club's roster and technical staff once here (reusing the same
 * generic tenant-scoped `fetchRoster`/`fetchStaff` the classic template's
 * `/roster` page already uses — no duplicate query was added) and passes
 * them down to the presentational `EditorialRosterView`, mirroring
 * `EditorialHome`'s fetch-once-and-pass-down composition from L4.
 */
export default function EditorialRoster() {
  const club = useClubContext();
  const { crestUrl } = useEditorialIdentity();
  const [roster, setRoster] = useState<RosterData>(EMPTY_ROSTER);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRoster(undefined, club.id), fetchStaff(club.id)])
      .then(([rosterData, staffData]) => {
        if (cancelled) return;
        setRoster(rosterData);
        setStaffList(staffData);
      })
      .catch((error) => {
        console.error("EditorialRoster:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  return (
    <EditorialRosterView roster={roster} staffList={staffList} crestUrl={crestUrl} />
  );
}
