"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clubLogoUrl,
  DEFAULT_ACADEMY_FOOTER_TAGLINE,
  DEFAULT_CLUB_LOGO_PATH,
} from "@/lib/club-branding";
import { fetchClubBranding } from "@/lib/queries";
import type { ClubBranding } from "@/lib/queries";
import { useOptionalClubContext } from "@/components/ClubContextProvider";

type ClubBrandingContextValue = {
  brandingPending: boolean;
  clubLogoPath: string;
  clubLogoUrl: string;
  inverseLogoPath: string;
  inverseLogoUrl: string;
  /** Resolved footer tagline; already falls back to the template default. */
  footerTagline: string;
  setClubLogoPath: (path: string) => void;
  refreshClubBranding: () => Promise<void>;
};

const ClubBrandingContext = createContext<ClubBrandingContextValue | null>(null);

export function ClubBrandingProvider({
  children,
  initialBranding,
}: {
  children: React.ReactNode;
  initialBranding?: ClubBranding | null;
}) {
  const club = useOptionalClubContext();
  const [brandingPending, setBrandingPending] = useState(Boolean(club) && !initialBranding);
  const [logoPath, setLogoPath] = useState(
    initialBranding?.logoPath ?? (club ? "" : DEFAULT_CLUB_LOGO_PATH),
  );
  const [inverseLogoPath, setInverseLogoPath] = useState(initialBranding?.inverseLogoPath ?? "");
  const [footerTagline, setFooterTagline] = useState(
    initialBranding?.footerTagline ?? DEFAULT_ACADEMY_FOOTER_TAGLINE,
  );

  const refreshClubBranding = useCallback(async () => {
    try {
      if (!club) return;
      const branding = await fetchClubBranding(club.id);
      setLogoPath(branding.logoPath);
      setInverseLogoPath(branding.inverseLogoPath);
      setFooterTagline(branding.footerTagline);
    } catch (error) {
      console.error("ClubBrandingProvider:", error);
    } finally {
      setBrandingPending(false);
    }
  }, [club]);

  useEffect(() => {
    if (initialBranding) return;
    void refreshClubBranding();
  }, [initialBranding, refreshClubBranding]);

  const value = useMemo<ClubBrandingContextValue>(
    () => ({
      brandingPending,
      clubLogoPath: logoPath,
      clubLogoUrl: clubLogoUrl(logoPath),
      inverseLogoPath,
      inverseLogoUrl: clubLogoUrl(inverseLogoPath || logoPath),
      footerTagline,
      setClubLogoPath: setLogoPath,
      refreshClubBranding,
    }),
    [brandingPending, footerTagline, inverseLogoPath, logoPath, refreshClubBranding],
  );

  return (
    <ClubBrandingContext.Provider value={value}>
      {children}
    </ClubBrandingContext.Provider>
  );
}

export function useClubBranding(): ClubBrandingContextValue {
  const context = useContext(ClubBrandingContext);
  if (!context) {
    throw new Error("useClubBranding must be used inside ClubBrandingProvider");
  }
  return context;
}
