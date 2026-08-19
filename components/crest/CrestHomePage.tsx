"use client";

import CrestHero from "@/components/crest/CrestHero";
import CrestFeatureBand from "@/components/crest/CrestFeatureBand";
import CrestPartnerStrip from "@/components/crest/CrestPartnerStrip";
import type { DBHomepageHeroContent } from "@/lib/db-types";

/**
 * Real crest@1 Home composition: hero -> feature-band -> partner-strip,
 * matching packages/presentation/index.ts's registered
 * `defaultSections`/`supportedSections` for crest@1 exactly (crest.hero,
 * crest.feature-band, crest.partner-strip -- no more, no fewer).
 *
 * Follows the fully-separate-component precedent
 * components/ClubhouseHomePage.tsx and components/editorial/EditorialHome.tsx
 * established for a template that earns its own visually distinct home,
 * rather than academy@1's in-line branching inside HomePageClient.tsx /
 * Hero.tsx. Own components/crest/ subfolder, mirroring components/editorial/.
 *
 * initialHeroContent is resolved server-side by app/%5Fclubs/[slug]/page.tsx
 * and threaded through HomePageClient exactly like every other template's
 * Hero, so this component only forwards it to CrestHero.
 */
export default function CrestHomePage({
  initialHeroContent,
}: {
  initialHeroContent: DBHomepageHeroContent | null;
}) {
  return (
    <div className="crest-home" data-presentation-template="crest@1">
      <CrestHero initialHeroContent={initialHeroContent} />
      <CrestFeatureBand />
      <CrestPartnerStrip />
    </div>
  );
}
