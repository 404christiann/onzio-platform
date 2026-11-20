import PublicSchedulePage from "@/app/(public)/schedule/page";
import { getClubContextBySlug } from "@/lib/club-context";
import { publicPagesFor } from "@/lib/site-public-pages";

/** A club's site package may server-render its Schedule; every other club renders the shared client page. */
export default async function TenantSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  const SitePage = publicPagesFor(club)?.schedule;
  return SitePage ? <SitePage club={club} /> : <PublicSchedulePage />;
}
