"use client";

import { createContext, useContext } from "react";
import type { ClubIdentityContent } from "@/lib/editorial-identity";

/**
 * Shares the once-fetched club_identity row and resolved crest URLs (from
 * EditorialShell) with every editorial section, so EditorialHero,
 * EditorialNextMatch, EditorialMatchdaySlideshow, EditorialStoryTeaser, and
 * EditorialFooter don't each independently re-fetch the same data.
 *
 * The default value is a safe empty state (not a thrown error) so a section
 * can still render and be unit-tested in isolation, outside EditorialShell.
 */
export type EditorialIdentityValue = {
  identity: ClubIdentityContent | null;
  crestUrl: string;
  crestOnDarkUrl: string;
};

const DEFAULT_VALUE: EditorialIdentityValue = {
  identity: null,
  crestUrl: "",
  crestOnDarkUrl: "",
};

const EditorialIdentityContext =
  createContext<EditorialIdentityValue>(DEFAULT_VALUE);

export function EditorialIdentityProvider({
  value,
  children,
}: {
  value: EditorialIdentityValue;
  children: React.ReactNode;
}) {
  return (
    <EditorialIdentityContext.Provider value={value}>
      {children}
    </EditorialIdentityContext.Provider>
  );
}

export function useEditorialIdentity(): EditorialIdentityValue {
  return useContext(EditorialIdentityContext);
}
