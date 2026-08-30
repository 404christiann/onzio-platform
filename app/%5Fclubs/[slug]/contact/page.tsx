import { notFound } from "next/navigation";
import AcademyContactPage from "@/components/AcademyContactPage";
import EditorialContactPage from "@/components/editorial/EditorialContactPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchContactContent } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantContactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);

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
