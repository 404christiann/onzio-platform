"use client";

import Link from "next/link";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";

/** Source-aligned editorial homepage story teaser, backed by club identity. */
export default function EditorialStoryTeaser({
  excerpt,
}: {
  excerpt: string | null;
}) {
  const { identity } = useEditorialIdentity();
  const headingTop = identity?.identityHeadingTop ?? "";
  const headingEm = identity?.identityHeadingEm ?? "";
  const highlights = Array.isArray(identity?.highlights)
    ? identity.highlights
        .filter((highlight): highlight is string => typeof highlight === "string")
        .slice(0, 3)
    : [];

  return (
    <section className="club-story">
      <div className="story-main">
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
          {(identity?.foundedYear || identity?.venue) && (
            <div className="story-meta">
              {identity?.foundedYear ? (
                <span>
                  Founded <strong>{identity.foundedYear}</strong>
                </span>
              ) : null}
              {identity?.venue ? (
                <span>
                  Home <strong>{identity.venue}</strong>
                </span>
              ) : null}
            </div>
          )}
          <Link href="/club/about">Our story</Link>
        </div>
      </div>

      {highlights.length > 0 ? (
        <aside
          className="story-pillars"
          aria-label={`What defines ${identity?.shortName || "the club"}`}
        >
          <span className="story-pillars-label">What defines us</span>
          <div className="story-pillar-list">
            {highlights.map((highlight) => (
              <article className="story-pillar-item" key={highlight}>
                <h3>{highlight}</h3>
              </article>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
