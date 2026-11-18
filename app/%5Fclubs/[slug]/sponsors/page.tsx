import SponsorsPage from "@/app/(public)/sponsors/page";
import { codeSiteFor } from "@/lib/code-site";
import AcademySponsorsPage from "@/components/sites/diverse-city/AcademySponsorsPage";
import CinematicPartners from "@/components/cinematic/CinematicPartners";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchCinematicPartners } from "@/lib/cinematic-partners-query";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantSponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey === "cinematic@2") {
    const partners = await fetchCinematicPartners(club.id, (await createClient()).schema("onzio"));
    return partners ? <CinematicPartners page="partners" {...partners} /> : <SponsorsPage />;
  }
  if (codeSiteFor(club) !== "diverse-city") return <SponsorsPage />;
  const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
  return <AcademySponsorsPage sponsors={sponsors} clubName={club.name} />;
}
