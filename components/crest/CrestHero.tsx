"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { EMPTY_HOMEPAGE_HERO_CONTENT } from "@/lib/homepage-content";
import { fetchHomepageContent } from "@/lib/queries";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type { DBHomepageHeroContent } from "@/lib/db-types";

/**
 * crest.hero -- crest@1's Home hero (contentDomain "homepage",
 * emptyBehavior "error": every crest@1 tenant is required to have real hero
 * copy). Same server-resolved-then-client-fallback shape as Hero.tsx and
 * components/editorial/EditorialHero.tsx: initialHeroContent is resolved
 * server-side by app/%5Fclubs/[slug]/page.tsx -> HomePageClient so the first
 * paint already shows this club's own copy, and only falls back to a client
 * fetch when no server value is available.
 *
 * Visual refresh (2026-08-18): crest@1 now matches Manu Ledesma Academy's
 * real pathway@1 site instead of the earlier Real-Madrid-inspired mock --
 * copy on the left carries the hero's visual weight (eyebrow rule, huge
 * bold sans headline, intro, pill CTAs); the real CV United crest (wired
 * through Supabase Storage by scripts/seed-cv-united.ts, the same pipeline
 * scripts/seed-mla-local.ts established) sits in a modest showcase panel
 * on the right (`.crest-hero-mark`, styles/globals.css), not a
 * hero-dominant medallion. CV United has no real team photography yet, so
 * -- per Christian's explicit direction -- this hero does not fabricate
 * stock photography; the panel's brand-black ground + gold ring supplies
 * the hero's secondary visual interest instead. homepage_hero_content
 * carries no photo field regardless, so there is nothing in this section's
 * real data contract to hang a photo on even if one existed.
 *
 * The crest is real now, not a placeholder, so there is no more "coming
 * soon" caption or initials fallback: when clubLogoUrl is unset the
 * showcase panel simply does not render (see
 * `.crest-hero-inner:has(.crest-hero-copy:only-child)` in
 * styles/globals.css for the resulting full-width copy layout), rather than
 * inventing a mark that doesn't exist.
 *
 * Typography precision pass (2026-08-19): the JSX/markup below is
 * unchanged from the 08-18 visual refresh -- eyebrow (`.crest-hero-kicker`),
 * headline (`.crest-hero-headline`), and CTAs (`.crest-cta*`) all pulled
 * their exact size/weight/line-height/letter-spacing/font-family from
 * MLA's live computed DOM styles this pass, and those corrections live
 * entirely in styles/globals.css's `.crest-home` block (see the per-rule
 * comments there), not here.
 */
export default function CrestHero({
  initialHeroContent,
}: {
  initialHeroContent: DBHomepageHeroContent | null;
}) {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
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
        console.error("CrestHero: fetchHomepageContent:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id, hasServerContent]);

  const eyebrow = heroContent.eyebrow.trim();
  const headlineTop = heroContent.headline_line_one.trim() || club.name;
  const headlineEm = heroContent.headline_line_two.trim();
  const intro = heroContent.intro.trim();
  const primaryLabel = heroContent.primary_cta_label.trim() || "Next match";
  const primaryHref = heroContent.primary_cta_href.trim() || "/schedule";
  const secondaryLabel = heroContent.secondary_cta_label.trim() || "Meet the squad";
  const secondaryHref = heroContent.secondary_cta_href.trim() || "/roster";
  const hasCrestLogo = clubLogoUrl.trim().length > 0;

  return (
    <section className="crest-hero">
      <div className="crest-hero-inner">
        <div className="crest-hero-copy">
          {eyebrow && (
            <div className="crest-hero-kicker-block">
              <span className="crest-hero-kicker">{eyebrow}</span>
              <span className="crest-hero-rule" aria-hidden="true" />
            </div>
          )}
          <h1 className="crest-hero-headline">
            <span>{headlineTop}</span>
            {headlineEm && <em>{headlineEm}</em>}
          </h1>
          {intro && <p className="crest-hero-intro">{intro}</p>}
          <div className="crest-hero-cta">
            <Link href={primaryHref} className="crest-cta crest-cta-primary">
              {primaryLabel}
            </Link>
            <Link href={secondaryHref} className="crest-cta crest-cta-secondary">
              {secondaryLabel}
            </Link>
          </div>
        </div>
        {hasCrestLogo && (
          <div className="crest-hero-media">
            <div className="crest-hero-mark">
              <Image
                src={clubLogoUrl}
                alt={`${club.name} crest`}
                width={320}
                height={320}
                priority
                sizes="(max-width: 800px) 60vw, 320px"
                {...imageDeliveryProps("club-logo")}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
