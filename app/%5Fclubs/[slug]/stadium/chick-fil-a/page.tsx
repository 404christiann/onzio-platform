import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { pageVisible } from "@/lib/public-page-visibility";
import { fetchPublicPageVisibility } from "@/lib/public-page-visibility-query";
import { createClient } from "@/lib/supabase-server";
import { fetchChickFilAContent } from "@/lib/chick-fil-a-query";
import { fetchTicketsContent } from "@/lib/tickets-query";
import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA";
export default async function ChickFilAPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  // An owner-hidden page is a 404 for visitors, never a redirect.
  const visibility = await fetchPublicPageVisibility(club.id);
  if (!pageVisible({ publicPageVisibility: visibility }, "chick-fil-a")) notFound();
  const db = (await createClient()).schema("onzio");
  const [content, purchase] = await Promise.all([fetchChickFilAContent(club.id, db), fetchTicketsContent(club.id, db)]);
  return <CinematicChickFilA content={content} purchase={purchase} />;
}
