"use client";

import { createContext, useContext } from "react";
import type { ClubIdentityContent } from "@/lib/club-identity";

/**
 * Shares the club identity content and full-color crest URL that
 * `app/%5Fclubs/[slug]/layout.tsx` already fetches server-side (once, for the
 * header/footer) with the editorial home page sections, so they render this
 * data immediately instead of re-fetching it client-side and flashing empty.
 *
 * The default value is a safe empty state (not a thrown error) so a section
 * can still be rendered and unit-tested in isolation, outside `EditorialShell`.
 */
export type EditorialIdentityValue = {
  identity: ClubIdentityContent | null;
  crestUrl: string;
};

const DEFAULT_VALUE: EditorialIdentityValue = {
  identity: null,
  crestUrl: "",
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
