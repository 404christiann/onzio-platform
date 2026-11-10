import {
  IconAbout,
  IconAnalytics,
  IconBranding,
  IconContact,
  IconDashboard,
  IconHomepage,
  IconMatchStats,
  IconPayments,
  IconPrograms,
  IconRegistrations,
  IconRoster,
  IconSchedule,
  IconSeasons,
  IconSeasonStats,
  IconShop,
  IconSponsors,
  IconStandings,
  IconTeamAccess,
  IconTryouts,
  type AdminIconComponent,
} from "@/components/admin/icons";
import type { AdminRouteIconKey } from "@/lib/admin-route-manifest";

// ADMIN-RE-05 built the More list here; ADMIN-RE-24 replaced it with each
// tab's page list (TabPage.tsx), which keeps these icons: each page has the
// icon it has in the classic admin.
export const ROUTE_ICONS: Record<AdminRouteIconKey, AdminIconComponent> = {
  dashboard: IconDashboard,
  homepage: IconHomepage,
  programs: IconPrograms,
  tryouts: IconTryouts,
  shop: IconShop,
  about: IconAbout,
  sponsors: IconSponsors,
  contact: IconContact,
  seasons: IconSeasons,
  roster: IconRoster,
  schedule: IconSchedule,
  "match-stats": IconMatchStats,
  "season-stats": IconSeasonStats,
  standings: IconStandings,
  registrations: IconRegistrations,
  analytics: IconAnalytics,
  branding: IconBranding,
  "team-access": IconTeamAccess,
  payments: IconPayments,
};
