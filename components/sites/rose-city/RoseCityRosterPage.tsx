import CinematicRosterPage from "@/components/cinematic/CinematicRosterPage";
import type { getClubContextBySlug } from "@/lib/club-context";
import { fetchRoster, fetchStaff } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

type Club = Awaited<ReturnType<typeof getClubContextBySlug>>;

/** Rose City's Roster, fetched on the server so the first paint is the real squad, not a loading line. */
export default async function RoseCityRosterPage({ club }: { club: Club }) {
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    const [roster, staff] = await Promise.all([fetchRoster(undefined, club.id, {}, client), fetchStaff(club.id, client)]);
    return { roster, staff, failed: false };
  })().catch((error) => {
    console.error("RoseCityRosterPage:", error);
    return { roster: null, staff: [], failed: true };
  });
  return <CinematicRosterPage initial={initial} />;
}
