import { notFound } from "next/navigation";
import AcademyProgramDetailPage from "@/components/AcademyProgramDetailPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchProgramBySlug } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantProgramDetailPage({
  params,
}: {
  params: Promise<{ slug: string; programSlug: string }>;
}) {
  const { slug, programSlug } = await params;
  const club = await getClubContextBySlug(slug);
  if (club.presentationTemplateKey !== "academy@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const program = await fetchProgramBySlug(club.id, programSlug, onzio);
  if (!program) notFound();
  return <AcademyProgramDetailPage program={program} />;
}
