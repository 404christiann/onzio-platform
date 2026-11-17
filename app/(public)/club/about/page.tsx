import AcademyAboutPage from "@/components/sites/diverse-city/AcademyAboutPage";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
import { fetchAboutClubContent } from "@/lib/queries";

export default async function AboutClubPage() {
  const content = await fetchAboutClubContent().catch((error) => {
    console.error("AboutClubPage:", error);
    return { about: EMPTY_ABOUT_PAGE_CONTENT };
  });

  return <AcademyAboutPage content={content.about} />;
}
