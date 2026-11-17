import {
  IconChartSolid,
  IconCupSolid,
  IconGlobe,
  IconGlobeSolid,
  IconHomepage,
  IconHouseSolid,
  IconLayersSolid,
  IconMatchStats,
  IconPrograms,
  IconSettings,
  IconSettingsSolid,
  IconStandings,
  type AdminIconComponent,
} from "@/components/admin/icons";
import type { AdminTabId } from "@/lib/admin-tabs";

// ADMIN-RE-24: each tab's icons.download glyph, outline and (when selected) solid.
export const TAB_ICONS: Record<AdminTabId, readonly [AdminIconComponent, AdminIconComponent]> = {
  home: [IconHomepage, IconHouseSolid],
  games: [IconStandings, IconCupSolid],
  programs: [IconPrograms, IconLayersSolid],
  website: [IconGlobe, IconGlobeSolid],
  insights: [IconMatchStats, IconChartSolid],
  club: [IconSettings, IconSettingsSolid],
};
