"use client";

import type { CSSProperties } from "react";
import PathwayNav from "@/components/pathway/PathwayNav";
import PathwayFooter from "@/components/pathway/PathwayFooter";
import PathwayTrainingGatewayProvider from "@/components/pathway/PathwayTrainingGatewayProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import "@/styles/pathway.css";

// Matches EditorialShell's own navy/red fallback (which itself matches
// Hero.tsx) so a pathway tenant with no colors configured yet still renders
// sane chrome instead of empty custom properties.
const DEFAULT_PRIMARY = "#1B2958";
const DEFAULT_SECONDARY = "#AD3234";

/**
 * Root wrapper for the pathway@1 site template, mounted by
 * app/%5Fclubs/[slug]/layout.tsx instead of Nav/Footer/TemplateFontScope,
 * following the EditorialShell precedent exactly.
 *
 * Sets data-site-template="pathway" (which scopes every rule in
 * styles/pathway.css) and injects the club's colors as the --club-primary /
 * --club-secondary custom properties the pathway token system derives from.
 * Both come straight off ClubContext (already resolved by the tenant
 * layout); unlike EditorialShell, no accent_color / identity / contact
 * fetches happen here — Phase 1 pathway chrome derives everything from the
 * two ClubContext colors, and section content is hardcoded (Step 5).
 *
 * Geist is already loaded globally via next/font in app/layout.tsx
 * (--font-geist-sans), so no font wiring is needed here.
 */
export default function PathwayShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const club = useClubContext();

  return (
    <div
      data-site-template="pathway"
      style={
        {
          "--club-primary": club.primaryColor ?? DEFAULT_PRIMARY,
          "--club-secondary": club.secondaryColor ?? DEFAULT_SECONDARY,
        } as CSSProperties
      }
    >
      <PathwayTrainingGatewayProvider>
        <PathwayNav />
        <main className="pathway-main">{children}</main>
        <PathwayFooter />
      </PathwayTrainingGatewayProvider>
    </div>
  );
}
