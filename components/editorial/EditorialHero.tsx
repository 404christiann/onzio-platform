"use client";

import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";

/**
 * Editorial homepage hero, ported from the approved concept mockup
 * (soccerplatformmockups src/components/public/HomeScreen.tsx `.hero`
 * section).
 *
 * The two-line locked headline, intro copy, and CTAs are entirely
 * data-driven from `club_identity` (never hardcoded per-club copy), so the
 * same markup renders correctly for any future `editorial` club. The
 * oversized crest sits on the continuous navy-to-red `--club-primary` →
 * `--club-secondary` gradient defined by `.hero` in the editorial
 * stylesheet.
 */
export default function EditorialHero() {
  const club = useClubContext();
  const { identity, crestUrl } = useEditorialIdentity();
  const headlineTop = identity?.heroHeadlineTop || club.name;
  const headlineEm = identity?.heroHeadlineEm ?? "";
  const intro = identity?.heroIntro ?? "";

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
            <Link href="/schedule">Next match</Link>
            <Link href="/roster">Meet the squad</Link>
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
