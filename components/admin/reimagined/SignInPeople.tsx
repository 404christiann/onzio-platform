"use client";

import { Menu } from "@base-ui/react/menu";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import {
  IconAdd,
  IconCheck,
  IconClock,
  IconClose,
  IconDelete,
  IconLock,
  IconMail,
  IconMore,
} from "@/components/admin/icons";
import { useClubContext } from "@/components/ClubContextProvider";
import { DISPLAY_NAME_MAX_LENGTH, memberLabel } from "@/lib/admin-greeting";
import {
  addSomeoneProblems,
  avatarLetters,
  firstNameOf,
  lastSignInLabel,
  middleEmail,
  signInMessage,
  type SignInAction,
  type SignInPerson,
} from "@/lib/admin-sign-in-view";
import styles from "./sign-in.module.css";

// ADMIN-RE-18 (screen): "Who can sign in" (design: cd-signin-final; decisions
// 0010 and 0013) for clubs on the reimagined admin. Every owner is listed;
// helpers need a name; each row says when the person last signed in or that they
// have not yet; "Send the code again" and Remove (with Undo) are owner-only. All
// of it goes through the members route that PR #101 built, which checks the
// owner, the club and the session itself; this file holds no Supabase client.
// "Send the code again" and "Send sign-in code" send a real email.

type Owner = SignInPerson & { isYou: boolean };
type Loaded = { owners: Owner[]; admins: SignInPerson[] };
type Load = { status: "loading" } | { status: "error"; text: string } | ({ status: "ready" } & Loaded);

type Toast = {
  id: number;
  text: string;
  /** Remove's Undo, until the server's undo window ends. */
  undo?: { userId: string; label: string };
};
type Notice = { text: string; tone: "warning" | "destructive" };
type DialogState = { mode: "add" } | { mode: "name"; person: SignInPerson };
type CallResult = { ok: true; body: Record<string, unknown> } | { ok: false; code: string | undefined };

/** One code a minute is all Supabase Auth allows; a row says "Code sent" for that long. */
const CODE_COOLDOWN_MS = 60_000;
const SENT_TOAST_MS = 6_000;
/** Undo answers a retry cannot change. */
const FINAL_UNDO_CODES = new Set([
  "MEMBERSHIP_UNDO_UNAVAILABLE",
  "MEMBERSHIP_EXISTS",
  "MEMBERSHIP_REQUIRED",
  "MEMBERSHIP_INACTIVE",
  "OWNER_REQUIRED",
  "OWNER_TRANSFER_OPERATOR_REQUIRED",
]);
const NAME_TOAST_MS = 4_000;

async function read(response: Response): Promise<CallResult> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return { ok: false, code: typeof body.error === "string" ? body.error : undefined };
  return { ok: true, body };
}

async function getMembers(): Promise<CallResult> {
  try {
    return await read(await fetch("/api/admin/members", { cache: "no-store" }));
  } catch {
    return { ok: false, code: undefined };
  }
}

async function postMembers(body: Record<string, unknown>): Promise<CallResult> {
  try {
    return await read(
      await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return { ok: false, code: undefined };
  }
}

function asPerson(value: unknown): SignInPerson | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.userId !== "string" || typeof row.email !== "string") return null;
  return {
    userId: row.userId,
    email: row.email,
    displayName: typeof row.displayName === "string" ? row.displayName : null,
    lastSignInAt: typeof row.lastSignInAt === "string" ? row.lastSignInAt : null,
  };
}

function parseLoaded(body: Record<string, unknown>): Loaded {
  const people = (value: unknown) =>
    (Array.isArray(value) ? value : []).map(asPerson).filter((person): person is SignInPerson => person !== null);
  const rawOwners = Array.isArray(body.owners) ? (body.owners as Array<Record<string, unknown>>) : [];
  const owners = people(rawOwners).map((person, index) => ({ ...person, isYou: rawOwners[index]?.isYou === true }));
  // You first, then the other owners in the order the server sent them.
  owners.sort((a, b) => Number(b.isYou) - Number(a.isYou));
  return { owners, admins: people(body.admins) };
}

function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function useAdminPortalContainer(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".admin-portal"));
  }, []);
  return container;
}

function Avatar({ person, owner }: { person: SignInPerson; owner?: boolean }) {
  return (
    <span
      className={styles.avatar}
      data-owner={owner || undefined}
      style={{ ["--avatar-hue" as string]: hueOf(person.userId) }}
      aria-hidden="true"
    >
      {avatarLetters(person.displayName, person.email)}
    </span>
  );
}

/** The person's name (or, with none, their email) and, under it, their email. */
function Who({
  person,
  tag,
  onAddName,
}: {
  person: SignInPerson;
  tag?: string;
  onAddName: (person: SignInPerson) => void;
}) {
  const hasName = Boolean(person.displayName?.trim());
  return (
    <span className={styles.who}>
      <span className={styles.nameLine}>
        {hasName ? (
          <span className={styles.name} title={person.displayName ?? undefined} data-testid="sign-in-name">
            {memberLabel(person.displayName, person.email)}
          </span>
        ) : (
          <button
            type="button"
            className={styles.addName}
            onClick={() => onAddName(person)}
            aria-label={`Add a name for ${person.email}`}
          >
            Add a name
          </button>
        )}
        {tag ? (
          <span className={styles.tag}>
            <IconLock className="size-3" aria-hidden="true" />
            {tag}
          </span>
        ) : null}
      </span>
      <span className={styles.mail} title={person.email} data-testid="sign-in-email">
        {middleEmail(person.email, 44)}
      </span>
    </span>
  );
}

function OwnerRow({
  owner,
  onAddName,
}: {
  owner: Owner;
  onAddName: (person: SignInPerson) => void;
}) {
  return (
    <li className={styles.row} data-kind="owner" data-testid="sign-in-row" data-person-id={owner.userId}>
      <Avatar person={owner} owner />
      <Who person={owner} tag={owner.isYou ? "You · owner" : "Owner"} onAddName={onAddName} />
      <span className={styles.state}>
        <span className={styles.quiet}>Only Onzio can change the owner</span>
      </span>
      <span className={styles.moreSlot} aria-hidden="true" />
    </li>
  );
}

function HelperRow({
  person,
  timeZone,
  portal,
  busy,
  codeSent,
  onAddName,
  onResend,
  onRemove,
}: {
  person: SignInPerson;
  timeZone: string;
  portal: HTMLElement | null;
  busy: boolean;
  codeSent: boolean;
  onAddName: (person: SignInPerson) => void;
  onResend: (person: SignInPerson) => void;
  onRemove: (person: SignInPerson) => void;
}) {
  const never = person.lastSignInAt === null;
  const label = memberLabel(person.displayName, person.email);
  return (
    <li
      className={styles.row}
      data-kind="helper"
      data-testid="sign-in-row"
      data-person-id={person.userId}
      aria-busy={busy || undefined}
    >
      <Avatar person={person} />
      <Who person={person} onAddName={onAddName} />
      <span className={styles.state} data-testid="sign-in-status">
        {codeSent ? (
          <span className={styles.sent}>
            <IconMail className="size-3.5" aria-hidden="true" />
            {never ? "Code sent · hasn’t signed in yet" : "Code sent"}
          </span>
        ) : never ? (
          <>
            <span className={styles.waiting}>
              <IconClock className="size-3.5" aria-hidden="true" />
              Hasn’t signed in yet
            </span>
            <button
              type="button"
              className={styles.link}
              disabled={busy}
              onClick={() => onResend(person)}
              data-testid="sign-in-resend"
              aria-label={`Send the code again to ${label}`}
            >
              {busy ? "Sending…" : "Send the code again"}
            </button>
          </>
        ) : (
          <span className={styles.seen}>
            <IconCheck className="size-3.5" aria-hidden="true" />
            {lastSignInLabel(person.lastSignInAt, timeZone)}
          </span>
        )}
      </span>
      <Menu.Root>
        <Menu.Trigger
          className={styles.more}
          aria-label={`More for ${label}`}
          disabled={busy}
          data-testid="sign-in-menu"
        >
          <IconMore className="size-5" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal container={portal}>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className={styles.menuPositioner}>
            <Menu.Popup className={styles.menu}>
              <Menu.Item
                className={styles.menuItem}
                disabled={codeSent}
                onClick={() => onResend(person)}
                data-testid="sign-in-menu-resend"
              >
                <IconMail className="size-[18px]" aria-hidden="true" />
                Send the code again
              </Menu.Item>
              <Menu.Item
                className={styles.menuItem}
                data-tone="danger"
                onClick={() => onRemove(person)}
                data-testid="sign-in-menu-remove"
              >
                <IconDelete className="size-[18px]" aria-hidden="true" />
                Remove access
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </li>
  );
}

const NAME_PROBLEM_TEXT = {
  missing: null,
  noLetter: "A name needs a letter or number.",
  tooLong: `A name can be up to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
} as const;

const EMAIL_PROBLEM_TEXT = {
  missing: null,
  invalid: "That doesn’t look like an email address.",
  tooLong: "That email address is too long.",
  already: "That person can already sign in.",
} as const;

function limitName(value: string): string {
  const characters = [...value];
  return characters.length > DISPLAY_NAME_MAX_LENGTH ? characters.slice(0, DISPLAY_NAME_MAX_LENGTH).join("") : value;
}

type DialogResult = { ok: true } | { ok: false; text: string };

/** Add someone (name and email), or Add a name for a person who has none. */
function DialogForm({
  state,
  people,
  onCancel,
  onSubmit,
}: {
  state: DialogState;
  people: SignInPerson[];
  onCancel: () => void;
  onSubmit: (values: { name: string; email: string }) => Promise<DialogResult>;
}) {
  const adding = state.mode === "add";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState({ name: false, email: false });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const nameHint = useId();
  const noteId = useId();

  const problems = addSomeoneProblems(
    { name, email: adding ? email : "person@example.com" },
    adding ? people : [],
  );
  const ready = !problems.name && (!adding || !problems.email) && name.trim() !== "" && (!adding || email.trim() !== "");
  const count = [...name].length;
  const nameText = problems.name ? NAME_PROBLEM_TEXT[problems.name] : null;
  const emailText = problems.email ? EMAIL_PROBLEM_TEXT[problems.email] : null;
  // "Already" shows at once; the rest wait until the field has been left.
  const showEmailText = emailText && (touched.email || problems.email === "already");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await onSubmit({ name, email });
    if (!result.ok) {
      setProblem(result.text);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 id="sign-in-dialog-title" className={styles.dialogTitle}>
        {adding ? "Add someone" : "Add a name"}
      </h2>
      {!adding ? (
        <p className={styles.dialogSub} title={state.person.email}>
          {middleEmail(state.person.email, 44)}
        </p>
      ) : null}
      <div className={styles.fields}>
        <div className={styles.field} data-error={nameText && touched.name ? "" : undefined}>
          <label htmlFor={nameId} className={styles.fieldLabel}>
            {adding ? "Their name" : "Name"}
          </label>
          <input
            id={nameId}
            className={styles.input}
            value={name}
            placeholder="Full name"
            autoComplete="off"
            data-1p-ignore=""
            aria-invalid={nameText && touched.name ? true : undefined}
            aria-describedby={nameHint}
            onChange={(event) => setName(limitName(event.target.value))}
            onBlur={() => setTouched((current) => ({ ...current, name: true }))}
          />
          <div className={styles.fieldMeta}>
            <span id={nameHint} className={styles.fieldHint}>
              {nameText && touched.name ? nameText : ""}
            </span>
            {count >= 100 ? (
              <span className={styles.counter} aria-hidden="true">
                {count} / {DISPLAY_NAME_MAX_LENGTH}
              </span>
            ) : null}
          </div>
        </div>
        {adding ? (
          <div className={styles.field} data-error={showEmailText ? "" : undefined}>
            <label htmlFor={emailId} className={styles.fieldLabel}>
              Their email
            </label>
            <input
              id={emailId}
              className={styles.input}
              type="email"
              inputMode="email"
              value={email}
              placeholder="name@email.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              aria-invalid={showEmailText ? true : undefined}
              aria-describedby={`${emailId}-hint`}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, email: true }))}
            />
            <div className={styles.fieldMeta}>
              <span id={`${emailId}-hint`} className={styles.fieldHint}>
                {showEmailText ? emailText : ""}
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {adding ? (
        <p id={noteId} className={styles.dialogNote}>
          We’ll email them a sign-in code. They can’t see payments.
        </p>
      ) : null}
      {problem ? (
        <p className={styles.dialogProblem} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={styles.go} disabled={!ready || busy} data-testid="sign-in-submit">
          {adding ? (busy ? "Sending…" : "Send sign-in code") : busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </form>
  );
}

function Dialog({
  state,
  people,
  onClose,
  onSubmit,
}: {
  state: DialogState | null;
  people: SignInPerson[];
  onClose: () => void;
  onSubmit: (state: DialogState, values: { name: string; email: string }) => Promise<DialogResult>;
}) {
  return (
    <AdminModal
      open={state !== null}
      onClose={onClose}
      aria-labelledby="sign-in-dialog-title"
      backdropClassName={styles.scrim}
      className={styles.dialog}
    >
      {state ? (
        <DialogForm
          state={state}
          people={people}
          onCancel={onClose}
          onSubmit={(values) => onSubmit(state, values)}
        />
      ) : null}
    </AdminModal>
  );
}

function HelpBox() {
  return (
    <div className={styles.help} data-testid="sign-in-help">
      <p className={styles.helpLine}>
        <span className={styles.helpIcon} data-tone="yes" aria-hidden="true">
          <IconCheck className="size-3.5" />
        </span>
        <span>
          <strong>Helpers can:</strong> enter scores, add games, edit the website, see registrations
        </span>
      </p>
      <p className={styles.helpLine}>
        <span className={styles.helpIcon} aria-hidden="true">
          <IconLock className="size-3.5" />
        </span>
        <span>
          <strong>Helpers can’t:</strong> see payments or change who can sign in
        </span>
      </p>
    </div>
  );
}

export function SignInPeople() {
  const club = useClubContext();
  const { timeZone } = useAdminPortal();
  const isOwner = club.role === "owner";
  const portal = useAdminPortalContainer();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [sentAt, setSentAt] = useState<Set<string>>(() => new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextToast = useRef(1);
  const mounted = useRef(true);
  // A second click before the screen has re-rendered must not send a second request.
  const inFlight = useRef(new Set<string>());

  function begin(userId: string): boolean {
    if (inFlight.current.has(userId)) return false;
    inFlight.current.add(userId);
    return true;
  }

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const later = useCallback((run: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (mounted.current) run();
    }, Math.max(0, Math.min(ms, 2_000_000_000)));
    timers.current.add(timer);
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await getMembers();
    if (!mounted.current) return false;
    if (!result.ok) {
      setLoad((current) =>
        current.status === "ready" ? current : { status: "error", text: signInMessage(result.code, "load", "").text },
      );
      return false;
    }
    setLoad({ status: "ready", ...parseLoaded(result.body) });
    return true;
  }, []);

  useEffect(() => {
    if (isOwner) void refresh();
  }, [isOwner, refresh]);

  const people = useMemo(
    () => (load.status === "ready" ? [...load.owners, ...load.admins] : []),
    [load],
  );

  function say(text: string, undo?: Toast["undo"], ms?: number) {
    const id = nextToast.current++;
    // An Undo toast is never pushed out by a newer one while the server's window
    // is open; of the plain ones only the latest stays.
    setToasts((current) => {
      const plain = current.filter((toast) => !toast.undo);
      const older = plain.slice(0, Math.max(0, plain.length - 1));
      return [...current.filter((toast) => toast.undo || !older.includes(toast)), { id, text, undo }];
    });
    if (ms !== undefined) later(() => dismiss(id), ms);
    return id;
  }

  function dismiss(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function mark(set: "busy" | "sent", userId: string, on: boolean) {
    const update = (current: Set<string>) => {
      const next = new Set(current);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    };
    if (set === "busy") setBusy(update);
    else setSentAt(update);
  }

  function codeWasSent(userId: string) {
    mark("sent", userId, true);
    later(() => mark("sent", userId, false), CODE_COOLDOWN_MS);
  }

  function fail(code: string | undefined, action: SignInAction, who: string) {
    const { text, tone } = signInMessage(code, action, who);
    setNotice({ text, tone });
  }

  async function resend(person: SignInPerson) {
    if (sentAt.has(person.userId) || !begin(person.userId)) return;
    setNotice(null);
    mark("busy", person.userId, true);
    const result = await postMembers({ action: "resend-code", userId: person.userId });
    inFlight.current.delete(person.userId);
    if (!mounted.current) return;
    mark("busy", person.userId, false);
    if (!result.ok) return fail(result.code, "resend", firstNameOf(person.displayName, person.email));
    codeWasSent(person.userId);
    say(`Code sent to ${middleEmail(person.email, 34)}`, undefined, SENT_TOAST_MS);
  }

  async function remove(person: SignInPerson) {
    if (!begin(person.userId)) return;
    setNotice(null);
    mark("busy", person.userId, true);
    const result = await postMembers({ action: "remove", userId: person.userId });
    inFlight.current.delete(person.userId);
    if (!mounted.current) return;
    mark("busy", person.userId, false);
    const who = firstNameOf(person.displayName, person.email);
    if (!result.ok) return fail(result.code, "remove", who);
    setLoad((current) =>
      current.status === "ready"
        ? { ...current, admins: current.admins.filter((admin) => admin.userId !== person.userId) }
        : current,
    );
    const until = typeof result.body.undoUntil === "string" ? Date.parse(result.body.undoUntil) : NaN;
    const left = Number.isNaN(until) ? 0 : until - Date.now();
    if (left > 0) {
      const id = say(`${who} can’t sign in any more`, { userId: person.userId, label: who });
      later(() => dismiss(id), left);
    } else {
      say(`${who} can’t sign in any more`, undefined, NAME_TOAST_MS);
    }
  }

  async function undo(toast: Toast) {
    if (!toast.undo || !begin(toast.undo.userId)) return;
    const { userId, label } = toast.undo;
    setNotice(null);
    mark("busy", userId, true);
    const result = await postMembers({ action: "undo-remove", userId });
    inFlight.current.delete(userId);
    if (!mounted.current) return;
    mark("busy", userId, false);
    if (!result.ok) {
      // A hiccup keeps Undo on screen so it can be pressed again; an answer that
      // will not change on a retry (too late, already back) takes the toast away.
      if (FINAL_UNDO_CODES.has(result.code ?? "")) dismiss(toast.id);
      return fail(result.code, "undo", label);
    }
    dismiss(toast.id);
    if (await refresh()) say(`${label} can sign in again`, undefined, NAME_TOAST_MS);
    else setNotice({ text: `${label} can sign in again. Refresh the page to see them in the list.`, tone: "warning" });
  }

  async function submitDialog(
    state: DialogState,
    values: { name: string; email: string },
  ): Promise<DialogResult> {
    if (state.mode === "add") {
      const result = await postMembers({
        action: "add",
        email: values.email.trim(),
        displayName: values.name,
      });
      if (!mounted.current) return { ok: true };
      if (!result.ok) return { ok: false, text: signInMessage(result.code, "add", values.name.trim()).text };
      if (typeof result.body.userId === "string") codeWasSent(result.body.userId);
      setDialog(null);
      say(`Code sent to ${middleEmail(values.email.trim(), 34)}`, undefined, SENT_TOAST_MS);
      await refresh();
      return { ok: true };
    }
    const result = await postMembers({
      action: "set-name",
      userId: state.person.userId,
      displayName: values.name,
    });
    if (!mounted.current) return { ok: true };
    if (!result.ok) return { ok: false, text: signInMessage(result.code, "name", "").text };
    const saved = typeof result.body.displayName === "string" ? result.body.displayName : values.name.trim();
    const rename = <T extends SignInPerson>(person: T): T =>
      person.userId === state.person.userId ? { ...person, displayName: saved } : person;
    setLoad((current) =>
      current.status === "ready"
        ? { ...current, owners: current.owners.map(rename), admins: current.admins.map(rename) }
        : current,
    );
    setDialog(null);
    say("Name saved", undefined, NAME_TOAST_MS);
    return { ok: true };
  }

  const subtitle = `People who can sign in and run ${club.name}`;

  if (!isOwner) {
    return (
      <div className={styles.page} data-testid="sign-in-people">
        <header className={styles.head}>
          <div className={styles.titles}>
            <h1 className={styles.h1}>Who can sign in</h1>
          </div>
        </header>
        <p className={styles.ownerOnly} data-testid="sign-in-owner-only">
          Only a club owner can change who can sign in. Ask an owner of {club.name} if someone needs access.
        </p>
      </div>
    );
  }

  const helpers = load.status === "ready" ? load.admins : [];

  return (
    <div className={styles.page} data-testid="sign-in-people">
      <header className={styles.head}>
        <div className={styles.titles}>
          <h1 className={styles.h1}>Who can sign in</h1>
          <p className={styles.sub}>
            <span className={styles.subLong}>{subtitle}</span>
            <span className={styles.subShort}>Who can run the club with you</span>
          </p>
        </div>
        <button
          type="button"
          className={styles.add}
          onClick={() => {
            setNotice(null);
            setDialog({ mode: "add" });
          }}
          disabled={load.status === "loading"}
          data-testid="sign-in-add"
        >
          <IconAdd className="size-4" aria-hidden="true" />
          Add someone
        </button>
      </header>

      {notice ? (
        <div className={styles.notice} data-tone={notice.tone} role="alert" data-testid="sign-in-notice">
          <span className={styles.noticeText}>{notice.text}</span>
          <button type="button" className={styles.noticeClose} aria-label="Dismiss" onClick={() => setNotice(null)}>
            <IconClose className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {load.status === "loading" ? (
        <div className={styles.card} aria-busy="true" aria-label="Loading who can sign in" data-testid="sign-in-loading">
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.skeletonRow}>
              <span className={styles.skeletonDisc} />
              <span className={styles.skeletonBars}>
                <span className={styles.skeletonBar} style={{ width: `${48 - index * 8}%` }} />
                <span className={styles.skeletonBar} style={{ width: `${34 - index * 4}%` }} />
              </span>
            </div>
          ))}
        </div>
      ) : load.status === "error" ? (
        <div className={styles.errorCard} role="alert" data-testid="sign-in-load-error">
          <p className={styles.errorText}>{load.text}</p>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => {
              setLoad({ status: "loading" });
              void refresh();
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <ul className={styles.card} aria-label={`People who can sign in, ${people.length}`} data-testid="sign-in-list">
            {load.owners.map((owner) => (
              <OwnerRow key={owner.userId} owner={owner} onAddName={(person) => setDialog({ mode: "name", person })} />
            ))}
            {helpers.map((person) => (
              <HelperRow
                key={person.userId}
                person={person}
                timeZone={timeZone}
                portal={portal}
                busy={busy.has(person.userId)}
                codeSent={sentAt.has(person.userId)}
                onAddName={(target) => setDialog({ mode: "name", person: target })}
                onResend={resend}
                onRemove={remove}
              />
            ))}
          </ul>
          {helpers.length === 0 ? (
            <div className={styles.empty} data-testid="sign-in-empty">
              <p className={styles.emptyTitle}>No helpers yet</p>
              <p className={styles.emptyLine}>
                Add someone and they can help run {club.name}. We’ll email them a sign-in code.
              </p>
            </div>
          ) : null}
          <HelpBox />
        </>
      )}

      <div className={styles.toasts} role="status" aria-live="polite" data-testid="sign-in-toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast} data-testid="sign-in-toast">
            <span className={styles.toastText} title={toast.text}>
              {toast.text}
            </span>
            {toast.undo ? (
              <button type="button" className={styles.toastUndo} onClick={() => void undo(toast)}>
                Undo
              </button>
            ) : null}
            <button type="button" className={styles.toastClose} aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <IconClose className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <Dialog state={dialog} people={people} onClose={() => setDialog(null)} onSubmit={submitDialog} />
    </div>
  );
}
