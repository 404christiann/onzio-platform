"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import { EMPTY_HOMEPAGE_HERO_CONTENT } from "@/lib/homepage-content";
import { fetchHomepageContent } from "@/lib/queries";
import type { DBHomepageHeroContent } from "@/lib/db-types";

/**
 * Editorial homepage hero. Visually ported from the approved concept mockup
 * via the superseded reference branch's EditorialHero.tsx, but rewired to a
 * different data source: the reference branch read the two-line headline
 * and intro off club_identity.hero_headline_top/em/hero_intro, columns that
 * no longer exist on this branch's onzio.club_identity (Lions E1
 * deliberately excludes hero copy from that table). Per Christian's
 * decision, Lions' hero now reads homepage_hero_content -- the same
 * admin-editable table Diverse City's academy@1 homepage already uses --
 * mapping headline_line_one -> the top span, headline_line_two -> the <em>
 * line, and intro -> the intro paragraph, exactly like components/Hero.tsx
 * does for clubhouse@1/academy@1/classic.
 *
 * initialHeroContent is resolved server-side by the tenant homepage
 * (app/%5Fclubs/[slug]/page.tsx -> HomePageClient -> EditorialHome) so the
 * first paint already shows this club's own copy, matching Hero.tsx's own
 * "hasServerContent" first-paint fix. Only falls back to a client fetch when
 * no server value is available.
 */
export default function EditorialHero({
  initialHeroContent,
}: {
  initialHeroContent: DBHomepageHeroContent | null;
}) {
  const club = useClubContext();
  const { crestUrl } = useEditorialIdentity();
  const hasServerContent = initialHeroContent !== null;
  const [heroContent, setHeroContent] = useState<DBHomepageHeroContent>(
    initialHeroContent ?? EMPTY_HOMEPAGE_HERO_CONTENT,
  );

  useEffect(() => {
    if (hasServerContent) return;
    let cancelled = false;
    fetchHomepageContent(club.id)
      .then((content) => {
        if (!cancelled) setHeroContent(content.hero);
      })
      .catch((error: unknown) => {
        console.error("EditorialHero: fetchHomepageContent:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id, hasServerContent]);

  const headlineTop = heroContent.headline_line_one.trim() || club.name;
  const headlineEm = heroContent.headline_line_two.trim();
  const intro = heroContent.intro.trim();
  const primaryHref = heroContent.primary_cta_href.trim() || "/schedule";
  const secondaryHref = heroContent.secondary_cta_href.trim() || "/roster";
  const primaryLabel = heroContent.primary_cta_label.trim() || "Next match";
  const secondaryLabel = heroContent.secondary_cta_label.trim() || "Meet the squad";

  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-copy">
          <h1>
            <span>{headlineTop}</span>
            {headlineEm && <em>{headlineEm}</em>}
          </h1>
          {intro && <p className="hero-intro">{intro}</p>}
          <div className="hero-cta">
            <Link href={primaryHref}>{primaryLabel}</Link>
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </div>
        </div>
        <div className="hero-media" aria-label={`${club.name} crest`}>
          {crestUrl && (
            <Image
              className="hero-crest"
              src={crestUrl}
              alt={`${club.name} crest`}
              width={720}
              height={712}
              priority
              sizes="(max-width: 800px) 78vw, 42vw"
              {...imageDeliveryProps("club-logo")}
            />
          )}
        </div>
      </div>
    </section>
  );
}
