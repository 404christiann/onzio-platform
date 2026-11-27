import { notFound, redirect } from "next/navigation";
import { codeSiteFor } from "@/lib/code-site";
import CinematicDestination from "@/components/cinematic/CinematicDestination";
import { fetchCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import AcademyTryoutsPage from "@/components/sites/diverse-city/AcademyTryoutsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { clubToday } from "@/lib/club-time";
import { readPublicClubTimeZone } from "@/lib/public-club-time-zone";
import {
  fetchContactProfile,
  fetchTryouts,
  fetchTryoutsPageContent,
} from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";
import { renderableLink } from "@/lib/link-destination";

export default async function TenantTryoutsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey === "cinematic@2") {
    const db = (await createClient()).schema("onzio");
    const content = await fetchCinematicHomepageContent(club.id, db);
    const destination = content.navigation.destinations.tryouts;
    const href = renderableLink(destination);
    if (href) redirect(href);
    return <CinematicDestination clubId={club.id} labelId="tryouts" />;
  }

  if (codeSiteFor(club) !== "diverse-city") notFound();
  const onzio = (await createClient()).schema("onzio");
  // A tryout closes the day after its date in the club's own time zone.
  const today = clubToday(await readPublicClubTimeZone(club.id));
  const [tryouts, contactProfile, content] = await Promise.all([
    fetchTryouts(club.id, onzio, today),
    fetchContactProfile(club.id, onzio),
    fetchTryoutsPageContent(club.id, onzio),
  ]);
  return (
    <AcademyTryoutsPage
      tryouts={tryouts}
      clubName={club.name}
      contactEmail={contactProfile?.publicEmail ?? ""}
      content={content}
    />
  );
}
