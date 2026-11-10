"use client";

import { Menu } from "@base-ui/react/menu";
import { Switch } from "@base-ui/react/switch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  ChevronLeft,
  IconAdd,
  IconCaretLeft,
  IconCaretRight,
  IconDelete,
  IconGlobe,
  IconMore,
  IconSponsors,
  IconSuccess,
  IconUpload,
  IconWarning,
} from "@/components/admin/icons";
import { useClubContext } from "@/components/ClubContextProvider";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/admin-client";
import type { ClubContext } from "@/lib/club-context";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { GRAPHIC_UPLOAD_ACCEPT, GRAPHIC_UPLOAD_TYPES_LABEL, isGraphicUploadType } from "@/lib/media-upload-types";
import { fetchSponsorList } from "@/lib/queries";
import { savedLabel, websiteState } from "@/lib/save-status";
import {
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  SPONSOR_NAME_LIMIT,
  SPONSOR_WEBSITE_LIMIT,
  characterCount,
  diffSponsorList,
  normalizeSponsorWebsite,
  sponsorDraftFromRow,
  sponsorListCounts,
  sponsorListProblems,
  sponsorNameFromFile,
  sponsorWebsiteDomain,
  type SponsorDraft,
} from "@/lib/sponsor-content";
import { deleteSponsorStorageUrls, deleteUnusedSponsorStorageUrls, uploadSponsorLogo } from "@/lib/sponsor-storage";
import { isPlainClick, TopBarTakeover, useLeaveGuard, useTabBack } from "./TopBar";
import barStyles from "./reimagined.module.css";
import styles from "./sponsors.module.css";

// ADMIN-RE-15: Sponsors, one list (design cd-sponsors-final; decision 0007;
// group 3 decisions 3, 4, 5 and 12). Each sponsor once, with Homepage and
// Footer switches (10 and 6 at most; a full place greys its switch), an
// optional "Their website", and an order changed from the ⋯ menu. The Footer
// switch shows only where the club's website footer shows sponsors, which the
// club's site definition says (codeSiteAdminFor), never a template check. One
// Save writes through POST /api/admin/data (Zod there, RLS under it).

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
/** Enough for both places full and some sponsors resting; keeps the page usable. */
const MAX_LISTED = 30;
/** How long the Save button keeps confirming before it is ready again. */
const DONE_MS = 4000;
/** The homepage strip shows a logo in a 260 × 80 box; drawn more than 1.5× up, it looks soft. */
const STRIP_BOX = { width: 260, height: 80 };
const BLURRY_SCALE = 1.5;

type SaveState = "idle" | "busy" | "done";
type FieldErrors = Record<string, { name?: string; website?: string }>;

/** Same rule as the home, Enter a score and Your club use for content changes. */
function canMutateContent(club: ClubContext): boolean {
  return (
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"))
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

export function Sponsors() {
  const club = useClubContext();
  const [load, setLoad] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; rows: DBSiteSponsorLogo[] }>({
    status: "loading",
  });

  useEffect(() => {
    let active = true;
    fetchSponsorList(club.id)
      .then((rows) => {
        if (active) setLoad({ status: "ready", rows });
      })
      .catch(() => {
        if (active) setLoad({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [club.id]);

  if (load.status === "ready") return <Editor club={club} initialRows={load.rows} />;
  return (
    <div className={styles.page} data-admin-page="sponsors">
      <PageHead />
      {load.status === "error" ? (
        <p className={styles.alert} role="alert">
          We could not load your sponsors. Refresh the page to try again.
        </p>
      ) : (
        <div className={styles.loading} aria-busy="true" aria-label="Loading your sponsors">
          <Spinner className="size-5" />
        </div>
      )}
    </div>
  );
}

function PageHead({ children }: { children?: React.ReactNode }) {
  return (
    <header className={styles.head}>
      <span className={styles.headIcon}>
        <IconSponsors className="size-6" aria-hidden="true" />
      </span>
      <div className={styles.headText}>
        <h1 className={styles.title}>Sponsors</h1>
        <p className={styles.sub}>Add a logo once, then pick where it shows.</p>
      </div>
      {children}
    </header>
  );
}

function Editor({ club, initialRows }: { club: ClubContext; initialRows: DBSiteSponsorLogo[] }) {
  const router = useRouter();
  const back = useTabBack();
  const footerShown = codeSiteAdminFor(club)?.sponsors.showFooterPlacement !== false;
  const canSave = canMutateContent(club);
  const savedText = savedLabel(websiteState(club));

  const [rows, setRows] = useState<DBSiteSponsorLogo[]>(initialRows);
  const [drafts, setDrafts] = useState<SponsorDraft[]>(() => initialRows.map(sponsorDraftFromRow));
  // Cards added since the last save: they say why a full place is greyed.
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  const [blurry, setBlurry] = useState<Readonly<Record<string, boolean>>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keySeed = useRef(0);

  const diff = useMemo(() => diffSponsorList(rows, drafts), [rows, drafts]);
  const changeCount = diff.toDelete.length + diff.toInsert.length + diff.toUpdate.length;
  const dirty = changeCount > 0;
  const busy = save === "busy" || uploading !== null;
  const counts = sponsorListCounts(drafts);
  const homepageFull = counts.homepage >= MAX_CAROUSEL_SPONSORS;
  const footerFull = counts.footer >= MAX_FOOTER_SPONSORS;

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function touched() {
    setMessage(null);
    if (save === "done") setSave("idle");
  }

  function change(key: string, update: (sponsor: SponsorDraft) => SponsorDraft, field?: "name" | "website") {
    setDrafts((current) => current.map((sponsor) => (sponsor.key === key ? update(sponsor) : sponsor)));
    if (field) setErrors((current) => ({ ...current, [key]: { ...current[key], [field]: undefined } }));
    touched();
  }

  function move(key: string, delta: -1 | 1) {
    setDrafts((current) => {
      const from = current.findIndex((sponsor) => sponsor.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    touched();
  }

  function remove(key: string) {
    const sponsor = drafts.find((candidate) => candidate.key === key);
    setDrafts((current) => current.filter((candidate) => candidate.key !== key));
    touched();
    // A logo uploaded on this visit and never saved has no row to keep it.
    if (sponsor && sponsor.id === null) void deleteSponsorStorageUrls([sponsor.logo_url]).catch(() => undefined);
  }

  /** Which files can be added, and why the others can't. */
  function screen(files: File[]): { ok: File[]; problems: string[] } {
    const room = Math.max(0, MAX_LISTED - drafts.length);
    const ok: File[] = [];
    const problems: string[] = [];
    for (const file of files) {
      if (!isGraphicUploadType(file.type)) problems.push(`${file.name} is not a ${GRAPHIC_UPLOAD_TYPES_LABEL} picture.`);
      else if (file.size > MAX_LOGO_BYTES) problems.push(`${file.name} is bigger than 5 MB.`);
      else if (ok.length >= room) problems.push(`You can list up to ${MAX_LISTED} sponsors.`);
      else ok.push(file);
    }
    return { ok, problems: [...new Set(problems)] };
  }

  async function addFiles(list: FileList | File[] | null) {
    if (!list || busy || !canSave) return;
    const { ok, problems } = screen(Array.from(list));
    setMessage(problems.length ? problems.join(" ") : null);
    if (save === "done") setSave("idle");
    if (!ok.length) return;
    const fresh: SponsorDraft[] = [];
    let homepage = counts.homepage;
    let footer = counts.footer;
    try {
      for (const file of ok) {
        const name = sponsorNameFromFile(file.name) || "Sponsor";
        setUploading(name);
        const logo = await uploadSponsorLogo(file, "list");
        const onHomepage = homepage < MAX_CAROUSEL_SPONSORS;
        const inFooter = footerShown && footer < MAX_FOOTER_SPONSORS;
        if (onHomepage) homepage += 1;
        if (inFooter) footer += 1;
        keySeed.current += 1;
        fresh.push({
          key: `new-${keySeed.current}`,
          id: null,
          name,
          logo_url: logo,
          website: "",
          homepage: onHomepage,
          footer: inFooter,
        });
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "That logo could not be uploaded. Try again.");
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = "";
    }
    if (fresh.length) {
      setDrafts((current) => [...current, ...fresh]);
      setAdded((current) => new Set([...current, ...fresh.map((sponsor) => sponsor.key)]));
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-sponsor-key="${fresh[0].key}"] input`)?.focus({ preventScroll: false }),
      );
    }
  }

  async function replaceLogo(list: FileList | null) {
    const key = replacing.current;
    replacing.current = null;
    const file = list?.[0];
    if (replaceInput.current) replaceInput.current.value = "";
    const sponsor = drafts.find((candidate) => candidate.key === key);
    if (!file || !sponsor || busy) return;
    const { ok, problems } = screen([file]);
    // Replacing never adds a sponsor, so the list limit does not apply.
    if (!ok.length && problems.some((problem) => !problem.startsWith("You can list"))) {
      setMessage(problems.join(" "));
      return;
    }
    setUploading(sponsor.name || "the new logo");
    try {
      const logo = await uploadSponsorLogo(file, "list");
      const previous = sponsor.logo_url;
      change(sponsor.key, (current) => ({ ...current, logo_url: logo }));
      const saved = rows.find((row) => row.id === sponsor.id);
      // Only a file this visit uploaded is deleted now; a saved one waits for Save.
      if (!saved || saved.logo_url !== previous) void deleteSponsorStorageUrls([previous]).catch(() => undefined);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "That logo could not be uploaded. Try again.");
    } finally {
      setUploading(null);
    }
  }

  const noteSize = useCallback((url: string, width: number, height: number) => {
    if (!width || !height) return;
    const soft = Math.min(STRIP_BOX.width / width, STRIP_BOX.height / height) > BLURRY_SCALE;
    setBlurry((current) => (current[url] === soft ? current : { ...current, [url]: soft }));
  }, []);

  /** True when everything is saved. */
  async function saveAll(): Promise<boolean> {
    if (busy || !canSave || !dirty) return false;
    const problems = sponsorListProblems(drafts, footerShown);
    if (problems.fields.length) {
      const next: FieldErrors = {};
      for (const problem of problems.fields) next[problem.key] = { ...next[problem.key], [problem.field]: problem.message };
      setErrors(next);
      setMessage("Fix the highlighted answers, then save.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return false;
    }
    if (problems.homepageOver || problems.footerOver) {
      setMessage(
        problems.homepageOver
          ? `Your homepage can show ${MAX_CAROUSEL_SPONSORS} sponsors. Turn Homepage off for ${plural(counts.homepage - MAX_CAROUSEL_SPONSORS, "sponsor", "sponsors")}.`
          : `Your footer can show ${MAX_FOOTER_SPONSORS} sponsors. Turn Footer off for ${plural(counts.footer - MAX_FOOTER_SPONSORS, "sponsor", "sponsors")}.`,
      );
      return false;
    }

    setSave("busy");
    setMessage(null);
    setErrors({});
    const supabase = createClient();
    const { toDelete, toInsert, toUpdate } = diff;
    let failed = false;
    let nextDrafts = drafts;
    try {
      if (toDelete.length) {
        const result = await supabase.from("site_sponsor_logos").delete().in("id", toDelete.map((row) => row.id));
        if (result.error) throw new Error(result.error.message);
      }
      for (const update of toUpdate) {
        const result = await supabase.from("site_sponsor_logos").update(update.changes).eq("id", update.id);
        if (result.error) throw new Error(result.error.message);
      }
      if (toInsert.length) {
        const result = await supabase.from("site_sponsor_logos").insert(toInsert).select("id");
        if (result.error) throw new Error(result.error.message);
        // The new rows' ids, in the order sent, so a retry never adds them twice.
        const ids = ((result.data ?? []) as { id: string }[]).map((row) => row.id);
        let at = 0;
        nextDrafts = drafts.map((sponsor) => (sponsor.id === null && ids[at] ? { ...sponsor, id: ids[at++] } : sponsor));
      }
    } catch {
      failed = true;
    }

    const replaced = toUpdate.flatMap((update) => {
      const row = rows.find((candidate) => candidate.id === update.id);
      return update.changes.logo_url !== undefined && row ? [row.logo_url] : [];
    });
    if (!failed) {
      void deleteUnusedSponsorStorageUrls([...toDelete.map((row) => row.logo_url), ...replaced]).catch(() => undefined);
    }

    try {
      const fresh = await fetchSponsorList(club.id);
      setRows(fresh);
      if (!failed) {
        setDrafts(fresh.map(sponsorDraftFromRow));
        setAdded(new Set());
      } else {
        setDrafts(nextDrafts);
      }
    } catch {
      setDrafts(nextDrafts);
      if (!failed) {
        setMessage("Saved. Refresh the page to see your sponsors as they are now.");
      }
    }

    if (failed) {
      setSave("idle");
      setMessage("Some changes could not be saved. Check your internet connection and try again.");
      return false;
    }
    setSave("done");
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setSave("idle"), DONE_MS);
    return true;
  }

  function goBack() {
    if (dirty && !busy) setLeaving(back.href);
    else router.push(back.href);
  }
  useLeaveGuard(dirty && save !== "busy" ? (href: string) => setLeaving(href) : null);

  const countsLine = (
    <p className={styles.counts} data-testid="sponsors-counts">
      <span className={styles.count} data-full={homepageFull || undefined}>
        Homepage {counts.homepage.toLocaleString("en-US")} of {MAX_CAROUSEL_SPONSORS}
      </span>
      {footerShown ? (
        <span className={styles.count} data-full={footerFull || undefined}>
          Footer {counts.footer.toLocaleString("en-US")} of {MAX_FOOTER_SPONSORS}
        </span>
      ) : null}
    </p>
  );

  const addButton = (variant: "button" | "tile") => (
    <button
      type="button"
      className={variant === "tile" ? styles.addTile : styles.addButton}
      data-over={(variant === "tile" && dragOver) || undefined}
      data-testid={variant === "tile" ? "sponsors-add-tile" : "sponsors-add"}
      disabled={!canSave || busy || drafts.length >= MAX_LISTED}
      onClick={() => fileInput.current?.click()}
      onDragOver={
        variant === "tile"
          ? (event) => {
              if (!canSave || busy) return;
              event.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={variant === "tile" ? () => setDragOver(false) : undefined}
      onDrop={
        variant === "tile"
          ? (event) => {
              event.preventDefault();
              setDragOver(false);
              void addFiles(event.dataTransfer.files);
            }
          : undefined
      }
    >
      <span className={styles.addIcon} aria-hidden="true">
        {uploading ? <Spinner className="size-4" /> : <IconAdd className="size-[18px]" />}
      </span>
      <span className={styles.addText}>
        <span className={styles.addTitle}>{uploading ? `Adding ${uploading}…` : "Add sponsors"}</span>
        {variant === "tile" ? (
          <span className={styles.addHint}>
            Drop logos here or pick files. {GRAPHIC_UPLOAD_TYPES_LABEL}, up to 5 MB.
          </span>
        ) : null}
      </span>
    </button>
  );

  return (
    <div className={styles.page} data-admin-page="sponsors">
      <TopBarTakeover>
        <div className={barStyles.editBar} data-testid="sponsors-bar">
          <div className={barStyles.editBarLead}>
            <Link
              href={back.href}
              className={barStyles.back}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                goBack();
              }}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              {back.label}
            </Link>
            <span className={barStyles.editBarRule} aria-hidden="true" />
            <IconSponsors className={barStyles.editBarPencil} aria-hidden="true" />
            <p className={barStyles.editBarTitle}>Sponsors</p>
          </div>
          <div className={barStyles.editBarEnd}>
            {save !== "done" ? (
              <p
                className={barStyles.editBarStatus}
                role="status"
                aria-live="off"
                data-dirty={dirty || undefined}
                data-testid="sponsors-status"
              >
                {dirty ? (
                  <>
                    <span className={barStyles.editBarLong}>{plural(changeCount, "change", "changes")} not saved yet</span>
                    <span className={barStyles.editBarShort}>Not saved yet</span>
                  </>
                ) : (
                  <span className={barStyles.editBarLong}>Nothing to save yet</span>
                )}
              </p>
            ) : null}
            <button
              type="button"
              className={barStyles.editBarSave}
              data-testid="sponsors-save"
              data-state={save === "busy" ? "saving" : save === "done" ? "saved" : "idle"}
              disabled={!canSave || busy || (!dirty && save !== "done")}
              onClick={() => void saveAll()}
            >
              {save === "busy" ? (
                <>
                  <Spinner className="size-4" />
                  Saving…
                </>
              ) : save === "done" ? (
                <>
                  <IconSuccess className="size-4" aria-hidden="true" />
                  {savedText}
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </TopBarTakeover>

      <PageHead>{countsLine}</PageHead>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {save === "done" ? savedText : uploading ? `Adding ${uploading}` : ""}
      </p>
      {message ? (
        <p className={styles.alert} role="alert" data-testid="sponsors-message">
          {message}
        </p>
      ) : null}
      {!canSave ? (
        <p className={styles.notice}>Changes to your website are paused right now, so changes can’t be saved.</p>
      ) : null}

      <div className={styles.phoneAdd}>{addButton("button")}</div>

      <fieldset className={styles.list} disabled={!canSave || save === "busy"} aria-label="Your sponsors">
        {drafts.length === 0 ? (
          <p className={styles.empty} data-testid="sponsors-empty">
            No sponsors yet
          </p>
        ) : null}
        {drafts.map((sponsor, index) => {
          const fieldErrors = errors[sponsor.key] ?? {};
          const homepageLocked = !sponsor.homepage && homepageFull;
          const footerLocked = !sponsor.footer && footerFull;
          const isNew = added.has(sponsor.key);
          const shownNowhere = !sponsor.homepage && !(footerShown && sponsor.footer);
          const website = normalizeSponsorWebsite(sponsor.website);
          const websiteShown =
            editingWebsite === sponsor.key || !website.ok || !website.value
              ? sponsor.website
              : sponsorWebsiteDomain(website.value, 40);
          const nameId = `sponsor-${sponsor.key}-name`;
          const webId = `sponsor-${sponsor.key}-web`;
          const notesId = `sponsor-${sponsor.key}-notes`;
          const nameCount = characterCount(sponsor.name);
          return (
            <article
              key={sponsor.key}
              className={styles.card}
              data-new={isNew || undefined}
              data-sponsor-key={sponsor.key}
              data-testid="sponsor-card"
              aria-label={sponsor.name.trim() || `Sponsor ${index + 1}`}
            >
              <div className={styles.well}>
                <ResilientNativeImage
                  src={sponsor.logo_url}
                  alt={sponsor.name.trim() ? `${sponsor.name.trim()} logo` : "Sponsor logo"}
                  fallback={<span className={styles.noLogo}>Can’t show this logo</span>}
                  onLoad={(event) =>
                    noteSize(sponsor.logo_url, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                  }
                />
              </div>
              <div className={styles.main}>
                <div className={styles.nameRow}>
                  <label htmlFor={nameId} className={styles.srOnly}>
                    Sponsor name
                  </label>
                  <input
                    id={nameId}
                    className={styles.nameInput}
                    value={sponsor.name}
                    maxLength={SPONSOR_NAME_LIMIT}
                    placeholder="Sponsor name"
                    autoComplete="off"
                    aria-invalid={fieldErrors.name ? true : undefined}
                    aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
                    title={sponsor.name}
                    data-testid="sponsor-name"
                    onChange={(event) => change(sponsor.key, (current) => ({ ...current, name: event.target.value }), "name")}
                  />
                  <CardMenu
                    name={sponsor.name.trim() || `Sponsor ${index + 1}`}
                    first={index === 0}
                    last={index === drafts.length - 1}
                    disabled={!canSave || busy}
                    onMove={(delta) => move(sponsor.key, delta)}
                    onReplace={() => {
                      replacing.current = sponsor.key;
                      replaceInput.current?.click();
                    }}
                    onRemove={() => remove(sponsor.key)}
                  />
                </div>
                {nameCount >= SPONSOR_NAME_LIMIT - 10 ? (
                  <span className={styles.counter} data-near={nameCount >= SPONSOR_NAME_LIMIT || undefined}>
                    {nameCount} of {SPONSOR_NAME_LIMIT}
                  </span>
                ) : null}
                {fieldErrors.name ? (
                  <p id={`${nameId}-error`} className={styles.fieldError} role="alert">
                    {fieldErrors.name}
                  </p>
                ) : null}

                <div className={styles.webField} data-invalid={fieldErrors.website ? true : undefined}>
                  <IconGlobe className={styles.webIcon} aria-hidden="true" />
                  <label htmlFor={webId} className={styles.srOnly}>
                    Their website
                  </label>
                  <input
                    id={webId}
                    className={styles.webInput}
                    value={websiteShown}
                    maxLength={SPONSOR_WEBSITE_LIMIT}
                    placeholder="Their website"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    title={sponsor.website || undefined}
                    aria-invalid={fieldErrors.website ? true : undefined}
                    aria-describedby={fieldErrors.website ? `${webId}-error` : undefined}
                    data-testid="sponsor-website"
                    onFocus={() => setEditingWebsite(sponsor.key)}
                    onBlur={() => setEditingWebsite((current) => (current === sponsor.key ? null : current))}
                    onChange={(event) =>
                      change(sponsor.key, (current) => ({ ...current, website: event.target.value }), "website")
                    }
                  />
                </div>
                {fieldErrors.website ? (
                  <p id={`${webId}-error`} className={styles.fieldError} role="alert">
                    {fieldErrors.website}
                  </p>
                ) : null}

                <div className={styles.switches} aria-describedby={notesId}>
                  <Toggle
                    label="Homepage"
                    checked={sponsor.homepage}
                    locked={homepageLocked}
                    testId="sponsor-homepage"
                    onChange={(on) => change(sponsor.key, (current) => ({ ...current, homepage: on }))}
                  />
                  {footerShown ? (
                    <Toggle
                      label="Footer"
                      checked={sponsor.footer}
                      locked={footerLocked}
                      testId="sponsor-footer"
                      onChange={(on) => change(sponsor.key, (current) => ({ ...current, footer: on }))}
                    />
                  ) : null}
                </div>
              </div>
              <div className={styles.notes} id={notesId}>
                {isNew && homepageLocked ? (
                  <span className={styles.note}>Homepage is full ({counts.homepage} of {MAX_CAROUSEL_SPONSORS})</span>
                ) : null}
                {isNew && footerShown && footerLocked ? (
                  <span className={styles.note}>Footer is full ({counts.footer} of {MAX_FOOTER_SPONSORS})</span>
                ) : null}
                {shownNowhere ? <span className={styles.note}>Not on your website right now</span> : null}
                {blurry[sponsor.logo_url] ? (
                  <span className={styles.note} data-tone="warn" data-testid="sponsor-blurry">
                    <IconWarning className="size-3.5 shrink-0" aria-hidden="true" />
                    This logo may look blurry. Ask them for a bigger one.
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
        <div className={styles.tileSlot}>{addButton("tile")}</div>
      </fieldset>

      <input
        ref={fileInput}
        type="file"
        accept={GRAPHIC_UPLOAD_ACCEPT}
        multiple
        className={styles.hiddenInput}
        aria-label="Choose sponsor logo files"
        data-testid="sponsors-file-input"
        tabIndex={-1}
        onChange={(event) => void addFiles(event.target.files)}
      />
      <input
        ref={replaceInput}
        type="file"
        accept={GRAPHIC_UPLOAD_ACCEPT}
        className={styles.hiddenInput}
        aria-label="Choose a new logo file"
        data-testid="sponsors-replace-input"
        tabIndex={-1}
        onChange={(event) => void replaceLogo(event.target.files)}
      />

      <Preview drafts={drafts} footerShown={footerShown} />

      <AdminModal
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        className={styles.leaveDialog}
        backdropClassName={styles.backdrop}
        aria-labelledby="sponsors-leave-title"
      >
        <h2 id="sponsors-leave-title" className={styles.dialogTitle}>
          Save your changes first?
        </h2>
        <p className={styles.dialogText}>
          {changeCount === 1 ? "1 change is" : `${changeCount.toLocaleString("en-US")} changes are`} not saved yet.
        </p>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={async () => {
              const ok = await saveAll();
              const to = leaving;
              setLeaving(null);
              if (ok && to) router.push(to);
            }}
          >
            Save and continue
          </button>
          <button type="button" className={styles.secondary} onClick={() => setLeaving(null)}>
            Keep editing
          </button>
          <button type="button" className={styles.secondary} onClick={() => router.push(leaving ?? back.href)}>
            Leave without saving
          </button>
        </div>
      </AdminModal>
    </div>
  );
}

function Toggle({
  label,
  checked,
  locked,
  testId,
  onChange,
}: {
  label: string;
  checked: boolean;
  /** Off, and its place is full: it can't be turned on until another sponsor makes room. */
  locked: boolean;
  testId: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={styles.toggle} data-locked={locked || undefined}>
      <Switch.Root
        className={styles.switch}
        checked={checked}
        disabled={locked}
        onCheckedChange={(on) => onChange(on)}
        data-testid={testId}
        title={locked ? `${label} is full` : undefined}
      >
        <Switch.Thumb className={styles.thumb} />
      </Switch.Root>
      <span>{label}</span>
    </label>
  );
}

function CardMenu({
  name,
  first,
  last,
  disabled,
  onMove,
  onReplace,
  onRemove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  // Popups render inside the admin wrapper so the admin's theme colors apply.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".admin-portal"));
  }, []);
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.more} aria-label={`More for ${name}`} disabled={disabled} data-testid="sponsor-more">
        <IconMore className="size-[18px]" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className={styles.menuPositioner}>
          <Menu.Popup className={styles.menu}>
            <Menu.Item className={styles.menuItem} disabled={first} onClick={() => onMove(-1)} data-testid="sponsor-move-left">
              <IconCaretLeft aria-hidden="true" />
              Move left
            </Menu.Item>
            <Menu.Item className={styles.menuItem} disabled={last} onClick={() => onMove(1)} data-testid="sponsor-move-right">
              <IconCaretRight aria-hidden="true" />
              Move right
            </Menu.Item>
            <Menu.Item className={styles.menuItem} onClick={onReplace} data-testid="sponsor-replace">
              <IconUpload aria-hidden="true" />
              Replace logo
            </Menu.Item>
            <div className={styles.menuRule} role="separator" />
            <Menu.Item className={styles.menuItem} data-tone="danger" onClick={onRemove} data-testid="sponsor-remove">
              <IconDelete aria-hidden="true" />
              Remove
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** What visitors see: the homepage strip and, where the footer shows sponsors, the footer line. */
function Preview({ drafts, footerShown }: { drafts: readonly SponsorDraft[]; footerShown: boolean }) {
  const homepage = drafts.filter((sponsor) => sponsor.homepage);
  const footer = drafts.filter((sponsor) => sponsor.footer);
  const chips = (list: readonly SponsorDraft[], empty: string, testId: string) => (
    <div className={styles.chips} data-testid={testId}>
      {list.length ? (
        list.map((sponsor) => (
          <span key={sponsor.key} className={styles.chip} title={sponsor.name}>
            <ResilientNativeImage
              src={sponsor.logo_url}
              alt={sponsor.name}
              fallback={<span className={styles.chipName}>{sponsor.name.trim() || "Sponsor"}</span>}
            />
          </span>
        ))
      ) : (
        <span className={styles.chipsEmpty}>{empty}</span>
      )}
    </div>
  );
  return (
    <section className={styles.preview} aria-labelledby="sponsors-preview-h">
      <h2 id="sponsors-preview-h" className={styles.previewTitle}>
        On your website
      </h2>
      <div className={styles.previewRow}>
        <span className={styles.previewLabel}>Homepage</span>
        {chips(homepage, "No sponsors on your homepage", "sponsors-preview-homepage")}
      </div>
      {footerShown ? (
        <div className={styles.previewRow}>
          <span className={styles.previewLabel}>Footer</span>
          {chips(footer, "No sponsors in your footer", "sponsors-preview-footer")}
        </div>
      ) : null}
    </section>
  );
}
