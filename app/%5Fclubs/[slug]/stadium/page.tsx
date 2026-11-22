import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { pageVisible } from "@/lib/public-page-visibility";
import { createClient } from "@/lib/supabase-server";
import { fetchRobinsonContent } from "@/lib/cinematic-robinson-query";
import { fetchTicketsContent } from "@/lib/tickets-query";
import CinematicRobinson from "@/components/cinematic/CinematicRobinson";
export default async function StadiumPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  // An owner-hidden page is a 404 for visitors, never a redirect.
  if (!pageVisible(club, "stadium")) notFound();
  const db = (await createClient()).schema("onzio");
  const [content, ticketing] = await Promise.all([fetchRobinsonContent(club.id, db), fetchTicketsContent(club.id, db)]);
  return <CinematicRobinson content={content} ticketing={ticketing} pageVisibility={club.publicPageVisibility} />;
}
