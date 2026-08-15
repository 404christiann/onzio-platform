import { notFound } from "next/navigation";
import StatsPage from "@/app/(public)/stats/page";
import { getClubContextBySlug } from "@/lib/club-context";

// MLA P1 Step 6: pathway@1 is not a sports-CMS site, so this sports-CMS-only
// route 404s for that tenant instead of rendering the generic "not
// published" fallback StatsPage otherwise shows.
export default async function TenantStatsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey === "pathway@1") notFound();
  return <StatsPage />;
}
