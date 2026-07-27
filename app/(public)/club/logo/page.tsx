import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import { DEFAULT_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { fetchAboutClubContent } from "@/lib/queries";

export default async function ClubLogoPage() {
  const content = await fetchAboutClubContent().catch((error) => {
    console.error("ClubLogoPage:", error);
    return { logo: DEFAULT_CLUB_LOGO_PAGE_CONTENT };
  });

  return <ClubLogoPageClient content={content.logo} />;
}
