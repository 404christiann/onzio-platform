import { notFound } from "next/navigation";
import SponsorsPage from "@/app/(public)/sponsors/page";
import AcademySponsorsPage from "@/components/AcademySponsorsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchSiteSponsorLogos } from "@/lib/queries";

export default async function TenantSponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  // MLA P1 Step 6: pathway@1 is not a sports-CMS site, so this route 404s
  // for that tenant instead of falling into the generic SponsorsPage below.
  if (club.presentationTemplateKey === "pathway@1") notFound();
  if (club.presentationTemplateKey !== "academy@1") return <SponsorsPage />;
  const sponsors = await fetchSiteSponsorLogos("carousel", club.id);
  return <AcademySponsorsPage sponsors={sponsors} clubName={club.name} />;
}
