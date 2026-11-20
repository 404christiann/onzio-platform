import PublicSchedulePage from "@/app/(public)/schedule/page";
import CinematicSchedulePage from "@/components/cinematic/CinematicSchedulePage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

/**
 * Rose City's cinematic@2 Schedule is fetched here so the first paint is the real fixture list. The server clock
 * travels with the data so the "Next" fixture is the same on the server and in the browser. Every other template
 * renders the existing client page.
 */
export default async function TenantSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") return <PublicSchedulePage />;
  const nowIso = new Date().toISOString();
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    const [season, identity] = await Promise.all([fetchActiveSeason(club.id, client), fetchClubIdentity(club.id, client)]);
    const fixtures = season ? await fetchSchedule(season.id, club.id, client) : [];
    return { data: { fixtures, seasonLabel: season?.label ?? "Current", timeZone: identity?.timeZone || "UTC" }, failed: false, nowIso };
  })().catch((error) => {
    console.error("TenantSchedulePage:", error);
    return { data: null, failed: true, nowIso };
  });
  return <CinematicSchedulePage initial={initial} />;
}
