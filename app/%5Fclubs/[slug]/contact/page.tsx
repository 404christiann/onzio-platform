import { notFound } from "next/navigation";
import AcademyContactPage from "@/components/AcademyContactPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchContactContent } from "@/lib/queries";

export default async function TenantContactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "academy@1") notFound();
  const content = await fetchContactContent(club.id);
  return <AcademyContactPage content={content} />;
}
