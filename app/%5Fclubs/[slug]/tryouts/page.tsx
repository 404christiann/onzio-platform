import { notFound } from "next/navigation";
import AcademyTryoutsPage from "@/components/AcademyTryoutsPage";
import EditorialTryouts from "@/components/editorial/EditorialTryouts";
import { getClubContextBySlug } from "@/lib/club-context";
import {
  fetchContactProfile,
  fetchTryouts,
  fetchTryoutsPageContent,
} from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export default async function TenantTryoutsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);

  if (club.presentationTemplateKey === "editorial@1") {
    const onzio = (await createClient()).schema("onzio");
    const [tryouts, contactProfile, content] = await Promise.all([
      fetchTryouts(club.id, onzio),
      fetchContactProfile(club.id, onzio),
      fetchTryoutsPageContent(club.id, onzio),
    ]);
    return (
      <EditorialTryouts
        tryouts={tryouts}
        contactEmail={contactProfile?.publicEmail ?? ""}
        content={content}
      />
    );
  }

  if (club.presentationTemplateKey !== "academy@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const [tryouts, contactProfile, content] = await Promise.all([
    fetchTryouts(club.id, onzio),
    fetchContactProfile(club.id, onzio),
    fetchTryoutsPageContent(club.id, onzio),
  ]);
  return (
    <AcademyTryoutsPage
      tryouts={tryouts}
      clubName={club.name}
      contactEmail={contactProfile?.publicEmail ?? ""}
      content={content}
    />
  );
}
