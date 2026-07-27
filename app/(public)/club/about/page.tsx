import AboutClubPageClient from "@/components/AboutClubPageClient";
import { DEFAULT_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
import { fetchAboutClubContent } from "@/lib/queries";

export default async function AboutClubPage() {
  const content = await fetchAboutClubContent().catch((error) => {
    console.error("AboutClubPage:", error);
    return { about: DEFAULT_ABOUT_PAGE_CONTENT };
  });

  return <AboutClubPageClient content={content.about} />;
}
