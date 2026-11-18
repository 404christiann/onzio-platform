import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { fetchTicketPage } from "@/lib/cinematic-ticket-pages-query";
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";

export default async function SeasonMembershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const content = await fetchTicketPage(club.id, "season-membership", (await createClient()).schema("onzio"));
  return <CinematicSeasonMembership content={content} />;
}
