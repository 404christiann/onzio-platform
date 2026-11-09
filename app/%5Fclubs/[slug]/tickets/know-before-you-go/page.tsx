import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { fetchTicketPage } from "@/lib/cinematic-ticket-pages-query";
import CinematicKnowBeforeYouGo from "@/components/cinematic/CinematicKnowBeforeYouGo";

export default async function KnowBeforeYouGoPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const content = await fetchTicketPage(club.id, "know-before-you-go", (await createClient()).schema("onzio"));
  return <CinematicKnowBeforeYouGo content={content} />;
}
