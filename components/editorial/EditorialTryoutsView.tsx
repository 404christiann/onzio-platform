"use client";

import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import type { TryoutPageContent } from "@/lib/club-identity";

/**
 * Presentational editorial tryouts page (`/tryouts`): an interior hero, a
 * tryout-sessions list, a "what to bring" checklist, and a closing CTA with
 * club contact info.
 *
 * Per Christian's already-approved scope decision, this page is
 * informational only — no registration form, no signup mutation, no admin
 * surface. It only tells prospective players when/where tryouts happen and
 * how to reach the club afterward.
 *
 * The caller (`EditorialTryouts`) supplies the already-fetched
 * `tryout_page_content` (headline, intro, sessions, checklist, fee note, CTA
 * label); contact info (`contactEmail`, `contactPhone`) comes from the
 * shared `club_identity` the tenant layout already fetches once for the
 * whole template, via `useEditorialIdentity()` — no duplicate fetch, the
 * same pattern `EditorialClubStoryView`'s "Find us" section uses.
 */
export default function EditorialTryoutsView({
  content,
}: {
  content: TryoutPageContent | null;
}) {
  const { identity } = useEditorialIdentity();

  const headlineTop = content?.heroHeadlineTop ?? "";
  const headlineEm = content?.heroHeadlineEm ?? "";
  const heroIntro = content?.heroIntro ?? "";
  const sessions = content?.sessions ?? [];
  const whatToBring = content?.whatToBring ?? [];
  const feeNote = content?.feeNote ?? "";
  const ctaLabel = content?.ctaLabel ?? "";
  const contactEmail = identity?.contactEmail ?? "";
  const contactPhone = identity?.contactPhone ?? "";

  return (
    <div className="interior tryouts-page">
      <header className="interior-hero">
        <span className="eyebrow">Join the club</span>
        <h1>
          {headlineTop}
          {headlineEm && (
            <>
              <br />
              <em>{headlineEm}</em>
            </>
          )}
        </h1>
        {heroIntro && <p className="tryouts-intro">{heroIntro}</p>}
      </header>

      <section className="tryout-sessions">
        <span className="eyebrow">Tryout sessions</span>
        <h2>Upcoming sessions</h2>
        <div className="tryout-sessions-grid">
          {sessions.map((session) => (
            <article className="tryout-session-card" key={session.ageGroup}>
              <h3>{session.ageGroup}</h3>
              <p className="tryout-session-detail">{session.dateRange}</p>
              <p className="tryout-session-detail">{session.dayTime}</p>
              {session.notes && (
                <p className="tryout-session-notes">{session.notes}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      {whatToBring.length > 0 && (
        <section className="tryout-checklist">
          <span className="eyebrow">Come prepared</span>
          <h2>What to bring</h2>
          <ul>
            {whatToBring.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="tryout-cta">
        {feeNote && <p>{feeNote}</p>}
        {ctaLabel && <h2>{ctaLabel}</h2>}
        {contactEmail && (
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        )}
        {contactPhone && <p>{contactPhone}</p>}
      </section>
    </div>
  );
}
