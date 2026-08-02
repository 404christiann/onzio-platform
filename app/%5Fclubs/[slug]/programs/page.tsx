import { notFound } from "next/navigation";
import AcademyProgramsPage from "@/components/AcademyProgramsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchPrograms } from "@/lib/queries";

export default async function TenantProgramsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "academy@1") notFound();
  const programs = await fetchPrograms(club.id);
  return <AcademyProgramsPage programs={programs} />;
}
