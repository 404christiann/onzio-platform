import SponsorsPage from "@/app/(public)/sponsors/page";
import { codeSiteFor } from "@/lib/code-site";
import AcademySponsorsPage from "@/components/sites/diverse-city/AcademySponsorsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchSiteSponsorLogos } from "@/lib/queries";

export default async function TenantSponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (codeSiteFor(club) !== "diverse-city") return <SponsorsPage />;
  const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
  return <AcademySponsorsPage sponsors={sponsors} clubName={club.name} />;
}
