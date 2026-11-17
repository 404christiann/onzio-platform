"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  IconCaretDown,
  IconClose,
  IconDownload,
  IconMail,
  IconPayments,
  IconPhone,
  IconRegistrations,
  IconSuccess,
  IconUser,
} from "@/components/admin/icons";
import { Popover, PopoverContent, PopoverPositioner, PopoverTrigger } from "@/components/ui/popover";
import { SlidingPanel } from "@/components/ui/sliding-panel";
import { Spinner } from "@/components/ui/spinner";
import type { SignUpDetail, SignUpForm, SignUpRow, SignUpsData, SignUpTab } from "@/lib/admin-sign-ups-data";
import { signUpAmount, signUpDialNumber, signUpInitials } from "@/lib/admin-sign-ups-format";
import { TopBarActions } from "./TopBar";
import styles from "./sign-ups.module.css";

// ADMIN-RE-08: "See registrations" (design: cd-regs). Newest first, from every
// form; one row per person; their details open beside the list on a laptop and
// as a page of their own on a phone. Which person is open lives in the address
// (?person=), so Back closes it and the server reads that one person's contact
// details only when they are asked for.

const countFormat = new Intl.NumberFormat("en-US");
const TABS: ReadonlyArray<{ id: SignUpTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "refunded", label: "Refunded" },
];
const AVATAR_HUES = ["#c59a4e", "#6f86c9", "#6d9a7c", "#9a6d8a", "#c9736f", "#5f9aa8"] as const;

function avatarHue(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

function hrefFor(tab: SignUpTab, personId: string | null, formId: string | null = null): string {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", tab);
  if (formId) params.set("form", formId);
  if (personId) params.set("person", personId);
  const query = params.toString();
  return query ? `/admin/sign-ups?${query}` : "/admin/sign-ups";
}

function Avatar({ id, name, size }: { id: string; name: string; size: "row" | "panel" }) {
  return (
    <span className={styles.avatar} data-size={size} style={{ background: avatarHue(id) }} aria-hidden="true">
      {signUpInitials(name)}
    </span>
  );
}

function StatusBadge({ status, amountCents }: { status: SignUpRow["status"]; amountCents?: number }) {
  const label = status === "paid" ? "Paid" : "Refunded";
  return (
    <span className={styles.badge} data-status={status}>
      {amountCents === undefined ? label : `${label} ${signUpAmount(amountCents)}`}
    </span>
  );
}

export function SignUps({ data, personId }: { data: SignUpsData; personId: string | null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(personId);
  const [isPending, startTransition] = useTransition();
  const lastRowRef = useRef<HTMLAnchorElement | null>(null);

  // The address is the source of truth: Back, Forward and tab links all land here.
  useEffect(() => setSelectedId(personId), [personId]);

  const tab: SignUpTab = data.status === "ready" ? data.tab : "all";
  // ADMIN-RE-12c: narrowed to one form from Programs and tryouts ("N signed up").
  const formId = data.status === "ready" ? (data.form?.id ?? null) : null;

  function go(nextPerson: string | null) {
    setSelectedId(nextPerson);
    startTransition(() => {
      router.push(hrefFor(tab, nextPerson, formId), { scroll: false });
    });
  }

  function close() {
    go(null);
    lastRowRef.current?.focus();
  }

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (data.status === "error") {
    return (
      <div className={styles.page}>
        <div className={styles.listPage}>
          <h1 className={styles.h1}>Registrations</h1>
          <p className={styles.notice} role="alert">
            We couldn&rsquo;t load your sign-ups just now. Try again in a moment.
          </p>
          <FormsLink />
        </div>
      </div>
    );
  }

  const selectedRow = selectedId ? (data.rows.find((row) => row.id === selectedId) ?? null) : null;
  const detail = data.detail && data.detail.id === selectedId ? data.detail : null;
  const shown = data.rows.length;
  const inTab = data.counts[tab];

  return (
    <div className={styles.page} data-detail-open={selectedId ? "" : undefined}>
      <TopBarActions>
        <DownloadList forms={data.forms} />
      </TopBarActions>

      <div className={styles.listPage}>
        <h1 className={styles.h1}>
          {data.newThisWeek === null ? "Registrations" : `${countFormat.format(data.newThisWeek)} new this week`}
        </h1>
        {data.form ? (
          <p className={styles.sub}>
            Newest first, from <span className={styles.subForm} title={data.form.title}>{data.form.title}</span>
            {" · "}
            <Link href={hrefFor(tab, null)} scroll={false} className={styles.subLink}>
              All forms
            </Link>
          </p>
        ) : (
          <p className={styles.sub}>Newest first, from all your registration forms</p>
        )}

        <nav className={styles.tabs} aria-label="Show sign-ups">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={hrefFor(item.id, null, formId)}
              scroll={false}
              className={styles.tab}
              aria-current={item.id === tab ? "page" : undefined}
              data-tab={item.id}
            >
              {item.label}
              <span className={styles.tabCount}>{countFormat.format(data.counts[item.id])}</span>
            </Link>
          ))}
        </nav>

        {shown === 0 ? (
          <p className={styles.empty} data-testid="sign-ups-empty">
            {data.counts.all === 0 ? "No sign-ups yet" : tab === "refunded" ? "No refunds" : "No paid sign-ups"}
          </p>
        ) : (
          <ul className={styles.list} aria-label="Sign-ups">
            {data.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={hrefFor(tab, row.id, formId)}
                  scroll={false}
                  className={styles.row}
                  data-person={row.id}
                  aria-current={row.id === selectedId ? "true" : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    lastRowRef.current = event.currentTarget;
                    go(row.id);
                  }}
                >
                  <Avatar id={row.id} name={row.name} size="row" />
                  <span className={styles.rowText}>
                    <span className={styles.rowName} title={row.name} data-testid="sign-up-name">
                      {row.name}
                    </span>
                    <span className={styles.rowSub} title={`${row.formTitle} · ${row.when}`}>
                      <span className={styles.rowForm}>{row.formTitle}</span>
                      <span className={styles.rowWhen}>{` · ${row.when}`}</span>
                    </span>
                  </span>
                  <StatusBadge status={row.status} amountCents={row.amountCents} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {inTab > shown && shown > 0 ? (
          <p className={styles.more}>
            Showing the newest {countFormat.format(shown)} of {countFormat.format(inTab)}. Download list has everyone.
          </p>
        ) : null}
        <FormsLink />
      </div>

      {selectedId ? (
        <aside className={styles.panel} aria-label="Sign-up details" data-testid="sign-up-details">
          <div className={styles.panelBar}>
            <button type="button" className={styles.panelBack} onClick={close}>
              <ChevronLeft className="size-5" aria-hidden="true" />
              Registrations
            </button>
            <button type="button" className={styles.panelClose} onClick={close} aria-label="Close details">
              <IconClose className="size-4" aria-hidden="true" />
            </button>
          </div>
          <SlidingPanel activeKey={selectedId} direction={1} className={styles.panelSlide}>
            <Details row={detail ?? selectedRow} detail={detail} loading={isPending && !detail} />
          </SlidingPanel>
        </aside>
      ) : null}
    </div>
  );
}

function Details({
  row,
  detail,
  loading,
}: {
  row: SignUpRow | null;
  detail: SignUpDetail | null;
  loading: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 767px)").matches) window.scrollTo({ top: 0 });
  }, [row?.id]);

  if (!row && !loading) {
    return (
      <div className={styles.panelBody}>
        <p className={styles.notice} role="alert">
          We couldn&rsquo;t find this sign-up. It may have been removed.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.panelBody}>
      {row ? (
        <div className={styles.who}>
          <Avatar id={row.id} name={row.name} size="panel" />
          <div className={styles.whoText}>
            <h2 ref={headingRef} tabIndex={-1} className={styles.whoName} title={row.name}>
              {row.name}
            </h2>
            <p className={styles.whoForm} title={row.formTitle}>
              {row.formTitle}
            </p>
          </div>
        </div>
      ) : null}

      {detail ? (
        <>
          <section className={styles.section} aria-labelledby="sign-up-contact">
            <h3 id="sign-up-contact" className={styles.sectionLabel}>
              {detail.contactLabel}
            </h3>
            <p className={styles.line}>
              <IconUser className={styles.lineIcon} aria-hidden="true" />
              <span className={styles.lineMain}>{detail.contactName ?? "Name not given"}</span>
            </p>
            <p className={styles.line}>
              <IconPhone className={styles.lineIcon} aria-hidden="true" />
              {detail.contactPhone ? (
                <a href={`tel:${signUpDialNumber(detail.contactPhone)}`} className={styles.lineLink}>
                  {detail.contactPhone}
                </a>
              ) : (
                <span className={styles.lineMissing}>No phone given</span>
              )}
            </p>
            <p className={styles.line}>
              <IconMail className={styles.lineIcon} aria-hidden="true" />
              {detail.contactEmail ? (
                <a href={`mailto:${detail.contactEmail}`} className={styles.lineLink}>
                  {detail.contactEmail}
                </a>
              ) : (
                <span className={styles.lineMissing}>No email given</span>
              )}
            </p>
          </section>

          <section className={styles.section} aria-labelledby="sign-up-payment">
            <h3 id="sign-up-payment" className={styles.sectionLabel}>
              Payment
            </h3>
            <p className={styles.line}>
              <IconPayments className={styles.lineIcon} aria-hidden="true" />
              <span className={styles.lineMain}>
                {signUpAmount(detail.amountCents)} on {detail.paidOn}
              </span>
              <StatusBadge status={detail.status} />
            </p>
            {detail.status === "refunded" ? (
              <p className={styles.lineSub}>
                {`Refunded ${signUpAmount(detail.refundedCents || detail.amountCents)}${detail.refundedOn ? ` on ${detail.refundedOn}` : ""}`}
              </p>
            ) : null}
            <p className={styles.lineSub}>Card, through Stripe</p>
          </section>
        </>
      ) : loading ? (
        <div className={styles.section} aria-busy="true" aria-label="Loading details">
          <span className={`${styles.skeleton} w-28`} />
          <span className={`${styles.skeleton} w-48`} />
          <span className={`${styles.skeleton} w-40`} />
          <span className={`${styles.skeleton} w-56`} />
        </div>
      ) : (
        <p className={styles.notice} role="alert">
          We couldn&rsquo;t load these details. Close them and try again.
        </p>
      )}
    </div>
  );
}

function FormsLink() {
  return (
    <Link href="/admin/registrations" className={styles.formsLink} data-testid="sign-up-forms-link">
      <span className={styles.formsIcon}>
        <IconRegistrations className="size-[18px]" aria-hidden="true" />
      </span>
      <span className={styles.formsText}>
        <span className={styles.formsLabel}>Sign-up forms</span>
        <span className={styles.formsHint}>Make a form, open it or close it</span>
      </span>
      <ChevronRight className={`size-4 ${styles.formsGo}`} aria-hidden="true" />
    </Link>
  );
}

type DownloadState = "idle" | "busy" | "done" | "error";

function fileNameFor(form: SignUpForm): string {
  const slug = form.title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .slice(0, 60);
  return `${slug || "sign-ups"}.csv`;
}

/** Decision 9: one form at a time, picked from a list when the club has more than one. */
function DownloadList({ forms }: { forms: readonly SignUpForm[] }) {
  const [state, setState] = useState<DownloadState>("idle");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state !== "done" && state !== "error") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function download(form: SignUpForm) {
    setOpen(false);
    setState("busy");
    try {
      const response = await fetch(`/api/admin/registrations/export?formId=${encodeURIComponent(form.id)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("export failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFor(form);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const label =
    state === "busy" ? (
      <>
        <Spinner className="size-4" aria-hidden="true" role={undefined} aria-label={undefined} />
        <span className={styles.downloadText}>Preparing…</span>
      </>
    ) : state === "done" ? (
      <>
        <IconSuccess className="size-4" aria-hidden="true" />
        <span className={styles.downloadText}>Downloaded</span>
      </>
    ) : state === "error" ? (
      <>
        <IconDownload className="size-4" aria-hidden="true" />
        <span className={styles.downloadText}>Try again</span>
      </>
    ) : (
      <>
        <IconDownload className="size-4" aria-hidden="true" />
        <span className={styles.downloadText}>Download list</span>
      </>
    );
  const announcement =
    state === "busy" ? "Preparing the list" : state === "done" ? "List downloaded" : state === "error" ? "The list didn't download. Try again." : "";

  if (forms.length <= 1) {
    return (
      <>
        <button
          type="button"
          className={styles.download}
          data-state={state}
          disabled={forms.length === 0 || state === "busy"}
          aria-label="Download list"
          onClick={() => forms[0] && void download(forms[0])}
        >
          {label}
        </button>
        <span className="sr-only" role="status">
          {announcement}
        </span>
      </>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={styles.download}
          data-state={state}
          disabled={state === "busy"}
          aria-label="Download list"
        >
          {label}
          {state === "idle" ? <IconCaretDown className="size-4" aria-hidden="true" /> : null}
        </PopoverTrigger>
        <PopoverPositioner align="end" sideOffset={6}>
          <PopoverContent className={styles.picker}>
            <p className={styles.pickerTitle}>Which form?</p>
            <ul className={styles.pickerList}>
              {forms.map((form) => (
                <li key={form.id}>
                  <button type="button" className={styles.pickerItem} onClick={() => void download(form)}>
                    <span className={styles.pickerName} title={form.title}>
                      {form.title}
                    </span>
                    <span className={styles.pickerMeta}>
                      {`${countFormat.format(form.signUps)} ${form.signUps === 1 ? "sign-up" : "sign-ups"}`}
                      {form.archived ? " · archived" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </PopoverPositioner>
      </Popover>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </>
  );
}
