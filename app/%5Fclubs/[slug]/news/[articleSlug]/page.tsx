import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { fetchClubIdentity } from "@/lib/editorial-identity";
import { isNewsSlug } from "@/lib/cinematic-news";
import { fetchNewsArticle } from "@/lib/cinematic-news-query";
import { CinematicNewsArticle } from "@/components/cinematic/CinematicNews";
import CinematicDestination from "@/components/cinematic/CinematicDestination";

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string; articleSlug: string }> }) {
  const { slug, articleSlug } = await params;
  const club = await getClubContextBySlug(slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  // The Injury Report has its own page under /news until RC2027-INJURY-REPORT replaces it.
  if (articleSlug === "injury-report") return <CinematicDestination clubId={club.id} labelId="injury-report" />;
  if (!isNewsSlug(articleSlug)) notFound();
  const db = (await createClient()).schema("onzio");
  const [article, identity] = await Promise.all([fetchNewsArticle(club.id, articleSlug, db), fetchClubIdentity(club.id, db)]);
  if (!article) notFound();
  return <CinematicNewsArticle article={article} timeZone={identity?.timeZone || "UTC"} />;
}
