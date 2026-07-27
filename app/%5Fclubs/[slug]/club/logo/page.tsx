import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import { DEFAULT_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchAboutClubContent } from "@/lib/queries";

export default async function TenantClubLogoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  const content = await fetchAboutClubContent(club.id).catch((error) => {
    console.error("TenantClubLogoPage:", error);
    return { logo: DEFAULT_CLUB_LOGO_PAGE_CONTENT };
  });
  return <ClubLogoPageClient content={content.logo} />;
}
