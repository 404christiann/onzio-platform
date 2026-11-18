import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import CinematicCrest from "@/components/cinematic/CinematicCrest";
import { EMPTY_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchAboutClubContent } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantClubLogoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  const content = await fetchAboutClubContent(club.id, (await createClient()).schema("onzio")).catch((error) => {
    console.error("TenantClubLogoPage:", error);
    return { logo: EMPTY_CLUB_LOGO_PAGE_CONTENT };
  });
  return club.presentationTemplateKey === "cinematic@2"
    ? <CinematicCrest content={content.logo} />
    : <ClubLogoPageClient content={content.logo} />;
}
