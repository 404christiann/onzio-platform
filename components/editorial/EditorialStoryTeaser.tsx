"use client";

import Link from "next/link";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";

/**
 * Minimal "Our story" teaser section, driven by
 * club_identity.identity_heading_top/em and a short excerpt from
 * about_page_content. Links to /club/about, the full story page a later
 * phase builds. Deliberately omits the mockup's .story-meta founding facts
 * and .story-pillars highlights strip -- those belong to the full club page,
 * not this homepage teaser. Ported unchanged from the superseded reference
 * branch's EditorialStoryTeaser.tsx (identity_heading_top/em are unaffected
 * by the Lions E1 schema change), aside from the /club -> /club/about link
 * fix, since /club/about is this branch's real route registered in
 * packages/presentation/index.ts's routeRegistry, not /club.
 */
export default function EditorialStoryTeaser({
  excerpt,
}: {
  excerpt: string | null;
}) {
  const { identity } = useEditorialIdentity();
  const headingTop = identity?.identityHeadingTop ?? "";
  const headingEm = identity?.identityHeadingEm ?? "";

  return (
    <section className="club-story">
      <header className="story-heading">
        <span className="eyebrow">Our identity</span>
        {(headingTop || headingEm) && (
          <h2>
            {headingTop}
            {headingEm && (
              <>
                <br />
                <em>{headingEm}</em>
              </>
            )}
          </h2>
        )}
      </header>
      <div className="story-copy">
        {excerpt && <p>{excerpt}</p>}
        <Link href="/club/about">Our story →</Link>
      </div>
    </section>
  );
}
