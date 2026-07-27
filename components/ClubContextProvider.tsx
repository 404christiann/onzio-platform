"use client";

import { createContext, useContext } from "react";
import type { ClubContext } from "@/lib/club-context";

const ClubContextValue = createContext<ClubContext | null>(null);

export function ClubContextProvider({
  club,
  children,
}: {
  club: ClubContext;
  children: React.ReactNode;
}) {
  return (
    <ClubContextValue.Provider value={club}>
      {children}
    </ClubContextValue.Provider>
  );
}

export function useClubContext(): ClubContext {
  const club = useContext(ClubContextValue);
  if (!club) {
    throw new Error("ClubContextProvider is required for tenant application routes");
  }
  return club;
}

export function useOptionalClubContext(): ClubContext | null {
  return useContext(ClubContextValue);
}

export function useClubId(): string {
  return useClubContext().id;
}
