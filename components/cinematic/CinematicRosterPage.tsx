"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchRoster } from "@/lib/queries";
import CinematicRoster, { type CinematicRosterData } from "./CinematicRoster";

export default function CinematicRosterPage() {
  const { id: clubId } = useClubContext();
  const [state, setState] = useState<{
    clubId: string;
    roster: CinematicRosterData | null;
    failed: boolean;
  }>({ clubId, roster: null, failed: false });

  useEffect(() => {
    let current = true;
    setState({ clubId, roster: null, failed: false });
    void fetchRoster(undefined, clubId).then(
      (roster) => {
        if (current) setState({ clubId, roster, failed: false });
      },
      () => {
        if (current) setState({ clubId, roster: null, failed: true });
      },
    );
    return () => { current = false; };
  }, [clubId]);

  const active = state.clubId === clubId ? state : null;
  if (!active?.roster) {
    return <p className="cinematic-roster-status" role="status">
      {active?.failed ? "The squad is temporarily unavailable. Please try again." : "Loading the squad…"}
    </p>;
  }
  return <CinematicRoster key={clubId} roster={active.roster} />;
}
