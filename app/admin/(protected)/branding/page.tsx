"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import LegacyBranding from "@/components/admin/club-settings/LegacyBranding";
import { ClassicBranding } from "@/components/admin/club-settings/ClassicBranding";

export default function BrandingPage() {
  return useAdminPortal().portal === "reimagined" ? <LegacyBranding /> : <ClassicBranding />;
}
