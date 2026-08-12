import HomePageClient from "@/components/HomePageClient";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchHomepageHeroContent } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

// Resolves the homepage hero server-side (same pattern as
// app/%5Fclubs/[slug]/club/about/page.tsx) so the first paint already shows
// this tenant's own copy. Previously this file re-exported the client
// homepage, whose Hero initialized from the hardcoded Rose City default and
// only swapped in the real club's content after a client-side fetch — every
// other club's homepage briefly flashed "Rose City FC" / "Team Store" /
// "Meet the Squad" on load (reported by Diverse City FC).
export default async function TenantHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  const onzio = (await createClient()).schema("onzio");
  const heroContent = await fetchHomepageHeroContent(club.id, onzio).catch(
    (error: unknown) => {
      console.error("TenantHomePage:", error);
      return null;
    },
  );
  return <HomePageClient initialHeroContent={heroContent} />;
}
