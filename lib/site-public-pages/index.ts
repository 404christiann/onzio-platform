import type { getClubContextBySlug } from "@/lib/club-context";

export type SiteClub = Awaited<ReturnType<typeof getClubContextBySlug>>;

/**
 * Server-rendered public pages a club's site package supplies in place of the shared client pages. A tenant route
 * does one lookup, `site<Page>PageFor(club)`, and never branches on a club or template itself.
 *
 * One file per route (home.ts, roster.ts, ...): Next ships every client component reachable from a route to every
 * club that visits it, so a route's lookup may only reference that route's site pages. Chosen by slug, as in
 * lib/site-for.ts (a template key may not be read in new code); not imported from there so the public routes don't
 * pull the site packages' admin editors into their bundles.
 */
export function bySlug<T>(pages: Readonly<Record<string, T>>): (club: Readonly<{ slug: string }>) => T | null {
  return (club) => (Object.prototype.hasOwnProperty.call(pages, club.slug) ? pages[club.slug] : null);
}
