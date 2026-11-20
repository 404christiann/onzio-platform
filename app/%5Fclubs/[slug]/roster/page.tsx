import PublicRosterPage from "@/app/(public)/roster/page";
import { getClubContextBySlug } from "@/lib/club-context";
import { publicPagesFor } from "@/lib/site-public-pages";

/** A club's site package may server-render its Roster; every other club renders the shared client page. */
export default async function TenantRosterPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  const SitePage = publicPagesFor(club)?.roster;
  return SitePage ? <SitePage club={club} /> : <PublicRosterPage />;
}
