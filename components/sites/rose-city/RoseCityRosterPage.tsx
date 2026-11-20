import CinematicRosterPage from "@/components/cinematic/CinematicRosterPage";
import type { getClubContextBySlug } from "@/lib/club-context";
import { fetchRoster } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

type Club = Awaited<ReturnType<typeof getClubContextBySlug>>;

/** Rose City's Roster, fetched on the server so the first paint is the real squad, not a loading line. */
export default async function RoseCityRosterPage({ club }: { club: Club }) {
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    return { roster: await fetchRoster(undefined, club.id, {}, client), failed: false };
  })().catch((error) => {
    console.error("RoseCityRosterPage:", error);
    return { roster: null, failed: true };
  });
  return <CinematicRosterPage initial={initial} />;
}
