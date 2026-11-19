import { RoseCityBranding } from "@/components/admin/club-settings/rose-city/RoseCityBranding";
import { RoseCityFrame } from "@/components/admin/club-settings/rose-city/RoseCityFrame";
import { RoseCityStatsPage } from "@/components/admin/stats/rose-city/RoseCityStatsPage";

/** Rose City's site package. Its admin editors replace the shared ones (see lib/site-for.ts). */
export const roseCitySite = {
  id: "rose-city",
  adminEditors: { branding: RoseCityBranding, clubSettingsFrame: RoseCityFrame, stats: RoseCityStatsPage },
} as const;
