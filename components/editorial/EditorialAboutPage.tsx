"use client";

import { EditorialSectionHeading } from "@/components/ui/editorial/section-heading";
import { EditorialValueCard } from "@/components/ui/editorial/value-card";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import type { DBAboutPageContent } from "@/lib/db-types";

function stringHighlights(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default function EditorialAboutPage({
  content,
}: {
  content: DBAboutPageContent;
}) {
  const { identity } = useEditorialIdentity();
  const headingTop = identity?.storyHeadingTop?.trim() ?? "";
  const headingEm = identity?.storyHeadingEm?.trim() ?? "";
  const highlights = stringHighlights(identity?.highlights);
  const foundedLabel = identity?.foundedYear ? String(identity.foundedYear) : "Club";

  return (
    <div className="interior club-page bg-ed-paper px-5 pb-28 pt-32 text-ed-ink md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-16">
        <header className="interior-hero grid gap-8 border-b border-[color:var(--ed-line)] pb-12">
          <span className="eyebrow">Our club</span>
          <h1 className="max-w-[11ch] text-[clamp(4rem,13vw,11rem)] uppercase leading-[0.78]">
            {headingTop || content.hero_title}
            {headingEm ? (
              <>
                <br />
                <em className="not-italic text-ed-accent">{headingEm}</em>
              </>
            ) : null}
          </h1>
        </header>

        <section className="manifesto grid gap-8 md:grid-cols-[10rem_1fr]">
          <span
            className="story-mark font-display text-[clamp(5rem,13vw,10rem)] font-black leading-none text-ed-accent"
            aria-label={`Founded ${identity?.foundedYear || ""}`}
          >
            {foundedLabel.slice(-2)}
          </span>
          <div className="grid gap-8">
            <div className="grid gap-6 text-xl leading-9 text-ed-muted">
              {content.story_paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {identity?.mission ? (
              <blockquote className="border-l-4 border-ed-accent pl-6 font-display text-3xl font-black uppercase leading-tight">
                &quot;{identity.mission}&quot;
              </blockquote>
            ) : null}
          </div>
        </section>

        {highlights.length > 0 ? (
          <section className="club-highlights grid gap-8">
            <EditorialSectionHeading
              eyebrow={content.values_heading || "What defines us"}
              title="Values"
              titleClassName="text-[clamp(3.5rem,10vw,8rem)]"
            />
            <div className="grid gap-4 md:grid-cols-3">
              {highlights.map((highlight, index) => (
                <EditorialValueCard key={highlight} index={index + 1} title={highlight} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
