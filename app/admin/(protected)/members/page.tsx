"use client";

import { FormEvent, useEffect, useState } from "react";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";

type AdminMember = { userId: string; email: string };

// Every contract code that `app/api/admin/members/route.ts` can return, mapped
// to a message an owner can act on. Codes must never reach the screen raw.
const MEMBERSHIP_ERROR_MESSAGES = new Map<string, string>([
  [
    "AUTHENTICATION_REQUIRED",
    "You're signed out. Sign in again, then retry this change.",
  ],
  [
    "SESSION_EXPIRED",
    "Your session expired — sign in again and retry this change.",
  ],
  [
    "MFA_REQUIRED",
    "This action needs your authenticator code. Sign in again to verify it, then retry.",
  ],
  [
    "OWNER_REQUIRED",
    "Only the club owner can add or remove administrators.",
  ],
  [
    "CLUB_ARCHIVED",
    "This club has been archived and can no longer be changed.",
  ],
  [
    "CLUB_INACTIVE",
    "This club isn't active yet, so team access can't be changed. Contact Onzio if you think this is wrong.",
  ],
  [
    "UNKNOWN_TENANT",
    "We couldn't identify this club. Refresh the page and try again.",
  ],
  [
    "INVALID_MEMBERSHIP_INPUT",
    "That email address isn't valid. Check it and try again.",
  ],
  [
    "AUTH_IDENTITY_LOOKUP_FAILED",
    "We couldn't check whether that email already has an account. Nothing changed; try again in a minute.",
  ],
  [
    "AUTH_PROVISIONING_FAILED",
    "We couldn't create an account for that email address. Check the spelling, then try again.",
  ],
  [
    "MEMBERSHIP_READ_FAILED",
    "We couldn't load this club's administrators. Nothing changed; try again in a minute.",
  ],
  [
    "OWNER_TRANSFER_OPERATOR_REQUIRED",
    "Ownership can't be changed here — contact Onzio to transfer ownership.",
  ],
  [
    "MEMBERSHIP_EXISTS",
    "This person is already an administrator of this club.",
  ],
  [
    "MEMBERSHIP_MUTATION_FAILED",
    "We couldn't save this change. Nothing was changed; try again in a minute.",
  ],
  [
    "AUTH_CODE_RATE_LIMITED",
    "A password-setup email was sent recently. Wait one minute, then try adding this administrator again.",
  ],
  [
    "AUTH_CODE_DELIVERY_FAILED",
    "We couldn't send a password-setup email. The administrator was not added; please try again.",
  ],
  [
    "MEMBERSHIP_AUDIT_FAILED",
    "We couldn't record this change, so it was undone. Try again in a minute.",
  ],
  [
    // Thrown both when the target admin is no longer on the team, and (less
    // commonly) when the signed-in owner's own membership was itself
    // revoked or never existed -- kept deliberately generic rather than
    // presuming which one happened, since the two cases share this code.
    "MEMBERSHIP_REQUIRED",
    "This didn't go through -- team membership may have changed. Refresh the page and try again; sign in again if that doesn't help.",
  ],
  [
    "MEMBERSHIP_INACTIVE",
    "This administrator has already been removed. Refresh the page to see the current list.",
  ],
  [
    "MEMBERSHIP_FAILED",
    "Something went wrong and the change didn't go through. Try again, and contact Onzio if it keeps happening.",
  ],
]);

function membershipErrorMessage(code: unknown, fallback: string) {
  if (typeof code !== "string") return fallback;
  return MEMBERSHIP_ERROR_MESSAGES.get(code) ?? fallback;
}

export default function MembersPage() {
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/members", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        membershipErrorMessage(body.error, "Unable to load administrators"),
      );
    }
    setAdmins(body.admins);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error.message));
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", email }),
    });
    const body = await response.json();
    if (!response.ok) {
      return setMessage(
        membershipErrorMessage(body.error, "Unable to add administrator"),
      );
    }
    setEmail("");
    setMessage("Administrator added. A password-setup email was sent to their inbox.");
    await load();
  }

  async function remove(userId: string) {
    setMessage(null);
    const response = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", userId }),
    });
    const body = await response.json();
    if (!response.ok) {
      return setMessage(
        membershipErrorMessage(body.error, "Unable to remove administrator"),
      );
    }
    setMessage("Administrator access removed.");
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl text-foreground">
      <h1 className="font-display text-4xl font-black uppercase">Team access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Owners can add or remove administrators. Ownership changes still require Onzio.
      </p>

      <form onSubmit={add} className="mt-8 rounded-xl border border-border bg-background p-5">
        <h2 className="font-display text-xl font-black uppercase">Add administrator</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="new-admin-email" className={ADMIN_LABEL_CLASS}>
              Email
            </label>
            <input
              id="new-admin-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="administrator@example.com"
              className={ADMIN_INPUT_CLASS}
            />
          </div>
          <button className="rounded-lg bg-brand px-5 py-3 font-display font-black uppercase text-brand-foreground">
            Send access email
          </button>
        </div>
      </form>

      <section className="mt-6 space-y-3">
        {admins.map((admin) => (
          <div key={admin.userId} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
            <span className="min-w-0 truncate text-sm">{admin.email}</span>
            <button
              type="button"
              onClick={() => void remove(admin.userId)}
              className="rounded-lg border border-destructive/30 px-3 py-2 text-xs font-bold uppercase text-destructive"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      {message && <p role="status" className="mt-5 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
