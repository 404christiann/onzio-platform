import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { readPublicClubTimeZone } from "@/lib/public-club-time-zone";
import { fetchTicketPage } from "@/lib/cinematic-ticket-pages-query";
import CinematicKnowBeforeYouGo from "@/components/cinematic/CinematicKnowBeforeYouGo";
import { loadKnowBeforeYouGoMatch } from "@/components/cinematic/know-before-you-go-match";

export default async function KnowBeforeYouGoPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const client = (await createClient()).schema("onzio");
  // The match box is fetched here so it is in the first paint; if this fails the page loads it in the browser instead.
  const [content, initialMatch] = await Promise.all([
    fetchTicketPage(club.id, "know-before-you-go", client),
    readPublicClubTimeZone(club.id)
      .then(timeZone => loadKnowBeforeYouGoMatch(club.id, timeZone, new Date(), client))
      .catch((error: unknown) => { console.error("KnowBeforeYouGoPage:", error); return undefined; }),
  ]);
  return <CinematicKnowBeforeYouGo content={content} initialMatch={initialMatch} />;
}
