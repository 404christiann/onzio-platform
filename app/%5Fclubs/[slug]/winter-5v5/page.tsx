import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwaySpecList from "@/components/pathway/PathwaySpecList";
import { winter5v5Content } from "@/components/pathway/content";

// pathway@1 Winter 5v5 page (MLA P1 Step 6): the seasonal promo page,
// reachable by direct URL only. Composition: hero (left) + spec-list. The
// hero's own primaryCta ("Register interest") already routes to /contact
// (see content.ts), satisfying the plan's "CTA to /contact" requirement
// without a second, redundant CTA block.
export default async function TenantWinter5v5Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...winter5v5Content.hero} />
      <PathwaySpecList {...winter5v5Content.specs} />
    </>
  );
}
