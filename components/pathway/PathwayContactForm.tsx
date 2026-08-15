"use client";

import { useId, useState, type FormEvent } from "react";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/contact-inbound";
import {
  PathwaySection,
  PathwaySectionHead,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.contact-form — the only interactive pathway@1 section
 * (MLA P1 Step 5), and therefore the only one that is a client component.
 *
 * Posts `{ firstName, lastName, email, message }` as JSON to /api/contact.
 * That route resolves the tenant exclusively from the middleware-set
 * x-onzio-club-id / x-onzio-club-slug headers, so this form deliberately
 * sends no club identifier — a club id in the body would be ignored, and
 * offering one would only invite someone to trust it later.
 *
 * The honeypot input uses CONTACT_HONEYPOT_FIELD imported from
 * lib/contact-inbound rather than a duplicated literal, so the field name
 * cannot drift from the one the server inspects. It is hidden off-screen
 * rather than with display:none (which is trivially detectable) and is
 * removed from the tab order and the accessibility tree, so real users never
 * meet it while naive form-stuffers still fill it. A tripped honeypot
 * returns the same success shape as a real send, so this component
 * intentionally cannot tell the two apart.
 *
 * Error handling distinguishes three cases the user experiences very
 * differently: a validation rejection (fixable — say so), the 503
 * "not configured" contract error (nothing the visitor can fix — offer a
 * direct route instead of surfacing a raw error code), and everything else.
 */

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export type PathwayContactFormProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  submitLabel?: string;
  successMessage?: string;
  /**
   * Address shown when the send path is not configured (the API's 503).
   * Left null until a real club inbox is supplied — Phase 1 does not invent
   * one; the fallback copy stays honest without an address.
   */
  fallbackEmail?: string | null;
};

const GENERIC_ERROR =
  "Something went wrong sending your message. Please try again in a moment.";

export default function PathwayContactForm({
  eyebrow,
  heading,
  intro,
  submitLabel = "Send message",
  successMessage = "Thanks — your message is on its way. We'll come back to you shortly.",
  fallbackEmail = null,
}: PathwayContactFormProps) {
  const fieldId = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "submitting") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      firstName: String(data.get("firstName") ?? ""),
      lastName: String(data.get("lastName") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
      [CONTACT_HONEYPOT_FIELD]: String(data.get(CONTACT_HONEYPOT_FIELD) ?? ""),
    };

    setStatus({ kind: "submitting" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        form.reset();
        setStatus({ kind: "success" });
        return;
      }

      if (response.status === 503) {
        setStatus({ kind: "unconfigured" });
        return;
      }

      if (response.status === 400) {
        setStatus({
          kind: "error",
          message:
            "Please check your details — we need a first name, last name, a valid email address and a message.",
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
    <PathwaySection className="pathway-contact-section">
      <PathwaySectionHead eyebrow={eyebrow} heading={heading} intro={intro} />
      <form className="pathway-form" onSubmit={handleSubmit}>
        <div className="pathway-form-grid">
          <div className="pathway-field">
            <label htmlFor={`${fieldId}-first`}>First name</label>
            <input
              id={`${fieldId}-first`}
              name="firstName"
              type="text"
              autoComplete="given-name"
              maxLength={100}
              required
            />
          </div>
          <div className="pathway-field">
            <label htmlFor={`${fieldId}-last`}>Last name</label>
            <input
              id={`${fieldId}-last`}
              name="lastName"
              type="text"
              autoComplete="family-name"
              maxLength={100}
              required
            />
          </div>
          <div className="pathway-field" data-span="full">
            <label htmlFor={`${fieldId}-email`}>Email</label>
            <input
              id={`${fieldId}-email`}
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </div>
          <div className="pathway-field" data-span="full">
            <label htmlFor={`${fieldId}-message`}>Message</label>
            <textarea
              id={`${fieldId}-message`}
              name="message"
              rows={6}
              maxLength={5000}
              required
            />
          </div>
        </div>

        {/* Honeypot: off-screen, untabbable, hidden from assistive tech. */}
        <div className="pathway-honeypot" aria-hidden="true">
          <input
            name={CONTACT_HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <button className="pathway-button" data-variant="primary" type="submit" disabled={submitting}>
          {submitting ? "Sending…" : submitLabel}
        </button>

        <p className="pathway-form-status" role="status" aria-live="polite" data-status={status.kind}>
          {status.kind === "success" && successMessage}
          {status.kind === "error" && status.message}
          {status.kind === "unconfigured" && (
            <>
              {fallbackEmail
                ? `Our contact inbox isn't connected yet. Please email us directly at ${fallbackEmail}.`
                : "Our contact inbox isn't connected yet, so this message couldn't be sent. Please try again later."}
            </>
          )}
        </p>
      </form>
    </PathwaySection>
  );
}
