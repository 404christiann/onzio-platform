import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayTrainingGateway from "@/components/pathway/PathwayTrainingGateway";

// Shareable and no-JavaScript fallback for the site-wide booking gateway.
// The selector is reused in page mode: no backdrop, dialog semantics, focus
// trap, or close control, and every final action still hands off to Acuity.
export default async function TenantBookTrainingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return <PathwayTrainingGateway mode="page" />;
}
