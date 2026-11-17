"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  IconAdd,
  IconCaretDown,
  IconCaretLeft,
  IconCheck,
  IconClock,
  IconEyeSlash,
  IconLink,
  IconLock,
  IconMail,
  IconMore,
  IconRegistrations,
} from "@/components/admin/icons";
import { Popover, PopoverContent, PopoverPositioner, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type {
  ProgramItem,
  ProgramsTryoutsData,
  SignUpFormOption,
  TryoutItem,
} from "@/lib/admin-programs-tryouts-data";
import {
  PROGRAMS_TRYOUTS_MESSAGES,
  type ProgramSignUpSettings,
  type ProgramsTryoutsRequest,
  type TryoutSettings,
} from "@/lib/programs-tryouts-contract";
import type { SignUpState } from "@/lib/sign-up-state";
import { TryoutForm } from "./TryoutForm";
import styles from "./programs-tryouts.module.css";

// ADMIN-RE-12c: "Programs and tryouts" (design: cd-programs-final; group 2
// decisions 1-14). One list: tryouts by date, then programs in the website's
// order. Each row says whether families can sign up ("Taking sign-ups · 24
// signed up", "Not taking sign-ups yet", "Closed", "Hidden from your
// website"), worked out from its sign-up way and date (decision 0003), with
// the price from its form (decision 0004). The state pill opens "How should
// families sign up?"; the ⋯ menu closes, reopens, hides, copies, moves or
// deletes. Every change saves at once with "Saved · Undo" (decision 5). Writes
// go through POST /api/admin/programs-and-tryouts.

type Item = TryoutItem | ProgramItem;
type Toast = { text: string; undo?: () => Promise<void> } | null;
type Answer = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

export type ProgramsTryoutsLinks = Readonly<{
  signUps: `/admin${string}`;
  forms: `/admin${string}`;
  payments: `/admin${string}` | null;
  editProgram: `/admin${string}` | null;
  programsWords: `/admin${string}` | null;
  tryoutsWords: `/admin${string}` | null;
}>;

const countFormat = new Intl.NumberFormat("en-US");

async function send(request: ProgramsTryoutsRequest): Promise<Answer> {
  try {
    const response = await fetch("/api/admin/programs-and-tryouts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: Record<string, unknown>;
      error?: { message?: unknown };
    } | null;
    if (response.ok && body?.ok) return { ok: true, data: body.data ?? {} };
    const message = body?.error?.message;
    return { ok: false, message: typeof message === "string" ? message : PROGRAMS_TRYOUTS_MESSAGES.DATABASE_OPERATION_FAILED };
  } catch {
    return { ok: false, message: PROGRAMS_TRYOUTS_MESSAGES.DATABASE_OPERATION_FAILED };
  }
}

export function tryoutSettingsOf(item: TryoutItem): TryoutSettings {
  return {
    headline: item.name,
    event_date: item.eventDate,
    location: item.location,
    cost_text: item.costNote,
    cta_label: item.linkLabel,
    registration_href: item.linkHref,
    registration_form_id: item.formId,
    sign_up_by_contact: item.byContact,
    closed: item.closedByOwner,
    hidden: item.hidden,
    stays_open_after_date: item.staysOpenAfterDate,
  };
}

function programSettingsOf(item: ProgramItem): ProgramSignUpSettings {
  return {
    external_cta_label: item.linkLabel,
    external_cta_href: item.linkHref,
    registration_form_id: item.formId,
    sign_up_by_contact: item.byContact,
    sign_ups_closed: item.closedByOwner,
    hidden: item.hidden,
  };
}

/** One sign-up way at a time: choosing one clears the others (Undo puts them back). */
export type WayChoice =
  | { way: "form"; formId: string }
  | { way: "link"; label: string; href: string }
  | { way: "contact" };

function wayFields(choice: WayChoice) {
  return {
    formId: choice.way === "form" ? choice.formId : null,
    label: choice.way === "link" ? choice.label.trim() : "",
    href: choice.way === "link" ? choice.href.trim() : "",
    byContact: choice.way === "contact",
  };
}

const ICON: Record<SignUpState, React.ComponentType<{ className?: string }>> = {
  taking: IconCheck,
  "not-yet": IconClock,
  closed: IconLock,
  hidden: IconEyeSlash,
};

export function ProgramsTryouts({
  data,
  canChange,
  startAdding = false,
  canCopyPrograms,
  sections,
  savedText,
  links,
  today,
}: {
  data: ProgramsTryoutsData;
  canChange: boolean;
  /** Open on "Add a tryout" (the Programs tab's button). */
  startAdding?: boolean;
  canCopyPrograms: boolean;
  sections: Readonly<{ programs: boolean; tryouts: boolean }>;
  savedText: string;
  links: ProgramsTryoutsLinks;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<TryoutItem | "new" | null>(startAdding ? "new" : null);
  const [deleting, setDeleting] = useState<TryoutItem | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title = sections.programs && sections.tryouts ? "Programs and tryouts" : sections.tryouts ? "Tryouts" : "Programs";

  function showToast(next: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    if (next) toastTimer.current = setTimeout(() => setToast(null), 8000);
  }

  async function run(key: string, request: ProgramsTryoutsRequest, done: (data: Record<string, unknown>) => Toast) {
    setBusy(key);
    setProblem(null);
    const answer = await send(request);
    setBusy(null);
    if (!answer.ok) {
      setProblem(answer.message);
      return false;
    }
    showToast(done(answer.data));
    router.refresh();
    return true;
  }

  /** Save a tryout's settings; Undo saves the ones it had. */
  function saveTryout(item: TryoutItem, next: TryoutSettings) {
    const before = tryoutSettingsOf(item);
    return run(item.id, {
      action: "save-tryout",
      operationId: crypto.randomUUID(),
      id: item.id,
      expectedUpdatedAt: item.updatedAt,
      tryout: next,
    }, (saved) => ({
      text: savedText,
      undo: async () => {
        const row = saved.tryout as { updated_at?: string } | undefined;
        if (!row?.updated_at) return;
        await run(item.id, {
          action: "save-tryout",
          operationId: crypto.randomUUID(),
          id: item.id,
          expectedUpdatedAt: row.updated_at,
          tryout: before,
        }, () => ({ text: "Undone" }));
      },
    }));
  }

  function saveProgram(item: ProgramItem, next: ProgramSignUpSettings) {
    const before = programSettingsOf(item);
    return run(item.id, {
      action: "save-program",
      operationId: crypto.randomUUID(),
      id: item.id,
      expectedUpdatedAt: item.updatedAt,
      program: next,
    }, (saved) => ({
      text: savedText,
      undo: async () => {
        const row = saved.program as { updated_at?: string } | undefined;
        if (!row?.updated_at) return;
        await run(item.id, {
          action: "save-program",
          operationId: crypto.randomUUID(),
          id: item.id,
          expectedUpdatedAt: row.updated_at,
          program: before,
        }, () => ({ text: "Undone" }));
      },
    }));
  }

  function chooseWay(item: Item, choice: WayChoice, costNote?: string) {
    const fields = wayFields(choice);
    if (item.kind === "tryout") {
      return saveTryout(item, {
        ...tryoutSettingsOf(item),
        registration_form_id: fields.formId,
        cta_label: fields.label,
        registration_href: fields.href,
        sign_up_by_contact: fields.byContact,
        ...(costNote === undefined ? {} : { cost_text: costNote.trim() }),
      });
    }
    return saveProgram(item, {
      ...programSettingsOf(item),
      registration_form_id: fields.formId,
      external_cta_label: fields.label,
      external_cta_href: fields.href,
      sign_up_by_contact: fields.byContact,
    });
  }

  function setClosed(item: Item, closed: boolean) {
    if (item.kind === "tryout") {
      // Reopening a tryout its date closed keeps it open past the date (until the date changes).
      const reopenPastDate = !closed && item.closedLine !== null;
      return saveTryout(item, {
        ...tryoutSettingsOf(item),
        closed,
        stays_open_after_date: reopenPastDate ? true : item.staysOpenAfterDate,
      });
    }
    return saveProgram(item, { ...programSettingsOf(item), sign_ups_closed: closed });
  }

  function setHidden(item: Item, hidden: boolean) {
    if (item.kind === "tryout") return saveTryout(item, { ...tryoutSettingsOf(item), hidden });
    return saveProgram(item, { ...programSettingsOf(item), hidden });
  }

  function copy(item: Item) {
    return run(item.id, { action: "copy", operationId: crypto.randomUUID(), kind: item.kind, id: item.id }, () => ({
      text: "Copy made · hidden from your website",
    }));
  }

  function move(item: ProgramItem, direction: "up" | "down") {
    return run(item.id, { action: "move-program", operationId: crypto.randomUUID(), id: item.id, direction }, () => ({
      text: savedText,
    }));
  }

  async function confirmDelete() {
    if (!deleting) return;
    const item = deleting;
    const ok = await run(item.id, {
      action: "delete-tryout",
      operationId: crypto.randomUUID(),
      id: item.id,
      expectedUpdatedAt: item.updatedAt,
    }, () => ({ text: `${item.name} deleted` }));
    if (ok) setDeleting(null);
  }

  if (data.status === "error") {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>{title}</h1>
        <p className={styles.notice} role="alert">
          We couldn&rsquo;t load your {title.toLowerCase()} just now. Refresh the page to try again.
        </p>
      </div>
    );
  }

  if (editing) {
    return (
      <TryoutForm
        tryout={editing === "new" ? null : editing}
        forms={data.forms}
        places={[...new Set(data.tryouts.map((item) => item.location.trim()).filter(Boolean))].slice(0, 3)}
        hasContactEmail={data.hasContactEmail}
        today={today}
        savedText={savedText}
        title={title}
        links={links}
        onClose={(changed) => {
          setEditing(null);
          if (changed) {
            showToast({ text: changed });
            router.refresh();
          }
        }}
      />
    );
  }

  const { tryouts, programs } = data;
  const nothing = tryouts.length + programs.length === 0;
  const total = (sections.tryouts ? tryouts.length : 0) + (sections.programs ? programs.length : 0);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.h1}>
          {title}
          <span className={styles.count}>{countFormat.format(total)}</span>
        </h1>
        {canChange && sections.tryouts && !nothing ? (
          <button type="button" className={styles.add} onClick={() => setEditing("new")}>
            <IconAdd className={styles.icon} />
            Add a tryout
          </button>
        ) : null}
      </div>

      {links.programsWords || links.tryoutsWords ? (
        <p className={styles.words}>
          {links.programsWords ? <Link href={links.programsWords}>Programs page words</Link> : null}
          {links.tryoutsWords ? <Link href={links.tryoutsWords}>Tryouts page words</Link> : null}
        </p>
      ) : null}

      {problem ? (
        <p className={styles.notice} role="alert">
          {problem}
        </p>
      ) : null}

      {nothing ? (
        <div className={styles.empty}>
          <p>
            {sections.tryouts
              ? "Nothing here yet. Add a tryout and it shows on your website."
              : "No programs yet. Your programs are set up by Onzio; contact us to add one."}
          </p>
          {canChange && sections.tryouts ? (
            <button type="button" className={styles.add} onClick={() => setEditing("new")}>
              <IconAdd className={styles.icon} />
              Add a tryout
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {sections.tryouts ? (
            <section aria-labelledby="pt-tryouts">
              {sections.programs ? (
                <h2 id="pt-tryouts" className={styles.section}>
                  Tryouts
                </h2>
              ) : (
                <h2 id="pt-tryouts" className={styles.srOnly}>
                  Tryouts
                </h2>
              )}
              {tryouts.length === 0 ? <p className={styles.groupEmpty}>No tryouts yet.</p> : null}
              <ul className={styles.list}>
                {tryouts.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    forms={data.forms}
                    links={links}
                    canChange={canChange}
                    busy={busy === item.id}
                    hasContactEmail={data.hasContactEmail}
                    onWay={(choice, costNote) => void chooseWay(item, choice, costNote)}
                    actions={[
                      { label: "Change the details", run: () => setEditing(item) },
                      item.state === "closed"
                        ? { label: "Reopen sign-ups", run: () => void setClosed(item, false) }
                        : item.state === "hidden"
                          ? null
                          : { label: "Close sign-ups", run: () => void setClosed(item, true) },
                      item.hidden
                        ? { label: "Show on your website", run: () => void setHidden(item, false) }
                        : { label: "Hide from your website", run: () => void setHidden(item, true) },
                      { label: "Make a copy", run: () => void copy(item) },
                      { label: "Delete", run: () => setDeleting(item), danger: true },
                    ]}
                    onReopen={() => void setClosed(item, false)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {sections.programs ? (
            <section aria-labelledby="pt-programs">
              {sections.tryouts ? (
                <h2 id="pt-programs" className={styles.section}>
                  Programs
                </h2>
              ) : (
                <h2 id="pt-programs" className={styles.srOnly}>
                  Programs
                </h2>
              )}
              {programs.length === 0 ? <p className={styles.groupEmpty}>No programs yet.</p> : null}
              <ul className={styles.list}>
                {programs.map((item, index) => (
                  <Row
                    key={item.id}
                    item={item}
                    forms={data.forms}
                    links={links}
                    canChange={canChange}
                    busy={busy === item.id}
                    hasContactEmail={data.hasContactEmail}
                    onWay={(choice) => void chooseWay(item, choice)}
                    actions={[
                      links.editProgram ? { label: "Edit the page", href: links.editProgram } : null,
                      item.state === "closed"
                        ? { label: "Reopen sign-ups", run: () => void setClosed(item, false) }
                        : item.state === "hidden"
                          ? null
                          : { label: "Close sign-ups", run: () => void setClosed(item, true) },
                      item.hidden
                        ? { label: "Show on your website", run: () => void setHidden(item, false) }
                        : { label: "Hide from your website", run: () => void setHidden(item, true) },
                      canCopyPrograms ? { label: "Make a copy", run: () => void copy(item) } : null,
                      index > 0 ? { label: "Move up", run: () => void move(item, "up") } : null,
                      index < programs.length - 1 ? { label: "Move down", run: () => void move(item, "down") } : null,
                    ]}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <div className={styles.toast} data-on={toast ? "" : undefined} role="status" aria-live="polite">
        {toast ? (
          <>
            <IconCheck className={styles.icon} />
            <span>{toast.text}</span>
            {toast.undo ? (
              <button
                type="button"
                className={styles.undo}
                onClick={() => {
                  const undo = toast.undo;
                  showToast(null);
                  void undo?.();
                }}
              >
                Undo
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <AdminModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        backdropClassName={styles.scrim}
        className={styles.dialog}
        aria-labelledby="pt-delete-title"
      >
        {deleting ? (
          <>
            <h2 id="pt-delete-title" className={styles.dialogTitle}>
              Delete {deleting.name}?
            </h2>
            <p className={styles.dialogText}>
              It comes off your website. Its sign-up form and anyone who signed up stay in See registrations.
            </p>
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.secondary} onClick={() => setDeleting(null)}>
                Keep it
              </button>
              <button type="button" className={styles.danger} onClick={() => void confirmDelete()} disabled={busy === deleting.id}>
                {busy === deleting.id ? <Spinner className={styles.icon} /> : null}
                Delete
              </button>
            </div>
          </>
        ) : null}
      </AdminModal>
    </div>
  );
}

type Action = { label: string; run?: () => void; href?: string; danger?: boolean } | null;

function Row({
  item,
  forms,
  links,
  canChange,
  busy,
  hasContactEmail,
  onWay,
  actions,
  onReopen,
}: {
  item: Item;
  forms: readonly SignUpFormOption[];
  links: ProgramsTryoutsLinks;
  canChange: boolean;
  busy: boolean;
  hasContactEmail: boolean;
  onWay: (choice: WayChoice, costNote?: string) => void;
  actions: readonly Action[];
  onReopen?: () => void;
}) {
  const Icon = ICON[item.state];
  const words =
    item.state === "taking" ? "Taking sign-ups"
    : item.state === "not-yet" ? "Not taking sign-ups yet"
    : item.state === "closed" ? "Closed"
    : "Hidden from your website";
  const count = item.signedUp !== null && item.state !== "hidden" ? (
    <Link className={styles.seen} href={`${links.signUps}?form=${item.formId}`}>
      {countFormat.format(item.signedUp)} signed up
    </Link>
  ) : null;

  return (
    <li className={styles.card} data-state={item.state} aria-busy={busy || undefined}>
      <div className={styles.main}>
        <span className={styles.text}>
          <span className={styles.name} title={item.name}>
            {item.name}
          </span>
          {item.line ? (
            <span className={styles.line} title={item.line}>
              {item.line}
            </span>
          ) : null}
        </span>
        {item.price ? <span className={styles.price}>{item.price}</span> : null}
        <span className={styles.status}>
          {canChange ? (
            <WayMenu item={item} forms={forms} links={links} hasContactEmail={hasContactEmail} onWay={onWay}>
              <Icon className={styles.icon} />
              <span>{words}</span>
              <IconCaretDown className={styles.caret} />
            </WayMenu>
          ) : (
            <span className={styles.pill} data-tone={item.state}>
              <Icon className={styles.icon} />
              <span>{words}</span>
            </span>
          )}
          {item.state === "hidden" ? <span className={styles.tail}>not taking sign-ups</span> : null}
          {count}
          {item.formNotOpen && item.state !== "hidden" ? (
            <span className={styles.tail}>Its form isn&rsquo;t open yet</span>
          ) : null}
        </span>
        {canChange ? <MoreMenu name={item.name} actions={actions} busy={busy} /> : null}
      </div>
      {item.kind === "tryout" && item.closedLine && item.state === "closed" ? (
        <div className={styles.closed}>
          <IconLock className={styles.icon} />
          <span>{item.closedLine}</span>
          {canChange && onReopen ? (
            <button type="button" className={styles.linkButton} onClick={onReopen} disabled={busy}>
              Reopen
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function MoreMenu({ name, actions, busy }: { name: string; actions: readonly Action[]; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={styles.more} aria-label={`More for ${name}`} disabled={busy}>
        {busy ? <Spinner className={styles.icon} /> : <IconMore className={styles.icon} />}
      </PopoverTrigger>
      <PopoverPositioner align="end">
        <PopoverContent className={styles.menu}>
          {actions.filter((action): action is NonNullable<Action> => action !== null).map((action) =>
            action.href ? (
              <Link key={action.label} href={action.href} className={styles.menuRow}>
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                className={styles.menuRow}
                data-danger={action.danger ? "" : undefined}
                onClick={() => {
                  setOpen(false);
                  action.run?.();
                }}
              >
                {action.label}
              </button>
            ),
          )}
        </PopoverContent>
      </PopoverPositioner>
    </Popover>
  );
}

function WayMenu({
  item,
  forms,
  links,
  hasContactEmail,
  onWay,
  children,
}: {
  item: Item;
  forms: readonly SignUpFormOption[];
  links: ProgramsTryoutsLinks;
  hasContactEmail: boolean;
  onWay: (choice: WayChoice, costNote?: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"root" | "forms" | "link" | "contact">("root");
  const [label, setLabel] = useState(item.linkLabel || "Sign up");
  const [href, setHref] = useState(item.linkHref);
  const [note, setNote] = useState(item.kind === "tryout" ? item.costNote : "");
  const choose = (choice: WayChoice, costNote?: string) => {
    setOpen(false);
    onWay(choice, costNote);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPanel("root");
      }}
    >
      <PopoverTrigger className={styles.pill} data-tone={item.state} aria-label={`How families sign up for ${item.name}`}>
        {children}
      </PopoverTrigger>
      <PopoverPositioner align="end">
        <PopoverContent className={styles.menu} aria-label="How should families sign up?">
          {panel === "root" ? (
            <>
              <span className={styles.menuHead}>How should families sign up?</span>
              <button type="button" className={styles.menuRow} data-picked={item.way === "form" || undefined} onClick={() => setPanel("forms")}>
                <IconRegistrations className={styles.icon} />
                Sign-up form
              </button>
              <button type="button" className={styles.menuRow} data-picked={item.way === "link" || undefined} onClick={() => setPanel("link")}>
                <IconLink className={styles.icon} />
                A link to another site
              </button>
              <button type="button" className={styles.menuRow} data-picked={item.way === "contact" || undefined} onClick={() => setPanel("contact")}>
                <IconMail className={styles.icon} />
                They contact you
              </button>
            </>
          ) : null}
          {panel === "forms" ? (
            <FormPicker
              item={item}
              forms={forms}
              links={links}
              onBack={() => setPanel("root")}
              onPick={(formId) => choose({ way: "form", formId })}
            />
          ) : null}
          {panel === "link" ? (
            <form
              className={styles.menuForm}
              onSubmit={(event) => {
                event.preventDefault();
                choose({ way: "link", label, href }, item.kind === "tryout" ? note : undefined);
              }}
            >
              <button type="button" className={styles.menuHead} onClick={() => setPanel("root")}>
                <IconCaretLeft className={styles.icon} />
                A link to another site
              </button>
              <label className={styles.field}>
                <span>Button words</span>
                <input value={label} maxLength={40} required onChange={(event) => setLabel(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Link</span>
                <input value={href} maxLength={2048} required inputMode="url" placeholder="https://" onChange={(event) => setHref(event.target.value)} />
              </label>
              {item.kind === "tryout" ? (
                <label className={styles.field}>
                  <span>Cost (optional)</span>
                  <input value={note} maxLength={120} placeholder="$25 at the field" onChange={(event) => setNote(event.target.value)} />
                </label>
              ) : null}
              <button type="submit" className={styles.primary}>
                Use this link
              </button>
            </form>
          ) : null}
          {panel === "contact" ? (
            <form
              className={styles.menuForm}
              onSubmit={(event) => {
                event.preventDefault();
                choose({ way: "contact" }, item.kind === "tryout" ? note : undefined);
              }}
            >
              <button type="button" className={styles.menuHead} onClick={() => setPanel("root")}>
                <IconCaretLeft className={styles.icon} />
                They contact you
              </button>
              <p className={styles.menuNote}>
                {hasContactEmail
                  ? "Your website shows a “Contact the club” button with your email."
                  : "Add your email in Your club so the “Contact the club” button has somewhere to go."}
              </p>
              {item.kind === "tryout" ? (
                <label className={styles.field}>
                  <span>Cost (optional)</span>
                  <input value={note} maxLength={120} placeholder="$25 at the field" onChange={(event) => setNote(event.target.value)} />
                </label>
              ) : null}
              <button type="submit" className={styles.primary}>
                Done
              </button>
            </form>
          ) : null}
        </PopoverContent>
      </PopoverPositioner>
    </Popover>
  );
}

export function FormPicker({
  item,
  forms,
  links,
  onBack,
  onPick,
  picked,
}: {
  item: Item | null;
  forms: readonly SignUpFormOption[];
  links: ProgramsTryoutsLinks;
  onBack?: () => void;
  onPick: (formId: string) => void;
  picked?: string | null;
}) {
  const options = forms;
  const current = picked ?? item?.formId ?? null;
  return (
    <div className={styles.picker}>
      {onBack ? (
        <button type="button" className={styles.menuHead} onClick={onBack}>
          <IconCaretLeft className={styles.icon} />
          Which form?
        </button>
      ) : null}
      {options.length === 0 ? <p className={styles.menuNote}>You have no sign-up forms yet.</p> : null}
      {options.map((form) => {
        const usedElsewhere = form.usedBy && !(item && form.usedBy.kind === item.kind && form.usedBy.id === item.id);
        const blocked = Boolean(usedElsewhere) || form.needsPayments;
        return (
          <button
            key={form.id}
            type="button"
            className={styles.menuRow}
            data-two={blocked || !form.open ? "" : undefined}
            data-picked={current === form.id || undefined}
            aria-disabled={blocked || undefined}
            onClick={() => {
              if (!blocked) onPick(form.id);
            }}
          >
            <IconRegistrations className={styles.icon} />
            <span className={styles.menuTwo}>
              <span className={styles.menuTop}>
                <span className={styles.menuName} title={form.title}>
                  {form.title}
                </span>
                {form.price ? <span className={styles.menuPrice}>· {form.price}</span> : null}
              </span>
              {usedElsewhere && form.usedBy ? (
                <span className={styles.menuSub} title={`Used by ${form.usedBy.name}`}>
                  Used by {form.usedBy.name}
                </span>
              ) : form.needsPayments ? (
                <span className={styles.menuSub}>
                  Connect payments first ·{" "}
                  {links.payments ? (
                    <Link href={links.payments} className={styles.inlineLink}>
                      Set up
                    </Link>
                  ) : (
                    "ask the club owner"
                  )}
                </span>
              ) : !form.open ? (
                <span className={styles.menuSub}>Not open yet · open it on Sign-up forms</span>
              ) : null}
            </span>
            {current === form.id ? <IconCheck className={styles.icon} /> : null}
          </button>
        );
      })}
      <Link href={links.forms} className={styles.menuRow} data-quiet="">
        <IconAdd className={styles.icon} />
        Make a new form
      </Link>
    </div>
  );
}
