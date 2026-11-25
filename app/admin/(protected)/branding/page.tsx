"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import { ClassicBranding } from "@/components/admin/club-settings/ClassicBranding";
import { siteFor } from "@/lib/site-for";

export default function BrandingPage() {
  const club = useClubContext();
  const Editor = siteFor(club)?.adminEditors?.branding ?? ClassicBranding;
  return <Editor />;
}
