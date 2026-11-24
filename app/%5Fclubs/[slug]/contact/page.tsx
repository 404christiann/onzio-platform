import { notFound } from "next/navigation";
import { codeSiteFor } from "@/lib/code-site";
import CinematicDestination from "@/components/cinematic/CinematicDestination";
import CinematicContact from "@/components/cinematic/CinematicContact";
import AcademyContactPage from "@/components/sites/diverse-city/AcademyContactPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchContactContent } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";
import { fetchCinematicContactContent } from "@/lib/cinematic-contact-query";
import { fetchPublicPageVisibility } from "@/lib/public-page-visibility-query";

export default async function TenantContactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey === "cinematic@2") {
    // The "Visible to visitors" map is a fail-open read ({} on any error): a row that leads to a hidden page is left out.
    const [content, visibility] = await Promise.all([fetchCinematicContactContent(club.id, (await createClient()).schema("onzio")), fetchPublicPageVisibility(club.id)]);
    return content ? <CinematicContact content={content} pageVisibility={visibility} /> : <CinematicDestination clubId={club.id} labelId="contact" />;
  }

  if (codeSiteFor(club) !== "diverse-city") notFound();
  const onzio = (await createClient()).schema("onzio");
  const content = await fetchContactContent(club.id, onzio);
  return <AcademyContactPage content={content} clubName={club.name} />;
}
