import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwaySeniorInterest from "@/components/pathway/PathwaySeniorInterest";
import { seniorClubContent } from "@/components/pathway/content";

// pathway@1 Senior Club page (MLA P1 Step 6): the third pathway stage.
// The stage remains honestly marked coming soon, followed by the shared,
// tenant-safe contact flow for players who want to register interest.
export default async function TenantSeniorClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return <PathwaySeniorInterest {...seniorClubContent.interest} />;
}
