"use client";

import { useId, useMemo, useState, type FormEvent } from "react";

/**
 * CV United C1: crest@1's `/join/academy` form.
 *
 * Rendered only when app/_clubs/[slug]/join/academy/page.tsx's RLS-backed
 * lookup actually returned a registration_forms row for this club -- either
 * because it is genuinely `status = 'live'`, or because the viewer is an
 * authenticated club owner/admin previewing a draft/closed form
 * (registration_forms_member_read). `form.status` tells this component
 * which case it is in; a non-live status renders the same fields with an
 * operator-only preview banner and a disabled submit button, so a real
 * visitor can never reach this state and an operator can still read every
 * field before it's real.
 *
 * The actual `status === 'live'` gate is NOT this component's job to
 * enforce -- app/api/registrations/academy/route.ts independently
 * re-resolves the live form itself and hard-rejects otherwise, regardless
 * of what this component renders or sends. Disabling submit here is a
 * courtesy for the operator, not a security boundary.
 */

export type AcademyRegistrationFormData = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "live" | "closed";
  requiresPayment: boolean;
  priceCents: number | null;
  currency: string | null;
  waiverText: string | null;
  waiverVersion: number | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const GENERIC_ERROR =
  "Something went wrong submitting your registration. Please try again in a moment.";

function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents === null || !currency) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function AcademyRegistrationForm({
  clubName,
  form,
}: {
  clubName: string;
  form: AcademyRegistrationFormData;
}) {
  const fieldId = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [playerFirstName, setPlayerFirstName] = useState("");
  const [playerLastName, setPlayerLastName] = useState("");
  const [waiverChecked, setWaiverChecked] = useState(false);

  const isPreview = form.status !== "live";
  const submitting = status.kind === "submitting";
  const price = formatPrice(form.priceCents, form.currency);

  const playerLabel = useMemo(() => {
    const name = `${playerFirstName.trim()} ${playerLastName.trim()}`.trim();
    return name || "the player named above";
  }, [playerFirstName, playerLastName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || isPreview) return;

    const data = new FormData(event.currentTarget);
    const payload = {
      playerFirstName: String(data.get("playerFirstName") ?? ""),
      playerLastName: String(data.get("playerLastName") ?? ""),
      playerDob: String(data.get("playerDob") ?? ""),
      parentGuardianName: String(data.get("parentGuardianName") ?? ""),
      parentGuardianEmail: String(data.get("parentGuardianEmail") ?? ""),
      parentGuardianPhone: String(data.get("parentGuardianPhone") ?? ""),
      notes: String(data.get("notes") ?? ""),
      waiverAccepted: waiverChecked,
    };

    setStatus({ kind: "submitting" });

    try {
      const response = await fetch("/api/registrations/academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { checkoutUrl?: string | null; error?: { code?: string; message?: string } }
        | null;

      if (response.ok && body?.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      if (response.ok) {
        // No payment required for this form: the registration is fully
        // submitted with nothing to check out for.
        setStatus({ kind: "success" });
        return;
      }

      if (response.status === 400) {
        setStatus({
          kind: "error",
          message:
            "Please check the form -- every field is required except notes, and the waiver box must be checked.",
        });
        return;
      }
      if (response.status === 404 || response.status === 409) {
        setStatus({
          kind: "error",
          message:
            body?.error?.message ??
            "This club is not currently accepting academy registrations.",
        });
        return;
      }
      setStatus({
        kind: "error",
        message: body?.error?.message ?? GENERIC_ERROR,
      });
    } catch {
      setStatus({ kind: "error", message: GENERIC_ERROR });
    }
  }

  return (
    <main
      className="crest-home mx-auto max-w-2xl px-6 py-24 lg:px-10"
      data-presentation-template="crest@1"
    >
      {isPreview && (
        <div
          className="mb-8 rounded border-2 border-dashed p-4 font-body text-sm"
          style={{ borderColor: "var(--crest-status-warning)" }}
          role="status"
        >
          <p className="font-display font-bold uppercase tracking-wide">
            Draft preview -- visible only to signed-in club admins
          </p>
          <p className="mt-1 text-[var(--crest-text-secondary)]">
            This form is status &quot;{form.status}&quot;, not live. It is
            not publicly reachable and cannot be submitted until an operator
            sets it to live.
          </p>
        </div>
      )}

      <p className="font-body text-sm uppercase tracking-[0.2em] text-[var(--crest-text-secondary)]">
        {clubName}
      </p>
      <h1 className="mt-3 font-display text-4xl font-black uppercase leading-none">
        {form.title}
      </h1>
      {form.description && (
        <p className="mt-4 font-body text-[var(--crest-text-secondary)]">
          {form.description}
        </p>
      )}
      {form.requiresPayment && price && (
        <p className="mt-4 font-body font-semibold">Registration fee: {price}</p>
      )}

      {status.kind === "success" ? (
        <p className="mt-10 font-body" role="status">
          Thanks — {playerLabel}&apos;s registration has been submitted. The
          club has your details and will be in touch.
        </p>
      ) : (
      <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-first`}>
              Player first name
            </label>
            <input
              id={`${fieldId}-first`}
              name="playerFirstName"
              type="text"
              autoComplete="given-name"
              maxLength={80}
              required
              value={playerFirstName}
              onChange={(event) => setPlayerFirstName(event.target.value)}
              className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
            />
          </div>
          <div>
            <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-last`}>
              Player last name
            </label>
            <input
              id={`${fieldId}-last`}
              name="playerLastName"
              type="text"
              autoComplete="family-name"
              maxLength={80}
              required
              value={playerLastName}
              onChange={(event) => setPlayerLastName(event.target.value)}
              className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
            />
          </div>
        </div>

        <div>
          <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-dob`}>
            Player date of birth
          </label>
          <input
            id={`${fieldId}-dob`}
            name="playerDob"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
          />
        </div>

        <div>
          <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-guardian`}>
            Parent/guardian full name
          </label>
          <input
            id={`${fieldId}-guardian`}
            name="parentGuardianName"
            type="text"
            autoComplete="name"
            maxLength={160}
            required
            className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-email`}>
              Parent/guardian email
            </label>
            <input
              id={`${fieldId}-email`}
              name="parentGuardianEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
            />
          </div>
          <div>
            <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-phone`}>
              Parent/guardian phone
            </label>
            <input
              id={`${fieldId}-phone`}
              name="parentGuardianPhone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              maxLength={40}
              required
              className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
            />
          </div>
        </div>

        <div>
          <label className="font-body text-sm font-semibold" htmlFor={`${fieldId}-notes`}>
            Notes <span className="font-normal text-[var(--crest-text-secondary)]">(optional)</span>
          </label>
          <textarea
            id={`${fieldId}-notes`}
            name="notes"
            rows={4}
            maxLength={2000}
            className="mt-1 w-full rounded-sm border border-[var(--crest-border-subtle)] px-3 py-2 font-body"
          />
        </div>

        <div className="rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-elevated)] p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide">
            Waiver &amp; consent
          </h2>
          <div className="mt-2 max-h-48 overflow-y-auto font-body text-sm text-[var(--crest-text-secondary)]">
            {form.waiverText ? (
              <p className="whitespace-pre-wrap">{form.waiverText}</p>
            ) : (
              <p className="font-semibold text-[var(--crest-status-danger)]">
                [Waiver text pending — do not treat as final]
              </p>
            )}
          </div>
          <label className="mt-4 flex items-start gap-2 font-body text-sm">
            <input
              type="checkbox"
              required
              checked={waiverChecked}
              onChange={(event) => setWaiverChecked(event.target.checked)}
              className="mt-1"
            />
            <span>
              I have read and agree to the above on behalf of{" "}
              <strong>{playerLabel}</strong>.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || isPreview}
          className="crest-cta crest-cta-primary w-full disabled:opacity-50"
        >
          {submitting
            ? "Submitting…"
            : isPreview
              ? "Not live yet"
              : form.requiresPayment
                ? "Continue to payment"
                : "Submit registration"}
        </button>

        <p role="status" aria-live="polite" className="font-body text-sm" data-status={status.kind}>
          {status.kind === "error" && (
            <span className="text-[var(--crest-status-danger)]">{status.message}</span>
          )}
        </p>
      </form>
      )}
    </main>
  );
}
