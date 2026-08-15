import { notFound } from "next/navigation";
import AboutClubPageClient from "@/components/AboutClubPageClient";
import ClubhouseAboutPage from "@/components/ClubhouseAboutPage";
import EditorialAboutPage from "@/components/editorial/EditorialAboutPage";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchAboutClubContent, fetchSiteSponsorLogos } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  // MLA P1 Step 6: pathway@1 uses the flat /about route, not this
  // sports-CMS-shaped club/about route, so it 404s here instead of falling
  // into the generic AboutClubPageClient default below.
  if (club.presentationTemplateKey === "pathway@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const content = await fetchAboutClubContent(club.id, onzio).catch((error) => {
    console.error("TenantAboutPage:", error);
    return { about: EMPTY_ABOUT_PAGE_CONTENT };
  });
  if (club.presentationTemplateKey === "editorial@1") {
    return <EditorialAboutPage content={content.about} />;
  }
  if (club.presentationTemplateKey === "clubhouse@1") {
    const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
    return <ClubhouseAboutPage content={content.about} sponsors={sponsors} />;
  }
  return <AboutClubPageClient content={content.about} />;
}
