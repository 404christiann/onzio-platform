"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { useClubContext } from "@/components/ClubContextProvider";
import { createClient } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

type AdminMember = { userId: string; email: string };

type MessageTone = "success" | "destructive" | "warning";

type MembershipMessage = { text: string; tone: MessageTone };

/** Two-letter avatar-chip initials derived from an email's local part —
 *  admins are represented only by email, so there's no name to draw from.
 *  Mirrors the split-on-separator pattern AdminAccountMenu.tsx already uses
 *  for the account-menu chip. */
function emailInitials(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? email;
  const initials = local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || email.slice(0, 2).toUpperCase();
}

function AvatarChip({
  email,
  variant,
}: {
  email: string | null;
  variant: "owner" | "admin";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 flex-none items-center justify-center rounded-full text-xs font-semibold",
        variant === "owner"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {emailInitials(email)}
    </span>
  );
}

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
    "OWNER_REQUIRED",
    "Only the club owner can add or remove administrators.",
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
    "A sign-in code was sent recently. Wait one minute, then try adding this administrator again.",
  ],
  [
    "AUTH_CODE_DELIVERY_FAILED",
    "We couldn't send a sign-in code. The administrator was not added; please try again.",
  ],
  [
    "MEMBERSHIP_AUDIT_FAILED",
    "We couldn't record this change, so it was undone. Try again in a minute.",
  ],
  [
    "MEMBERSHIP_REQUIRED",
    "This person is no longer on this club's team. Refresh the page to see the current list.",
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

// Tone for each mapped code, chosen by what the message actually means to an
// owner acting on it:
// - "destructive": the request was rejected outright — not allowed, invalid
//   input, or the target is already in the state being requested (already an
//   admin, already removed, not a member, ownership can't move here).
// - "warning": a transient/system-side failure or rate limit where nothing
//   was changed and trying again (after re-auth, if needed) can work.
const MEMBERSHIP_MESSAGE_TONES: Record<string, MessageTone> = {
  AUTHENTICATION_REQUIRED: "warning",
  SESSION_EXPIRED: "warning",
  OWNER_REQUIRED: "destructive",
  INVALID_MEMBERSHIP_INPUT: "destructive",
  AUTH_IDENTITY_LOOKUP_FAILED: "warning",
  AUTH_PROVISIONING_FAILED: "warning",
  MEMBERSHIP_READ_FAILED: "warning",
  OWNER_TRANSFER_OPERATOR_REQUIRED: "destructive",
  MEMBERSHIP_EXISTS: "destructive",
  MEMBERSHIP_MUTATION_FAILED: "warning",
  AUTH_CODE_RATE_LIMITED: "warning",
  AUTH_CODE_DELIVERY_FAILED: "warning",
  MEMBERSHIP_AUDIT_FAILED: "warning",
  MEMBERSHIP_REQUIRED: "destructive",
  MEMBERSHIP_INACTIVE: "destructive",
  MEMBERSHIP_FAILED: "warning",
};

function membershipErrorTone(code: unknown): MessageTone {
  if (typeof code === "string") {
    const tone = MEMBERSHIP_MESSAGE_TONES[code];
    if (tone) return tone;
  }
  return "destructive";
}

export default function MembersPage() {
  const club = useClubContext();
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<MembershipMessage | null>(null);

  // This route is owner-only in the manifest (`ownerOnly: true`, which hides
  // it from nav/search) and every read/mutation goes through the API route's
  // server-side `assertClubOwnerSession`/OWNER_REQUIRED checks. The page
  // itself, though, is a client component with no role-based redirect: a
  // non-owner admin who types the URL directly still renders it — they just
  // get empty/error chrome because the API rejects them. So nothing here may
  // assume the viewer is the owner; showOwnerRow below checks club.role. The
  // owner row is derived entirely from client-side identity —
  // `club.role` from useClubContext() and the signed-in email from
  // supabase.auth.getUser() — the same pattern AdminShell.tsx already uses.
  // It adds no request to `listClubAdmins()`, which intentionally only
  // returns role="admin" memberships.
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setOwnerEmail(data.user?.email ?? null);
    });
  }, []);

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
    void load().catch((error) =>
      setMessage({ text: error.message, tone: "destructive" }),
    );
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
      return setMessage({
        text: membershipErrorMessage(body.error, "Unable to add administrator"),
        tone: membershipErrorTone(body.error),
      });
    }
    setEmail("");
    setMessage({
      text: "Administrator added. A sign-in code was sent to their email.",
      tone: "success",
    });
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
      return setMessage({
        text: membershipErrorMessage(body.error, "Unable to remove administrator"),
        tone: membershipErrorTone(body.error),
      });
    }
    setMessage({ text: "Administrator access removed.", tone: "success" });
    await load();
  }

  const showOwnerRow = club.role === "owner";
  const totalAdminCount = admins.length + (showOwnerRow ? 1 : 0);

  return (
    <AdminPage className="max-w-4xl">
      <AdminPageHeader
        title="Team access"
        description="Owners can add or remove administrators. Ownership changes still require Onzio."
      />

      <AdminPanel as="div">
      <form onSubmit={add}>
        <h2 className="text-base font-semibold text-card-foreground">Add administrator</h2>
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
          <button className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Send access code
          </button>
        </div>
      </form>
      <p className="mt-4 rounded-lg border border-border bg-background/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        Adding an administrator emails them a sign-in code. They get full
        content access to this club — everything except billing and
        ownership.
      </p>
      </AdminPanel>

      <section className="space-y-3" aria-labelledby="current-administrators-heading">
        <h2 id="current-administrators-heading" className="text-base font-semibold text-foreground">
          Current administrators · {totalAdminCount}
        </h2>
        {showOwnerRow && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarChip email={ownerEmail} variant="owner" />
              <div className="min-w-0">
                <span className="block min-w-0 truncate text-sm">
                  {ownerEmail ?? "Loading…"}
                </span>
                <span className="mt-1 inline-block text-xs font-semibold uppercase tracking-wide text-primary">
                  You · owner
                </span>
              </div>
            </div>
            <span className="flex-none whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-right text-xs text-muted-foreground">
              Contact Onzio to transfer
            </span>
          </div>
        )}
        {admins.map((admin) => (
          <div key={admin.userId} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarChip email={admin.email} variant="admin" />
              <div className="min-w-0">
                <span className="block min-w-0 truncate text-sm">{admin.email}</span>
                <span className="mt-1 inline-block text-xs text-muted-foreground">
                  Administrator
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void remove(admin.userId)}
              className="flex-none rounded-lg border border-destructive/30 px-3 py-2 text-xs font-bold uppercase text-destructive"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      {message && (
        <p
          role="status"
          className={cn(
            "mt-5 border text-sm",
            message.tone === "success" &&
              "inline-flex items-center gap-1.5 rounded-full border-success/30 bg-success/10 px-4 py-2 font-medium text-success",
            message.tone === "destructive" &&
              "rounded-lg border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive",
            message.tone === "warning" &&
              "rounded-lg border-warning/30 bg-warning/10 px-4 py-3 text-warning",
          )}
        >
          {message.tone === "success" ? `✓ ${message.text}` : message.text}
        </p>
      )}
    </AdminPage>
  );
}
