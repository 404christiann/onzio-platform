import SponsorsPage from "@/app/(public)/sponsors/page";
import AcademySponsorsPage from "@/components/AcademySponsorsPage";
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
  if (club.presentationTemplateKey !== "academy@1") return <SponsorsPage />;
  const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
  return <AcademySponsorsPage sponsors={sponsors} clubName={club.name} />;
}
