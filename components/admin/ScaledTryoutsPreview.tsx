"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AcademyTryoutsPage from "@/components/AcademyTryoutsPage";
import EditorialTryouts from "@/components/editorial/EditorialTryouts";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import { useClubContext } from "@/components/ClubContextProvider";
import {
  fetchClubThemeColors,
  type ClubThemeColors,
} from "@/lib/editorial-identity";
import type { TryoutContent } from "@/lib/queries";
import type { TryoutsPageContent } from "@/lib/tryouts-page-content";
import "@/styles/editorial.css";

/**
 * Live-style preview for /admin/tryouts. The scaling itself lives in
 * ScaledPagePreview, which is also what fixed this preview not fitting its
 * panel — see the comment there.
 *
 * The real public /tryouts route (app/%5Fclubs/[slug]/tryouts/page.tsx)
 * branches on club.presentationTemplateKey: editorial@1 tenants (Lions FC)
 * get EditorialTryouts, academy@1 tenants (Diverse City FC) get
 * AcademyTryoutsPage. This preview mirrors that branch instead of always
 * rendering AcademyTryoutsPage, which previously showed every editorial
 * tenant DCFC's navy/red academy layout instead of their own club-colored
 * editorial page.
 *
 * EditorialTryouts only renders correctly inside the
 * [data-site-template="editorial"] wrapper that styles/editorial.css scopes
 * every rule under, with --club-primary/--club-secondary/--club-accent
 * supplied on it -- exactly what components/editorial/EditorialShell.tsx
 * does for the real page. That shell also mounts EditorialHeader/Footer,
 * which this preview intentionally leaves out, matching every other
 * Scaled*Preview (e.g. ScaledContactPreview), which preview page content
 * only, not chrome.
 */
const DEFAULT_PRIMARY = "#1B2958";
const DEFAULT_SECONDARY = "#AD3234";

interface ScaledTryoutsPreviewProps {
  tryouts: TryoutContent[];
  clubName: string;
  contactEmail: string;
  /** Page-level intro copy, resolved from the unsaved page-copy draft. */
  content: TryoutsPageContent;
}

export default function ScaledTryoutsPreview({
  tryouts,
  clubName,
  contactEmail,
  content,
}: ScaledTryoutsPreviewProps) {
  const club = useClubContext();
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const [theme, setTheme] = useState<ClubThemeColors>({
    primary: club.primaryColor ?? DEFAULT_PRIMARY,
    secondary: club.secondaryColor ?? DEFAULT_SECONDARY,
    accent: club.secondaryColor ?? DEFAULT_SECONDARY,
  });

  useEffect(() => {
    if (!isEditorial) return;
    let cancelled = false;

    fetchClubThemeColors(club.id, {
      primary: club.primaryColor ?? DEFAULT_PRIMARY,
      secondary: club.secondaryColor ?? DEFAULT_SECONDARY,
    })
      .then((value) => {
        if (!cancelled) setTheme(value);
      })
      .catch((error: unknown) => {
        console.error("ScaledTryoutsPreview: fetchClubThemeColors:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isEditorial, club.id, club.primaryColor, club.secondaryColor]);

  if (isEditorial) {
    return (
      <ScaledPagePreview className="bg-[#F9FAFD]">
        <div
          data-site-template="editorial"
          style={
            {
              "--club-primary": theme.primary,
              "--club-secondary": theme.secondary,
              "--club-accent": theme.accent,
            } as CSSProperties
          }
        >
          <EditorialTryouts
            tryouts={tryouts}
            contactEmail={contactEmail}
            content={content}
          />
        </div>
      </ScaledPagePreview>
    );
  }

  return (
    <ScaledPagePreview className="bg-[#F9FAFD]">
      <AcademyTryoutsPage
        tryouts={tryouts}
        clubName={clubName}
        contactEmail={contactEmail}
        content={content}
      />
    </ScaledPagePreview>
  );
}
