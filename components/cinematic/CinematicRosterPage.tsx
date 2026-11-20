"use client";

import { useEffect, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchRoster, fetchStaff } from "@/lib/queries";
import type { Staff } from "@/lib/data";
import CinematicRoster, { type CinematicRosterData } from "./CinematicRoster";

/** Server-fetched result for the first paint; without it the page fetches in the browser as before. */
export type CinematicRosterInitial = { roster: CinematicRosterData | null; staff?: Staff[]; failed: boolean };

/** The browser read when the server sent no first paint: the squad and the staff group together. */
export async function fetchCinematicRoster(clubId: string): Promise<{ roster: CinematicRosterData; staff: Staff[] }> {
  const [roster, staff] = await Promise.all([fetchRoster(undefined, clubId), fetchStaff(clubId)]);
  return { roster, staff };
}

export type CinematicRosterState = { clubId: string; roster: CinematicRosterData | null; staff: Staff[]; failed: boolean };

/** The browser load: a loading state, then the squad and staff (or the failure). Returns a cancel for a club change. */
export function loadCinematicRoster(clubId: string, apply: (state: CinematicRosterState) => void): () => void {
  let current = true;
  apply({ clubId, roster: null, staff: [], failed: false });
  void fetchCinematicRoster(clubId).then(
    ({ roster, staff }) => { if (current) apply({ clubId, roster, staff, failed: false }); },
    () => { if (current) apply({ clubId, roster: null, staff: [], failed: true }); },
  );
  return () => { current = false; };
}

export default function CinematicRosterPage({ initial }: { initial?: CinematicRosterInitial }) {
  const { id: clubId } = useClubContext();
  const seeded = useRef(initial ? clubId : null);
  const [state, setState] = useState<CinematicRosterState>({ clubId, roster: initial?.roster ?? null, staff: initial?.staff ?? [], failed: initial?.failed ?? false });

  useEffect(() => {
    if (seeded.current === clubId) return;
    return loadCinematicRoster(clubId, setState);
  }, [clubId]);

  const active = state.clubId === clubId ? state : null;
  if (!active?.roster) {
    return <p className="cinematic-roster-status" role="status">
      {active?.failed ? "The squad is temporarily unavailable. Please try again." : "Loading the squad…"}
    </p>;
  }
  return <CinematicRoster key={clubId} roster={active.roster} staff={active.staff} />;
}
