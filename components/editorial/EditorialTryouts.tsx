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
    <div className="interior tryouts-page bg-ed-paper px-5 pb-28 pt-32 text-ed-ink md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-14">
      <header className="interior-hero grid gap-6 border-b border-[color:var(--ed-line)] pb-10">
        <span className="eyebrow">Join the club</span>
        <h1 className="max-w-[12ch] text-[clamp(3.75rem,11vw,9rem)] font-black uppercase leading-[0.82]">Join {club.name}</h1>
        <p className="tryouts-intro max-w-2xl text-xl leading-9 text-ed-muted">
          {hasTryouts ? content.introWithTryouts : content.introNoTryouts}
        </p>
        {!hasTryouts && email ? (
          <a className="tryouts-hero-cta justify-self-start border border-ed-accent bg-ed-accent px-5 py-3 font-display text-xs font-black uppercase tracking-[0.14em] text-ed-on-accent" href={`mailto:${email}`}>
            Register your interest
          </a>
        ) : null}
      </header>

      {hasTryouts ? (
        <section className="tryout-events grid gap-8">
          <span className="eyebrow">Tryout sessions</span>
          <h2 className="font-display text-5xl font-black uppercase leading-none">Upcoming opportunities</h2>
          <div className="tryout-events-list grid gap-5">
            {tryouts.map((tryout) => (
              <article className="tryout-event-card grid gap-6 border border-[color:var(--ed-line)] bg-ed-panel-glass p-6" key={tryout.id}>
                <div className="tryout-event-head flex flex-wrap items-start justify-between gap-4">
                  <h3 className="font-display text-3xl font-black uppercase leading-none">{tryout.headline || "Tryout opportunity"}</h3>
                  <span
                    className="tryout-event-status font-display text-xs font-black uppercase tracking-[0.14em] text-ed-accent"
                    data-status={tryout.status}
                  >
                    {STATUS_LABEL[tryout.status]}
                  </span>
                </div>
                <dl className="tryout-event-meta grid gap-4 md:grid-cols-3">
                  <div>
                    <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Date</dt>
                    <dd className="font-semibold">{formatEventDate(tryout.eventDate)}</dd>
                  </div>
                  <div>
                    <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Location</dt>
                    <dd className="font-semibold">{tryout.location || "TBA"}</dd>
                  </div>
                  <div>
                    <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Cost</dt>
                    <dd className="font-semibold">{tryout.costText || "TBA"}</dd>
                  </div>
                </dl>
                {tryout.status === "closed" && tryout.closedMessage ? (
                  <p className="tryout-event-closed text-ed-muted">
                    {tryout.closedMessage}
                  </p>
                ) : null}
                {tryout.action ? (
                  <a
                    className="tryout-event-action justify-self-start border border-ed-accent bg-ed-accent px-5 py-3 font-display text-xs font-black uppercase tracking-[0.14em] text-ed-on-accent"
                    href={tryout.action.href}
                    {...(tryout.action.kind === "registration"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {tryout.action.label}
                  </a>
                ) : (
                  <p className="tryout-event-unavailable text-ed-muted">
                    Registration is currently unavailable.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="tryout-events grid gap-8">
          <span className="eyebrow">Tryout sessions</span>
          <h2 className="font-display text-5xl font-black uppercase leading-none">No sessions announced yet</h2>
          <dl className="tryouts-empty-detail-grid grid gap-4 md:grid-cols-3">
            <div>
              <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Date</dt>
              <dd className="font-semibold">TBA</dd>
            </div>
            <div>
              <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Location</dt>
              <dd className="font-semibold">TBA</dd>
            </div>
            <div>
              <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Cost</dt>
              <dd className="font-semibold">TBA</dd>
            </div>
          </dl>
          <p className="tryouts-empty-copy text-ed-muted">
            Have questions before details are announced?{" "}
            <a className="text-ed-accent" href="/contact">Contact {club.name}</a>.
          </p>
        </section>
      )}
      </div>
    </div>
  );
}
