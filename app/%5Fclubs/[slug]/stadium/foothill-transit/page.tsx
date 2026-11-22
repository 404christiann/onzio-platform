import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { pageVisible } from "@/lib/public-page-visibility";
import { createClient } from "@/lib/supabase-server";
import { fetchStadiumContent } from "@/lib/stadium-query";
import { fetchTicketsContent } from "@/lib/tickets-query";
import CinematicStadium from "@/components/cinematic/CinematicStadium";

export default async function FoothillTransitPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  // An owner-hidden page is a 404 for visitors, never a redirect.
  if (!pageVisible(club, "foothill-transit")) notFound();
  const db = (await createClient()).schema("onzio");
  const [content, ticketing] = await Promise.all([fetchStadiumContent(club.id, db), fetchTicketsContent(club.id, db)]);
  return <CinematicStadium content={content} ticketing={ticketing} />;
}
