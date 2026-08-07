import { notFound } from "next/navigation";
import AcademyProgramsPage from "@/components/AcademyProgramsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchPrograms } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantProgramsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "academy@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const programs = await fetchPrograms(club.id, onzio);
  return <AcademyProgramsPage programs={programs} clubName={club.name} />;
}
