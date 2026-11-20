import PublicRosterPage from "@/app/(public)/roster/page";
import CinematicRosterPage from "@/components/cinematic/CinematicRosterPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchRoster } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

/**
 * Rose City's cinematic@2 Roster is fetched here so the first paint is the real squad rather than a loading
 * line that later pushes the footer down. Every other template renders the existing client page.
 */
export default async function TenantRosterPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") return <PublicRosterPage />;
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    return { roster: await fetchRoster(undefined, club.id, {}, client), failed: false };
  })().catch((error) => {
    console.error("TenantRosterPage:", error);
    return { roster: null, failed: true };
  });
  return <CinematicRosterPage initial={initial} />;
}
