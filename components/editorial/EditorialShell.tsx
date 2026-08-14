"use client";

import { useEffect, useState, type CSSProperties } from "react";
import EditorialHeader from "@/components/editorial/EditorialHeader";
import EditorialFooter from "@/components/editorial/EditorialFooter";
import EditorialMotion from "@/components/editorial/EditorialMotion";
import { EditorialIdentityProvider } from "@/components/editorial/EditorialIdentityContext";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import {
  fetchClubIdentity,
  fetchClubThemeColors,
  type ClubIdentityContent,
  type ClubThemeColors,
} from "@/lib/editorial-identity";
import { fetchContactProfile, fetchSiteSocialLinks, type ContactProfileContent } from "@/lib/queries";
import type { DBSiteSocialLink } from "@/lib/db-types";
import "@/styles/editorial.css";

// Matches Hero.tsx's own default navy/red fallback (components/Hero.tsx) so
// an editorial tenant with no colors configured yet still renders a sane
// gradient instead of an empty custom property.
const DEFAULT_PRIMARY = "#1B2958";
const DEFAULT_SECONDARY = "#AD3234";

/**
 * Root wrapper for the editorial@1 site template, mounted by
 * app/%5Fclubs/[slug]/layout.tsx instead of Nav/Footer/TemplateFontScope.
 *
 * Sets data-site-template="editorial" (which scopes every rule in
 * styles/editorial.css) and injects the club's colors as the
 * --club-primary / --club-secondary / --club-accent custom properties the
 * editorial token system derives from. primary/secondary come straight off
 * ClubContext (already resolved by the tenant layout); accent is fetched
 * once here via fetchClubThemeColors since onzio.clubs.accent_color isn't
 * on ClubContext.
 *
 * club_identity, contact_profile, and site_social_links are each fetched
 * once here (not per-section) and shared down through
 * EditorialIdentityProvider / props, following the same "fetch once, hand
 * down as props" shape components/editorial/EditorialHome.tsx uses for
 * fixtures/slideshow/story content.
 */
export default function EditorialShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const club = useClubContext();
  const { clubLogoUrl, inverseLogoUrl } = useClubBranding();
  const [identity, setIdentity] = useState<ClubIdentityContent | null>(null);
  const [contactProfile, setContactProfile] = useState<ContactProfileContent | null>(null);
  const [socialLinks, setSocialLinks] = useState<DBSiteSocialLink[]>([]);
  const [theme, setTheme] = useState<ClubThemeColors>({
    primary: club.primaryColor ?? DEFAULT_PRIMARY,
    secondary: club.secondaryColor ?? DEFAULT_SECONDARY,
    accent: club.secondaryColor ?? DEFAULT_SECONDARY,
  });

  useEffect(() => {
    let cancelled = false;

    fetchClubIdentity(club.id)
      .then((value) => {
        if (!cancelled) setIdentity(value);
      })
      .catch((error: unknown) => {
        console.error("EditorialShell: fetchClubIdentity:", error);
        if (!cancelled) setIdentity(null);
      });

    fetchContactProfile(club.id)
      .then((value) => {
        if (!cancelled) setContactProfile(value);
      })
      .catch((error: unknown) => {
        console.error("EditorialShell: fetchContactProfile:", error);
        if (!cancelled) setContactProfile(null);
      });

    fetchSiteSocialLinks(club.id)
      .then((links) => {
        if (!cancelled) setSocialLinks(links);
      })
      .catch((error: unknown) => {
        console.error("EditorialShell: fetchSiteSocialLinks:", error);
        if (!cancelled) setSocialLinks([]);
      });

    fetchClubThemeColors(club.id, {
      primary: club.primaryColor ?? DEFAULT_PRIMARY,
      secondary: club.secondaryColor ?? DEFAULT_SECONDARY,
    })
      .then((value) => {
        if (!cancelled) setTheme(value);
      })
      .catch((error: unknown) => {
        console.error("EditorialShell: fetchClubThemeColors:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [club.id, club.primaryColor, club.secondaryColor]);

  const crestOnDarkUrl = inverseLogoUrl || clubLogoUrl;

  return (
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
      <EditorialHeader
        clubName={club.name}
        clubInitials={club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase()}
        crestUrl={clubLogoUrl}
        storeEnabled={club.storeEnabled}
      />
      <EditorialMotion />
      <EditorialIdentityProvider value={{ identity, crestUrl: clubLogoUrl, crestOnDarkUrl }}>
        <main className="public-main">{children}</main>
      </EditorialIdentityProvider>
      <EditorialFooter
        clubName={club.name}
        crestOnDarkUrl={crestOnDarkUrl}
        identity={identity}
        contactProfile={contactProfile}
        socialLinks={socialLinks}
        storeEnabled={club.storeEnabled}
      />
    </div>
  );
}
