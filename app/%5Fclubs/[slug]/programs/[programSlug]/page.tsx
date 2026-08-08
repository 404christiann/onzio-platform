import { notFound } from "next/navigation";
import AcademyProgramDetailPage from "@/components/AcademyProgramDetailPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchPrograms } from "@/lib/queries";
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
  // One fetch serves both the page's own program and the mockup-parity
  // "Explore other programs." button row.
  const programs = await fetchPrograms(club.id, onzio);
  const program = programs.find((candidate) => candidate.slug === programSlug);
  if (!program) notFound();
  const otherPrograms = programs.filter(
    (candidate) => candidate.slug !== programSlug,
  );
  return (
    <AcademyProgramDetailPage program={program} otherPrograms={otherPrograms} />
  );
}
