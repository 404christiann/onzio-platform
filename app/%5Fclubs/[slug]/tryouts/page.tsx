import { notFound } from "next/navigation";
import AcademyTryoutsPage from "@/components/AcademyTryoutsPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchTryouts } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantTryoutsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "academy@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const tryouts = await fetchTryouts(club.id, onzio);
  return <AcademyTryoutsPage tryouts={tryouts} />;
}
