"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { TeamSkeleton } from "@/components/admin/club-settings/ClubSettingsSkeleton";
import { ClubSettingsFrame } from "@/components/admin/club-settings/ClubSettingsFrame";
import styles from "@/components/admin/club-settings/ClubSettings.module.css";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { useAnimatedList } from "@/components/admin/ui/useAnimatedList";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { SignInPeople } from "@/components/admin/reimagined/SignInPeople";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { useClubContext } from "@/components/ClubContextProvider";
import { siteFor } from "@/lib/site-for";
import { memberLabel } from "@/lib/admin-greeting";
import { cn } from "@/lib/utils";

type AdminMember = { userId: string; email: string; displayName: string | null };
type OwnerMember = AdminMember & { isYou: boolean };

type MessageTone = "success" | "destructive" | "warning";

type MembershipMessage = { text: string; tone: MessageTone };

/** Two-letter avatar-chip initials: from the saved name when there is one
 *  (ADMIN-RE-04), otherwise from the email's local part. Mirrors the
 *  split-on-separator pattern AdminAccountMenu.tsx already uses for the
 *  account-menu chip. */
function memberInitials(email: string | null, displayName?: string | null): string {
  const name = displayName?.trim();
  if (name) {
    return name.split(/\s+/).map((part) => [...part][0]).join("").slice(0, 2).toUpperCase();
  }
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
  displayName,
  variant,
}: {
  email: string | null;
  displayName?: string | null;
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
      {memberInitials(email, displayName)}
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
    "CLUB_MEMBER_REQUIRED",
    "Only people who can sign in to this club's admin can change names here.",
  ],
  [
    "INVALID_DISPLAY_NAME",
    "A name needs between 1 and 120 characters. Check it and try again.",
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
  CLUB_MEMBER_REQUIRED: "destructive",
  INVALID_DISPLAY_NAME: "destructive",
  MEMBERSHIP_FAILED: "warning",
};

function membershipErrorTone(code: unknown): MessageTone {
  if (typeof code === "string") {
    const tone = MEMBERSHIP_MESSAGE_TONES[code];
    if (tone) return tone;
  }
  return "destructive";
}

// ADMIN-RE-18: a club on the reimagined admin gets "Who can sign in" (design:
// cd-signin-final), which talks to the same members route. A club still on the
// classic admin uses the shared Club settings frame below.
export default function MembersPage() {
  const reimagined = useAdminPortal().portal === "reimagined";
  return reimagined ? <SignInPeople /> : <ClassicMembersPage />;
}

function ClassicMembersPage() {
  const club = useClubContext();
  const isOwner = club.role === "owner";
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [owners, setOwners] = useState<OwnerMember[]>([]);
  const [email, setEmail] = useState("");
  const currentEmail = useRef("");
  const [message, setMessage] = useState<MembershipMessage | null>(null);
  const [loading, setLoading] = useState(isOwner);
  const [loadFailed, setLoadFailed] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [pending, setPending] = useState<"add" | "remove" | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [removing, setRemoving] = useState<AdminMember | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const newest = useRef<string | null>(null);
  const [reads] = useState(() => ({ version: 0 }));
  const opener = useRef<HTMLButtonElement | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const list = useAnimatedList();

  const load = useCallback(async () => {
    if (!isOwner) return;
    const version = ++reads.version;
    const response = await fetch("/api/admin/members", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(membershipErrorMessage(body.error, "Unable to load administrators."));
    if (!mounted.current || version !== reads.version) return;
    const members = body.admins as AdminMember[];
    setAdmins([...members].sort((a, b) => Number(b.userId === newest.current) - Number(a.userId === newest.current)));
    setOwners(Array.isArray(body.owners) ? body.owners : []);
    setLoadFailed(false);
  }, [isOwner, reads]);

  useEffect(() => {
    mounted.current = true;
    if (isOwner) {
      setLoading(true);
      void load().catch((error: unknown) => {
        if (!mounted.current) return;
        setLoadFailed(true);
        setMessage({ text: error instanceof Error ? error.message : "Unable to load administrators.", tone: "destructive" });
      }).finally(() => { if (mounted.current) setLoading(false); });
    }
    return () => { mounted.current = false; reads.version++; };
  }, [isOwner, load, reads]);

  async function refresh() {
    if (busy.current || loading) return;
    setLoading(true);
    try { await load(); setMessage(null); }
    catch (error) {
      setLoadFailed(true);
      setMessage({ text: error instanceof Error ? error.message : "Unable to refresh administrators.", tone: "warning" });
    } finally { if (mounted.current) setLoading(false); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!isOwner || busy.current || loading || loadFailed || uncertain) return;
    const submitted = currentEmail.current.trim().toLowerCase();
    busy.current = true;
    reads.version++;
    setPending("add");
    setEmailInvalid(false);
    setMessage(null);
    let acknowledged = false;
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", email: submitted }),
      });
      const body = await response.json();
      if (!response.ok) {
        setEmailInvalid(body.error === "INVALID_MEMBERSHIP_INPUT");
        setMessage({ text: membershipErrorMessage(body.error, "Unable to add administrator."), tone: membershipErrorTone(body.error) });
        return;
      }
      if (typeof body.userId !== "string" || body.codeSent !== true) throw new Error("The server response could not be confirmed.");
      acknowledged = true;
      newest.current = body.userId;
      if (currentEmail.current.trim().toLowerCase() === submitted) {
        currentEmail.current = "";
        setEmail("");
      }
      list.change({ type: "add", key: body.userId }, () => {
        setAdmins((current) => [{ userId: body.userId, email: body.email ?? submitted, displayName: null }, ...current.filter((member) => member.userId !== body.userId)]);
      });
      setMessage({ text: "Administrator added. A sign-in code was sent to their email.", tone: "success" });
      try { await load(); }
      catch {
        setLoadFailed(true);
        setMessage({ text: "Administrator added and a sign-in code was sent. The list could not be refreshed. Refresh the list before making another change.", tone: "warning" });
      }
    } catch {
      if (!acknowledged) {
        setUncertain(true);
        setMessage({ text: "We could not confirm whether the administrator was added or a code was sent. Reload to review access before trying again.", tone: "warning" });
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  }

  async function remove() {
    const member = removing;
    if (!isOwner || !member || busy.current || uncertain || loading || loadFailed) return;
    busy.current = true;
    reads.version++;
    setPending("remove");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", userId: member.userId }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ text: membershipErrorMessage(body.error, "Unable to remove administrator."), tone: membershipErrorTone(body.error) });
        return;
      }
      if (body.userId !== member.userId || body.status !== "removed") throw new Error("The server response could not be confirmed.");
      const mutate = () => setAdmins((current) => current.filter((item) => item.userId !== member.userId));
      if (!list.change({ type: "remove", key: member.userId }, mutate)) mutate();
      setRemoving(null);
      setMessage({ text: "Administrator access removed.", tone: "success" });
      try { await load(); }
      catch {
        setLoadFailed(true);
        setMessage({ text: "Administrator access removed. The list could not be refreshed. Refresh the list before making another change.", tone: "warning" });
      }
    } catch {
      setUncertain(true);
      setMessage({ text: "We could not confirm whether access was removed. Reload to review access before trying again.", tone: "warning" });
      setRemoving(null);
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  }

  const disabled = loading || loadFailed || pending !== null || uncertain;
  // A club whose site package supplies its own Club settings frame uses it; the team logic below is the same for every club.
  const SiteFrame = siteFor(club)?.adminEditors?.clubSettingsFrame;
  const body = (
    <>
      {!isOwner ? (
        <section className={cn("ph-no-capture", styles.card)} aria-labelledby="team-access-heading">
          <h2 id="team-access-heading">Team access</h2>
          <p className={styles.notice}>Only owners can view and manage this club’s administrators. Contact your club owner for access changes.</p>
        </section>
      ) : (
        <section className={cn("ph-no-capture", styles.card)} aria-labelledby="team-access-heading" aria-busy={loading || undefined}>
          <h2 id="team-access-heading">Team access</h2>
          <p className={styles.description}>Owners can add or remove administrators. Ownership changes still require Onzio.</p>
          <ShimmerRegion loading={loading} quietRefresh={owners.length + admins.length > 0} skeleton={<TeamSkeleton />} minHeight={240} loadingLabel="Loading team access">
          <form className={styles.addRow} onSubmit={add}>
            <div className={styles.field}>
              <label htmlFor="new-admin-email" className={ADMIN_LABEL_CLASS}>Administrator email</label>
              <input ref={addInput} id="new-admin-email" type="email" required autoComplete="off" value={email}
                onChange={(event) => { currentEmail.current = event.target.value; setEmail(event.target.value); setEmailInvalid(false); }}
                placeholder="administrator@example.com" className={ADMIN_INPUT_CLASS} aria-describedby={emailInvalid ? "administrator-hint team-message" : "administrator-hint"} aria-invalid={emailInvalid || undefined} />
            </div>
            <AdminPendingButton type="submit" label="Add administrator" pendingLabel="Sending code…" pending={pending === "add"}
              disabled={disabled && pending !== "add"} className={styles.addButton} />
          </form>
          <p id="administrator-hint" className={styles.hint}>They get a sign-in code by email. Administrators can edit the website, not billing or ownership.</p>
          {!loading && <h3 className={styles.count}>People who can sign in · {owners.length + admins.length}</h3>}
          <div ref={list.listRef} tabIndex={-1} aria-label="People who can sign in">
            {owners.map((owner) => (
              <div key={owner.userId} className={styles.row} {...list.rowProps(owner.userId)}>
                <AvatarChip email={owner.email} displayName={owner.displayName} variant="owner" />
                <div className={styles.identity}>
                  <b>{memberLabel(owner.displayName, owner.email)}</b>
                  {owner.displayName && <span>{owner.email}</span>}
                  {owner.isYou ? <span>You · owner</span> : <span className={styles.mobileRole}>Owner</span>}
                </div>
                <span className={`${styles.role} ${styles.owner}`}>Owner</span><span />
              </div>
            ))}
            {admins.map((member) => (
              <div key={member.userId} className={styles.row} {...list.rowProps(member.userId)}>
                <AvatarChip email={member.email} displayName={member.displayName} variant="admin" />
                <div className={styles.identity}>
                  <b>{memberLabel(member.displayName, member.email)}</b>
                  {member.displayName && <span>{member.email}</span>}
                  <span className={styles.mobileRole}>Administrator</span>
                </div>
                <span className={styles.role}>Administrator</span>
                <button type="button" className={`${styles.action} ${styles.remove}`} disabled={disabled}
                  onClick={(event) => { opener.current = event.currentTarget; setMessage(null); setRemoving(member); }}>Remove</button>
              </div>
            ))}
          </div>
          {!loading && !loadFailed && !admins.length && <p className={styles.hint}>No administrators yet. Add someone above to give them access.</p>}
          {message && <p id="team-message" className={cn(styles.notice, message.tone === "destructive" && styles.error)} role="status">{message.text}</p>}
          {loadFailed && !uncertain && <button type="button" className={styles.action} disabled={pending !== null || loading} onClick={() => void refresh()}>Refresh list</button>}
          {uncertain && <button type="button" className={styles.action} onClick={() => window.location.reload()}>Reload to review access</button>}
          </ShimmerRegion>
          <p className={styles.notice}>Ownership can’t be changed here — contact Onzio to transfer ownership.</p>
        </section>
      )}
      <AdminConfirmDialog open={removing !== null} title={`Remove ${removing ? memberLabel(removing.displayName, removing.email) : "administrator"}’s access?`}
        confirmLabel={pending === "remove" ? "Removing…" : "Remove access"} destructive busy={pending === "remove"}
        onCancel={() => { if (!busy.current) setRemoving(null); }} onConfirm={() => { void remove(); }}
        finalFocus={() => opener.current?.isConnected ? opener.current : addInput.current}>
        <p className="ph-no-capture">{removing?.email} will be signed out and can’t sign in until you add them again.</p>
        {message && pending !== "remove" && <p role="alert" className={styles.error}>{message.text}</p>}
      </AdminConfirmDialog>
    </>
  );
  return SiteFrame
    ? <SiteFrame active="team">{body}</SiteFrame>
    : <ClubSettingsFrame active="team">{body}</ClubSettingsFrame>;
}
