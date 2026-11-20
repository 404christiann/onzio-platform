import type { ComponentType } from "react";
import RoseCityRosterPage from "@/components/sites/rose-city/RoseCityRosterPage";
import RoseCitySchedulePage from "@/components/sites/rose-city/RoseCitySchedulePage";
import RoseCityShopPage from "@/components/sites/rose-city/RoseCityShopPage";
import type { getClubContextBySlug } from "@/lib/club-context";

type Club = Awaited<ReturnType<typeof getClubContextBySlug>>;

/**
 * Server-rendered public pages a club's site package supplies in place of the shared client pages. A tenant route
 * does one lookup, `publicPagesFor(club)?.<page>`, and never branches on a club or template itself. Server-only: the
 * pages read with the request's Supabase client.
 */
export type SitePublicPages = {
  roster?: ComponentType<{ club: Club }>;
  schedule?: ComponentType<{ club: Club }>;
  shop?: ComponentType<{ club: Club }>;
};

// Chosen by slug, as in lib/site-for.ts (a template key may not be read in new code). Not imported from there so the
// public routes don't pull the site packages' admin editors into their bundles. The key matches roseCitySite.id.
const PUBLIC_PAGES_BY_SLUG: Readonly<Record<string, SitePublicPages>> = {
  "rose-city": { roster: RoseCityRosterPage, schedule: RoseCitySchedulePage, shop: RoseCityShopPage },
};

export function publicPagesFor(club: Readonly<{ slug: string }>): SitePublicPages | null {
  return Object.prototype.hasOwnProperty.call(PUBLIC_PAGES_BY_SLUG, club.slug) ? PUBLIC_PAGES_BY_SLUG[club.slug] : null;
}
