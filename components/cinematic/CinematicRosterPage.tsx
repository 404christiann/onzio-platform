"use client";

import { useEffect, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchRoster } from "@/lib/queries";
import CinematicRoster, { type CinematicRosterData } from "./CinematicRoster";

/** Server-fetched result for the first paint; without it the page fetches in the browser as before. */
export type CinematicRosterInitial = { roster: CinematicRosterData | null; failed: boolean };

export default function CinematicRosterPage({ initial }: { initial?: CinematicRosterInitial }) {
  const { id: clubId } = useClubContext();
  const seeded = useRef(initial ? clubId : null);
  const [state, setState] = useState<{
    clubId: string;
    roster: CinematicRosterData | null;
    failed: boolean;
  }>({ clubId, roster: initial?.roster ?? null, failed: initial?.failed ?? false });

  useEffect(() => {
    if (seeded.current === clubId) return;
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
