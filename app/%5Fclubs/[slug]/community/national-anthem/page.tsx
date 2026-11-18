import { notFound, redirect } from "next/navigation";
import CinematicDestination from "@/components/cinematic/CinematicDestination";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchCinematicHomepageContent, isSafeCinematicDestination } from "@/lib/cinematic-homepage-content";
import { createClient } from "@/lib/supabase-server";

export default async function NationalAnthemRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const content = await fetchCinematicHomepageContent(club.id, (await createClient()).schema("onzio"));
  const destination = content.navigation.destinations.nationalAnthem;
  if (isSafeCinematicDestination(destination)) redirect(destination);
  return <CinematicDestination clubId={club.id} labelId="national-anthem" />;
}
