"use client";

import Link from "next/link";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import type { DBAboutPageContent } from "@/lib/db-types";

function stringHighlights(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Editorial club-story page, using the approved mockup's interior structure. */
export default function EditorialAboutPage({
  content,
}: {
  content: DBAboutPageContent;
}) {
  const { identity } = useEditorialIdentity();
  const headingTop = identity?.storyHeadingTop?.trim() ?? "";
  const headingEm = identity?.storyHeadingEm?.trim() ?? "";
  const highlights = stringHighlights(identity?.highlights);
  const hasLocation = Boolean(identity?.venue || identity?.contactAddress);

  return (
    <div className="interior club-page">
      <header className="interior-hero">
        <span className="eyebrow">Our club</span>
        <h1>
          {headingTop || content.hero_title}
          {headingEm ? (
            <>
              <br />
              <em>{headingEm}</em>
            </>
          ) : null}
        </h1>
      </header>

      <section className="manifesto">
        <span className="story-mark" aria-label={`Founded ${identity?.foundedYear || ""}`}>
          {String(identity?.foundedYear ?? "").slice(-2)}
        </span>
        <div>
          {content.story_paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {identity?.mission ? <blockquote>“{identity.mission}”</blockquote> : null}
      </section>

      {highlights.length > 0 ? (
        <section className="club-highlights">
          <span className="eyebrow">{content.values_heading || "What defines us"}</span>
          <ul>
            {highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasLocation ? (
        <section className="find-us">
          <span className="eyebrow">Find us</span>
          <h2>Club contact</h2>
          <div className="find-us-grid">
            <div className="find-us-item">
              <span>Matchday</span>
              {identity?.venue ? <p>{identity.venue}</p> : null}
              {identity?.contactAddress ? <p>{identity.contactAddress}</p> : null}
            </div>
            <div className="find-us-item">
              <span>Get in touch</span>
              <Link href="/contact">Contact the club →</Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
