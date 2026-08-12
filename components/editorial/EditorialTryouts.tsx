"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import type { TryoutContent } from "@/lib/queries";
import type { TryoutsPageContent } from "@/lib/tryouts-page-content";

/**
 * Presentational editorial tryouts page (`/tryouts`).
 *
 * Unlike the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's EditorialTryoutsView.tsx -- which consumed an informational-only
 * `tryout_page_content.sessions[]` / what-to-bring-list shape from a table
 * that no longer exists -- this component consumes the SAME real per-event data
 * Diverse City's academy@1 tryouts page already uses:
 * `fetchTryouts` -> `TryoutContent[]` (components/AcademyTryoutsPage.tsx is
 * the functional reference for what renders where). Only the visual layout
 * (interior hero + content sections) is carried over from that reference
 * branch; its data logic is not ported at all.
 *
 * Read-only: no <form>, no mutation. Registration/interest happens off-site
 * (a third-party `action.href`) or via a mailto fallback -- identical to the
 * academy@1 page's read-only render pattern, just restyled with editorial's
 * own --club-primary/secondary/accent tokens instead of DCFC's hardcoded
 * navy/red.
 */

function formatEventDate(value: string | null): string {
  if (!value) return "TBA";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? "TBA"
    : new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

const STATUS_LABEL: Record<TryoutContent["status"], string> = {
  upcoming: "Upcoming",
  open: "Open",
  closed: "Closed",
};

export default function EditorialTryouts({
  tryouts,
  contactEmail = "",
  content,
}: {
  tryouts: TryoutContent[];
  contactEmail?: string;
  content: TryoutsPageContent;
}) {
  const club = useClubContext();
  const hasTryouts = tryouts.length > 0;
  const email = contactEmail.trim();

  return (
    <div className="interior tryouts-page">
      <header className="interior-hero">
        <span className="eyebrow">Join the club</span>
        <h1>Join {club.name}</h1>
        <p className="tryouts-intro">
          {hasTryouts ? content.introWithTryouts : content.introNoTryouts}
        </p>
        {!hasTryouts && email ? (
          <a className="tryouts-hero-cta" href={`mailto:${email}`}>
            Register your interest
          </a>
        ) : null}
      </header>

      {hasTryouts ? (
        <section className="tryout-events">
          <span className="eyebrow">Tryout sessions</span>
          <h2>Upcoming opportunities</h2>
          <div className="tryout-events-list">
            {tryouts.map((tryout) => (
              <article className="tryout-event-card" key={tryout.id}>
                <div className="tryout-event-head">
                  <h3>{tryout.headline || "Tryout opportunity"}</h3>
                  <span
                    className="tryout-event-status"
                    data-status={tryout.status}
                  >
                    {STATUS_LABEL[tryout.status]}
                  </span>
                </div>
                <dl className="tryout-event-meta">
                  <div>
                    <dt>Date</dt>
                    <dd>{formatEventDate(tryout.eventDate)}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{tryout.location || "TBA"}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{tryout.costText || "TBA"}</dd>
                  </div>
                </dl>
                {tryout.status === "closed" && tryout.closedMessage ? (
                  <p className="tryout-event-closed">
                    {tryout.closedMessage}
                  </p>
                ) : null}
                {tryout.action ? (
                  <a
                    className="tryout-event-action"
                    href={tryout.action.href}
                    {...(tryout.action.kind === "registration"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {tryout.action.label}
                  </a>
                ) : (
                  <p className="tryout-event-unavailable">
                    Registration is currently unavailable.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="tryout-events">
          <span className="eyebrow">Tryout sessions</span>
          <h2>No sessions announced yet</h2>
          <dl className="tryouts-empty-detail-grid">
            <div>
              <dt>Date</dt>
              <dd>TBA</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>TBA</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>TBA</dd>
            </div>
          </dl>
          <p className="tryouts-empty-copy">
            Have questions before details are announced?{" "}
            <a href="/contact">Contact {club.name}</a>.
          </p>
        </section>
      )}
    </div>
  );
}
