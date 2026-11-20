import PublicMatchAreaPage from "@/app/(public)/schedule/[fixtureId]/page";
import { getClubContextBySlug } from "@/lib/club-context";
import { siteMatchPageFor } from "@/lib/site-public-pages/match";

/**
 * A club's site package may server-render its Match Summary; every other club renders the shared match page. The club
 * is resolved by slug, as the middleware did: a preview host (rc-sam) is not a verified club domain, so a lookup by
 * Host finds no club there.
 */
export default async function TenantMatchAreaPage({ params }: { params: Promise<{ slug: string; fixtureId: string }> }) {
  const { slug, fixtureId } = await params;
  const club = await getClubContextBySlug(slug);
  const SitePage = siteMatchPageFor(club);
  return SitePage ? <SitePage club={club} fixtureId={fixtureId} /> : <PublicMatchAreaPage params={params} />;
}
