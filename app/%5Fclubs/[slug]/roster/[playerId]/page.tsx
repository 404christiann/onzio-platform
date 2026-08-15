import { notFound } from "next/navigation";
import PlayerPage from "@/app/(public)/roster/[playerId]/page";
import { getClubContextBySlug } from "@/lib/club-context";

// MLA P1 Step 6: pathway@1 is not a sports-CMS site, so this sports-CMS-only
// route 404s for that tenant instead of rendering an empty player profile.
export default async function TenantPlayerPage({
  params,
}: {
  params: Promise<{ slug: string; playerId: string }>;
}) {
  const { slug, playerId } = await params;
  const club = await getClubContextBySlug(slug);
  if (club.presentationTemplateKey === "pathway@1") notFound();
  return <PlayerPage params={Promise.resolve({ playerId })} />;
}
