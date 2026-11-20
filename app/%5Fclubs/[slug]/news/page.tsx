import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { fetchNewsArticles } from "@/lib/cinematic-news-query";
import { CinematicNewsList } from "@/components/cinematic/CinematicNews";
import { newsPartnerSponsors } from "@/lib/cinematic-news-partners";

export default async function NewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const db = (await createClient()).schema("onzio");
  const [articles, sponsors] = await Promise.all([fetchNewsArticles(club.id, db), newsPartnerSponsors(club.id, db)]);
  return <CinematicNewsList articles={articles} sponsors={sponsors} />;
}
