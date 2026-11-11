import { notFound } from "next/navigation";
import { codeSiteFor } from "@/lib/code-site";
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

export default async function TenantTryoutsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);

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
