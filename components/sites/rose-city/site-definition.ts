import { RoseCityBranding } from "@/components/admin/club-settings/rose-city/RoseCityBranding";
import { RoseCityFrame } from "@/components/admin/club-settings/rose-city/RoseCityFrame";

/** Rose City's site package. Its admin editors replace the shared ones (see lib/site-for.ts). */
export const roseCitySite = {
  id: "rose-city",
  adminEditors: { branding: RoseCityBranding, clubSettingsFrame: RoseCityFrame },
} as const;
