"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { INTEREST_HONEYPOT_FIELD } from "@/lib/registration-interest-inbound";

/**
 * The `/join/interest` general-interest registration form (CV United C1).
 * Styled to match its /join/academy sibling (components/
 * AcademyRegistrationForm.tsx) -- crest@1's `.crest-home` navy/gold/white
 * tokens and bordered fields, the eyebrow-club-name-then-h1-title header,
 * and the same `.crest-cta` primary submit button (styles/globals.css) --
 * so the two paths off the /join chooser read as one flow, not two.
 *
 * Posts the fields onzio.registration_responses requires as JSON to
 * /api/registrations/interest. That route resolves the tenant exclusively
 * from the middleware-set x-onzio-club-id / x-onzio-club-slug headers, so
 * this form deliberately sends no club identifier -- matching
 * components/pathway/PathwayContactForm.tsx's rationale for /api/contact.
 *
 * Renders identically whether reached through the tenant-scoped route
 * (app/%5Fclubs/[slug]/join/interest/page.tsx, which passes the club's own
 * form title/description/status) or the canonical shell
 * (app/(public)/join/interest/page.tsx, which passes none of those) -- it
 * never needs useClubContext(), so it stays safe to render even where no
 * ClubContextProvider is mounted.
 *
 * `status` mirrors AcademyRegistrationForm's preview mechanism: when the
 * tenant page's RLS-backed lookup returns a draft/closed form to a
 * signed-in club admin previewing their own site
 * (registration_forms_member_read), this renders the same preview banner
 * and disables submit -- a courtesy only. The real gate is
 * /api/registrations/interest independently re-resolving the live form
 * itself and rejecting otherwise, regardless of what this component sends.
 *
 * The honeypot input uses INTEREST_HONEYPOT_FIELD from
 * lib/registration-interest-inbound rather than a duplicated literal, so the
 * field name cannot drift from the one the server inspects. It is hidden
 * off-screen rather than with display:none (trivially detectable) and
 * removed from the tab order and the accessibility tree, so real families
 * never meet it while naive form-stuffers still fill it. A tripped honeypot
 * gets the same success response as a real submission, so this component
 * intentionally cannot tell the two apart.
 */

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "not_live" };

export type JoinInterestFormProps = {
  clubName?: string;
  title?: string;
  description?: string | null;
  formStatus?: "draft" | "live" | "closed";
};

const GENERIC_ERROR =
  "Something went wrong sending your registration. Please try again in a moment.";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function JoinInterestForm({
  clubName,
  title = "General interest / sign up",
  description = null,
  formStatus = "live",
}: JoinInterestFormProps) {
  const fieldId = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const maxDob = todayIsoDate();
  const isPreview = formStatus !== "live";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "submitting" || isPreview) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      player_first_name: String(data.get("player_first_name") ?? ""),
      player_last_name: String(data.get("player_last_name") ?? ""),
      player_dob: String(data.get("player_dob") ?? ""),
      parent_guardian_name: String(data.get("parent_guardian_name") ?? ""),
      parent_guardian_email: String(data.get("parent_guardian_email") ?? ""),
      parent_guardian_phone: String(data.get("parent_guardian_phone") ?? ""),
      interest_area: String(data.get("interest_area") ?? ""),
      notes: String(data.get("notes") ?? ""),
      [INTEREST_HONEYPOT_FIELD]: String(
        data.get(INTEREST_HONEYPOT_FIELD) ?? "",
      ),
    };

    if (payload.player_dob > maxDob) {
      setStatus({
        kind: "error",
        message: "Please enter a valid date of birth.",
      });
      return;
    }

    setStatus({ kind: "submitting" });

    try {
      const response = await fetch("/api/registrations/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        form.reset();
        setStatus({ kind: "success" });
        return;
      }

      if (response.status === 404 || response.status === 409) {
        setStatus({ kind: "not_live" });
        return;
      }

      if (response.status === 400) {
        setStatus({
          kind: "error",
          message:
            "Please check the player and parent/guardian details and try again.",
        });
        return;
      }

      setStatus({ kind: "error", message: GENERIC_ERROR });
    } catch {
      setStatus({ kind: "error", message: GENERIC_ERROR });
    }
  }

  const submitting = status.kind === "submitting";

  return (
    <main
      className="crest-home mx-auto max-w-2xl px-6 py-24 lg:px-10"
      data-presentation-template="crest@1"
    >
      <Link
        href="/join"
        className="font-body text-sm text-[var(--crest-text-secondary)] hover:text-[var(--crest-text-primary)] hover:underline"
      >
        &larr; Back to Join
      </Link>

      {isPreview && (
        <div
          className="mt-6 rounded-sm border-2 border-dashed p-4 font-body text-sm"
          style={{ borderColor: "var(--crest-status-warning)" }}
          role="status"
        >
          <p className="font-display font-bold uppercase tracking-wide">
            Draft preview — visible only to signed-in club admins
          </p>
          <p className="mt-1 text-[var(--crest-text-secondary)]">
            This form is status &quot;{formStatus}&quot;, not live. It is not
            publicly reachable and cannot be submitted until an operator
            sets it to live.
          </p>
        </div>
      )}

      {clubName ? (
        <p className="mt-6 font-body text-sm uppercase tracking-[0.2em] text-[var(--crest-text-secondary)]">
          {clubName}
        </p>
      ) : null}
      <h1 className="mt-3 font-display text-4xl font-black uppercase leading-none">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 font-body text-[var(--crest-text-secondary)]">
          {description}
        </p>
      ) : null}

      {status.kind === "success" ? (
        <p className="mt-10 font-body" role="status">
          Thanks — we&apos;ve received your information and will be in
          touch.
        </p>
      ) : (
        <form className="mt-10 space-y-8" onSubmit={handleSubmit} noValidate>
          <fieldset className="space-y-6">
            <legend className="font-display text-sm font-bold uppercase tracking-wide">
              Player
            </legend>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`${fieldId}-player-first`}
                  className="font-body text-sm font-semibold"
                >
                  First name
                </label>
                <input
                  id={`${fieldId}-player-first`}
                  name="player_first_name"
                  type="text"
                  autoComplete="given-name"
                  maxLength={80}
                  required
                  className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-player-last`}
                  className="font-body text-sm font-semibold"
                >
                  Last name
                </label>
                <input
                  id={`${fieldId}-player-last`}
                  name="player_last_name"
                  type="text"
                  autoComplete="family-name"
                  maxLength={80}
                  required
                  className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={`${fieldId}-dob`}
                className="font-body text-sm font-semibold"
              >
                Date of birth
              </label>
              <input
                id={`${fieldId}-dob`}
                name="player_dob"
                type="date"
                max={maxDob}
                required
                className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor={`${fieldId}-interest`}
                className="font-body text-sm font-semibold"
              >
                Area of interest{" "}
                <span className="font-normal text-[var(--crest-text-secondary)]">
                  (optional)
                </span>
              </label>
              <input
                id={`${fieldId}-interest`}
                name="interest_area"
                type="text"
                maxLength={120}
                placeholder="e.g. Goalkeeping, U12 team"
                className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-6">
            <legend className="font-display text-sm font-bold uppercase tracking-wide">
              Parent / guardian
            </legend>
            <div>
              <label
                htmlFor={`${fieldId}-guardian-name`}
                className="font-body text-sm font-semibold"
              >
                Name
              </label>
              <input
                id={`${fieldId}-guardian-name`}
                name="parent_guardian_name"
                type="text"
                autoComplete="name"
                maxLength={160}
                required
                className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
              />
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`${fieldId}-guardian-email`}
                  className="font-body text-sm font-semibold"
                >
                  Email
                </label>
                <input
                  id={`${fieldId}-guardian-email`}
                  name="parent_guardian_email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-guardian-phone`}
                  className="font-body text-sm font-semibold"
                >
                  Phone
                </label>
                <input
                  id={`${fieldId}-guardian-phone`}
                  name="parent_guardian_phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={40}
                  required
                  className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={`${fieldId}-notes`}
                className="font-body text-sm font-semibold"
              >
                Notes{" "}
                <span className="font-normal text-[var(--crest-text-secondary)]">
                  (optional)
                </span>
              </label>
              <textarea
                id={`${fieldId}-notes`}
                name="notes"
                rows={4}
                maxLength={2000}
                className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-canvas)] px-3 py-2 font-body focus:border-[var(--crest-action-primary)] focus:outline-none"
              />
            </div>
          </fieldset>

          {/* Honeypot: off-screen, untabbable, hidden from assistive tech. */}
          <div
            className="absolute -left-[9999px] h-px w-px overflow-hidden"
            aria-hidden="true"
          >
            <input
              name={INTEREST_HONEYPOT_FIELD}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>

          <button
            type="submit"
            disabled={submitting || isPreview}
            className="crest-cta crest-cta-primary w-full disabled:opacity-50 sm:w-auto"
          >
            {submitting
              ? "Submitting…"
              : isPreview
                ? "Not live yet"
                : "Submit"}
          </button>

          <p
            role="status"
            aria-live="polite"
            data-status={status.kind}
            className="font-body text-sm"
          >
            {status.kind === "error" && (
              <span className="text-[var(--crest-status-danger)]">
                {status.message}
              </span>
            )}
            {status.kind === "not_live" && (
              <span className="text-[var(--crest-status-danger)]">
                This sign-up isn&apos;t currently open. Please check back
                soon.
              </span>
            )}
          </p>
        </form>
      )}
    </main>
  );
}
