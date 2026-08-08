import { notFound } from "next/navigation";
import AcademyProgramDetailPage from "@/components/AcademyProgramDetailPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchProgramBySlug, fetchPrograms } from "@/lib/queries";
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
  // The sibling list feeds the mockup-parity "Explore other programs."
  // button row.
  const [program, programs] = await Promise.all([
    fetchProgramBySlug(club.id, programSlug, onzio),
    fetchPrograms(club.id, onzio),
  ]);
  if (!program) notFound();
  const otherPrograms = programs.filter(
    (candidate) => candidate.slug !== programSlug,
  );
  return (
    <AcademyProgramDetailPage program={program} otherPrograms={otherPrograms} />
  );
}
