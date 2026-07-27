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
  DEFAULT_CLUB_LOGO_PATH,
} from "@/lib/club-branding";
import { fetchClubBranding } from "@/lib/queries";
import { useOptionalClubContext } from "@/components/ClubContextProvider";

type ClubBrandingContextValue = {
  clubLogoPath: string;
  clubLogoUrl: string;
  setClubLogoPath: (path: string) => void;
  refreshClubBranding: () => Promise<void>;
};

const ClubBrandingContext = createContext<ClubBrandingContextValue | null>(null);

export function ClubBrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const club = useOptionalClubContext();
  const [logoPath, setLogoPath] = useState(
    club ? "" : DEFAULT_CLUB_LOGO_PATH,
  );

  const refreshClubBranding = useCallback(async () => {
    try {
      if (!club) return;
      const branding = await fetchClubBranding(club.id);
      setLogoPath(branding.logoPath);
    } catch (error) {
      console.error("ClubBrandingProvider:", error);
    }
  }, [club]);

  useEffect(() => {
    void refreshClubBranding();
  }, [refreshClubBranding]);

  const value = useMemo<ClubBrandingContextValue>(
    () => ({
      clubLogoPath: logoPath,
      clubLogoUrl: clubLogoUrl(logoPath),
      setClubLogoPath: setLogoPath,
      refreshClubBranding,
    }),
    [logoPath, refreshClubBranding],
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
