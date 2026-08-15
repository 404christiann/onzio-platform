import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayNumberedSteps from "@/components/pathway/PathwayNumberedSteps";
import PathwaySpecList from "@/components/pathway/PathwaySpecList";
import { upslPaymentsContent } from "@/components/pathway/content";

// pathway@1 UPSL Payments page (MLA P1 Step 6): informational-only payment
// explanation, reachable by direct URL (not a top-nav item). The Step 5
// agent included a hero in upslPaymentsContent even though the plan's
// composition table only listed numbered-steps + spec-list for this page,
// flagging that the page otherwise ships with no <h1>. Rendering the hero
// here is the right call -- a route without an <h1> is a real
// accessibility/SEO gap -- so the composition below includes it.
export default async function TenantUpslPaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...upslPaymentsContent.hero} />
      <PathwayNumberedSteps {...upslPaymentsContent.steps} />
      <PathwaySpecList {...upslPaymentsContent.specs} />
    </>
  );
}
