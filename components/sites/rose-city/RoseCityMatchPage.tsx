import CinematicMatchSummaryPage from "@/components/cinematic/CinematicMatchSummaryPage";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import type { getClubContextBySlug } from "@/lib/club-context";
import { fetchFixtureById } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

type Club = Awaited<ReturnType<typeof getClubContextBySlug>>;

/**
 * Rose City's Match Summary, fetched on the server so the first paint is the real match, not a loading line. The match
 * is read for this club only: an unknown id, or another club's, comes back as no match and the page says so.
 */
export default async function RoseCityMatchPage({ club, fixtureId }: { club: Club; fixtureId: string }) {
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    const [fixture, identity] = await Promise.all([fetchFixtureById(fixtureId, club.id, client), fetchClubIdentity(club.id, client)]);
    return { data: { fixture, clubLabel: identity?.initials || club.name }, failed: false };
  })().catch((error) => {
    console.error("RoseCityMatchPage:", error);
    return { data: null, failed: true };
  });
  return <CinematicMatchSummaryPage fixtureId={fixtureId} initial={initial} />;
}
