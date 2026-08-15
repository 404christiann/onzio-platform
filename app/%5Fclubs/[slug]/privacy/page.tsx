import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayLegalDoc from "@/components/pathway/PathwayLegalDoc";
import { privacyContent } from "@/components/pathway/content";

// pathway@1 Privacy page (MLA P1 Step 6): reachable by direct URL only.
// Composition: legal-doc.
export default async function TenantPrivacyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return <PathwayLegalDoc {...privacyContent.doc} />;
}
