"use client";

import { EditorialButtonLink } from "@/components/ui/editorial/button";
import { EditorialValueCard } from "@/components/ui/editorial/value-card";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";

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
    <section className="club-story bg-ed-paper px-5 py-24 text-ed-ink md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-start">
        <header className="story-heading grid gap-6">
          <span className="eyebrow">Our identity</span>
          {(headingTop || headingEm) && (
            <h2 className="text-[clamp(3.5rem,10vw,8.5rem)] uppercase leading-[0.82]">
              {headingTop}
              {headingEm && (
                <>
                  <br />
                  <em className="not-italic text-ed-accent">{headingEm}</em>
                </>
              )}
            </h2>
          )}
        </header>

        <div className="story-copy grid gap-8">
          {excerpt && <p className="text-xl leading-9 text-ed-muted">{excerpt}</p>}
          {(identity?.foundedYear || identity?.venue) && (
            <div className="story-meta grid gap-4 sm:grid-cols-2">
              {identity?.foundedYear ? (
                <EditorialValueCard index={1} title="Founded">
                  <strong className="text-ed-ink">{identity.foundedYear}</strong>
                </EditorialValueCard>
              ) : null}
              {identity?.venue ? (
                <EditorialValueCard index={2} title="Home">
                  <strong className="text-ed-ink">{identity.venue}</strong>
                </EditorialValueCard>
              ) : null}
            </div>
          )}
          {highlights.length > 0 ? (
            <aside
              className="story-pillars grid gap-4"
              aria-label={`What defines ${identity?.shortName || "the club"}`}
            >
              {highlights.map((highlight, index) => (
                <EditorialValueCard key={highlight} index={index + 1} title={highlight} />
              ))}
            </aside>
          ) : null}
          <EditorialButtonLink href="/club/about" variant="ghost" className="justify-self-start">
            Our story
          </EditorialButtonLink>
        </div>
      </div>
    </section>
  );
}
