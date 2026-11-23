"use client";

import { createContext, useContext } from "react";
import type { PublicPageVisibility } from "@/lib/public-page-visibility";

// The club's "Visible to visitors" map for client components. Kept out of ClubContext on
// purpose: tenant resolution must never read onzio.clubs.public_page_visibility (the
// 2026-08-14 outage). Outside a provider (editor previews, other surfaces) or when the read
// failed, it is {} and every page shows.

const PublicPageVisibilityContext = createContext<PublicPageVisibility>({});

export function PublicPageVisibilityProvider({
  visibility,
  children,
}: {
  visibility: PublicPageVisibility;
  children: React.ReactNode;
}) {
  return <PublicPageVisibilityContext.Provider value={visibility}>{children}</PublicPageVisibilityContext.Provider>;
}

export function usePublicPageVisibility(): PublicPageVisibility {
  return useContext(PublicPageVisibilityContext);
}
