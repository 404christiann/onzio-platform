import { notFound } from "next/navigation";
import AcademyTryoutsPage from "@/components/AcademyTryoutsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchTryouts } from "@/lib/queries";

export default async function TenantTryoutsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "academy@1") notFound();
  const tryouts = await fetchTryouts(club.id);
  return <AcademyTryoutsPage tryouts={tryouts} />;
}
