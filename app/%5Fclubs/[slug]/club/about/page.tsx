import AboutClubPageClient from "@/components/AboutClubPageClient";
import ClubhouseAboutPage from "@/components/ClubhouseAboutPage";
import { DEFAULT_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchAboutClubContent, fetchSiteSponsorLogos } from "@/lib/queries";

export default async function TenantAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  const content = await fetchAboutClubContent(club.id).catch((error) => {
    console.error("TenantAboutPage:", error);
    return { about: DEFAULT_ABOUT_PAGE_CONTENT };
  });
  if (club.presentationTemplateKey === "clubhouse@1") {
    const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
    return <ClubhouseAboutPage content={content.about} sponsors={sponsors} />;
  }
  return <AboutClubPageClient content={content.about} />;
}
