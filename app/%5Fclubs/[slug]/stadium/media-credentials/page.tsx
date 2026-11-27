import { notFound, redirect } from "next/navigation";
import CinematicDestination from "@/components/cinematic/CinematicDestination";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { createClient } from "@/lib/supabase-server";
import { renderableLink } from "@/lib/link-destination";

export default async function MediaCredentialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const db = (await createClient()).schema("onzio");
  const content = await fetchCinematicHomepageContent(club.id, db);
  const destination = content.navigation.destinations.mediaCredentials;
  const href = renderableLink(destination);
  if (href) redirect(href);
  return <CinematicDestination clubId={club.id} labelId="media-credentials" />;
}
