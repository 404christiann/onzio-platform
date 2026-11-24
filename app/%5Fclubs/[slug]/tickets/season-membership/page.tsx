import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { pageVisible } from "@/lib/public-page-visibility";
import { fetchPublicPageVisibility } from "@/lib/public-page-visibility-query";
import { createClient } from "@/lib/supabase-server";
import { fetchTicketPage } from "@/lib/cinematic-ticket-pages-query";
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";

export default async function SeasonMembershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  // An owner-hidden page is a 404 for visitors, never a redirect.
  const visibility = await fetchPublicPageVisibility(club.id);
  if (!pageVisible({ publicPageVisibility: visibility }, "season-membership")) notFound();
  const content = await fetchTicketPage(club.id, "season-membership", (await createClient()).schema("onzio"));
  return <CinematicSeasonMembership content={content} />;
}
