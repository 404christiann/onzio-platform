"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import LegacyBranding from "@/components/admin/club-settings/LegacyBranding";
import { ClassicBranding } from "@/components/admin/club-settings/ClassicBranding";
import { siteFor } from "@/lib/site-for";

export default function BrandingPage() {
  const club = useClubContext();
  const Editor = siteFor(club)?.adminEditors?.branding ?? ClassicBranding;
  return useAdminPortal().portal === "reimagined" ? <LegacyBranding /> : <Editor />;
}
