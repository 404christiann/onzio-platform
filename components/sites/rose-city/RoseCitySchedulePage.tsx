import CinematicSchedulePage from "@/components/cinematic/CinematicSchedulePage";
import type { getClubContextBySlug } from "@/lib/club-context";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

type Club = Awaited<ReturnType<typeof getClubContextBySlug>>;

/**
 * Rose City's Schedule, fetched on the server so the first paint is the real fixture list. The server clock travels
 * with the data so the "Next" fixture is the same on the server and in the browser.
 */
export default async function RoseCitySchedulePage({ club }: { club: Club }) {
  const nowIso = new Date().toISOString();
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    const [season, identity] = await Promise.all([fetchActiveSeason(club.id, client), fetchClubIdentity(club.id, client)]);
    const fixtures = season ? await fetchSchedule(season.id, club.id, client) : [];
    return { data: { fixtures, seasonLabel: season?.label ?? "Current", timeZone: identity?.timeZone || "UTC" }, failed: false, nowIso };
  })().catch((error) => {
    console.error("RoseCitySchedulePage:", error);
    return { data: null, failed: true, nowIso };
  });
  return <CinematicSchedulePage initial={initial} />;
}
