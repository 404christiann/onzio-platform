import SponsorsPage from "@/app/(public)/sponsors/page";
import AcademySponsorsPage from "@/components/AcademySponsorsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchSiteSponsorLogos } from "@/lib/queries";

export default async function TenantSponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "academy@1") return <SponsorsPage />;
  const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
  return <AcademySponsorsPage sponsors={sponsors} clubName={club.name} />;
}
