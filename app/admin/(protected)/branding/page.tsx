"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import LegacyBranding from "@/components/admin/club-settings/LegacyBranding";
import { ClassicBranding } from "@/components/admin/club-settings/ClassicBranding";
import { clubSettingsEditorFor } from "@/lib/admin-club-editors";
import { RoseCityBranding } from "@/components/admin/club-settings/rose-city/RoseCityBranding";

export default function BrandingPage() {
  const club = useClubContext();
  if (useAdminPortal().portal === "reimagined") return <LegacyBranding />;
  // A club listed in lib/admin-club-editors.ts gets the editor-kit Club settings; every other club keeps ClassicBranding.
  return clubSettingsEditorFor(club) === "kit" ? <RoseCityBranding /> : <ClassicBranding />;
}
