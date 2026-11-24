import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { pageVisible } from "@/lib/public-page-visibility";
import { fetchPublicPageVisibility } from "@/lib/public-page-visibility-query";
import { createClient } from "@/lib/supabase-server";
import { fetchTicketsContent } from "@/lib/tickets-query";
import CinematicTickets from "@/components/cinematic/CinematicTickets";
export default async function TicketsPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  // An owner-hidden page is a 404 for visitors, never a redirect.
  const visibility = await fetchPublicPageVisibility(club.id);
  if (!pageVisible({ publicPageVisibility: visibility }, "tickets")) notFound();
  const content = await fetchTicketsContent(club.id, (await createClient()).schema("onzio"));
  return <CinematicTickets content={content} pageVisibility={visibility} />;
}
