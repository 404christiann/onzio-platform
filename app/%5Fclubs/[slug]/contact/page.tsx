import { notFound } from "next/navigation";
import AcademyContactPage from "@/components/AcademyContactPage";
import EditorialContactPage from "@/components/editorial/EditorialContactPage";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayContactForm from "@/components/pathway/PathwayContactForm";
import { contactContent } from "@/components/pathway/content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchContactContent } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantContactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);

  // pathway@1 (MLA P1 Step 6): a hardcoded hero (left) + PathwayContactForm,
  // ahead of the editorial@1/academy@1 branches below -- the form itself
  // resolves tenant identity server-side from the request headers
  // middleware.ts already sets, not from any club data fetched here.
  if (club.presentationTemplateKey === "pathway@1") {
    return (
      <>
        <PathwayHero {...contactContent.hero} />
        <PathwayContactForm {...contactContent.form} />
      </>
    );
  }

  if (club.presentationTemplateKey === "editorial@1") {
    const onzio = (await createClient()).schema("onzio");
    const content = await fetchContactContent(club.id, onzio);
    return <EditorialContactPage content={content} />;
  }

  if (club.presentationTemplateKey !== "academy@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const content = await fetchContactContent(club.id, onzio);
  return <AcademyContactPage content={content} clubName={club.name} />;
}
