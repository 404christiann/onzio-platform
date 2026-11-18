import { notFound } from "next/navigation";
import CinematicDestination from "@/components/cinematic/CinematicDestination";
import CinematicPartners from "@/components/cinematic/CinematicPartners";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchCinematicPartners } from "@/lib/cinematic-partners-query";
import { createClient } from "@/lib/supabase-server";

export default async function PartnershipOpportunitiesPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const partners = await fetchCinematicPartners(club.id, (await createClient()).schema("onzio"));
  return partners
    ? <CinematicPartners page="opportunities" {...partners} />
    : <CinematicDestination clubId={club.id} labelId="partnership" />;
}
