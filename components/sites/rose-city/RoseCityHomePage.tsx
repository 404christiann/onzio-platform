import CinematicHome from "@/components/cinematic/CinematicHome";
import { loadCinematicHomeData } from "@/components/cinematic/cinematic-home-data";
import type { ClubContext } from "@/lib/club-context";
import type { DBHomepageHeroContent } from "@/lib/db-types";
import { createClient } from "@/lib/supabase-server";

/**
 * Rose City's home, rendered on the server so first paint is complete: every read uses the request client, so
 * no loading line or late swap follows hydration. Client previews (the admin editor) render CinematicHome
 * directly through HomePageClient and keep their client-side loading.
 */
export default async function RoseCityHomePage({ club, initialHeroContent }: { club: ClubContext; initialHeroContent: DBHomepageHeroContent | null }) {
  const initialData = await loadCinematicHomeData(club.id, (await createClient()).schema("onzio"));
  return <CinematicHome initialHeroContent={initialHeroContent} initialData={initialData} />;
}
