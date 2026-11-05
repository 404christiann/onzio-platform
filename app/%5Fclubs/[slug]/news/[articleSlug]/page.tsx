import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { fetchClubIdentity } from "@/lib/editorial-identity";
import { isNewsSlug } from "@/lib/cinematic-news";
import { fetchNewsArticle } from "@/lib/cinematic-news-query";
import { CinematicNewsArticle } from "@/components/cinematic/CinematicNews";
import CinematicInjuryReport from "@/components/cinematic/CinematicInjuryReport";
import CinematicNewsPartners from "@/components/cinematic/CinematicNewsPartners";
import { fetchInjuryReport } from "@/lib/cinematic-injury-report-query";

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string; articleSlug: string }> }) {
  const { slug, articleSlug } = await params;
  const club = await getClubContextBySlug(slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const db = (await createClient()).schema("onzio");
  // "injury-report" is reserved from News addresses for Sam's Injury Report page (RC2027-INJURY-REPORT).
  if (articleSlug === "injury-report") return <><CinematicInjuryReport report={await fetchInjuryReport(club.id, db)} /><CinematicNewsPartners /></>;
  if (!isNewsSlug(articleSlug)) notFound();
  const [article, identity] = await Promise.all([fetchNewsArticle(club.id, articleSlug, db), fetchClubIdentity(club.id, db)]);
  if (!article) notFound();
  return <CinematicNewsArticle article={article} timeZone={identity?.timeZone || "UTC"} />;
}
