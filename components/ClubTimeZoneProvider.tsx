"use client";

import { createContext, useContext } from "react";
import { DEFAULT_CLUB_TIME_ZONE } from "@/lib/club-time";

// ADMIN-RE-03: the club's own time zone for client components (decision 0014).
// Kept out of ClubContext on purpose: tenant resolution must never read
// onzio.clubs.time_zone (the 2026-08-14 outage). Outside a provider, or when the
// read failed, it is Los Angeles, which is how every page behaved before.

const ClubTimeZoneContext = createContext<string>(DEFAULT_CLUB_TIME_ZONE);

export function ClubTimeZoneProvider({ timeZone, children }: { timeZone: string; children: React.ReactNode }) {
  return <ClubTimeZoneContext.Provider value={timeZone}>{children}</ClubTimeZoneContext.Provider>;
}

export function useClubTimeZone(): string {
  return useContext(ClubTimeZoneContext);
}
