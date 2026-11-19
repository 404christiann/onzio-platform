"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { heldSaveState, EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, SectionCards, SectionCardsSkeleton, ValidationMessage, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { aboutStoragePathFromPublicUrl } from "@/lib/about-content";
import type { AboutEditorSaveRequest, AboutEditorSnapshot } from "@/lib/about-editor/contract";
import { loadAboutEditor, saveAboutEditor } from "@/lib/about-editor/recovery";
import { uploadAboutImage } from "@/lib/about-editor/upload";
import type { SiteRouteOption } from "@/lib/site-routes";
import { DISCARD_CONFIRM } from "../../editor-copy";
import styles from "./AboutEditor.module.css";
import { AboutSectionFields, type AboutFieldsApi, type UploadTarget } from "./AboutSectionFields";
import {
  PAGE_LABELS, PAGE_PATHS, SECTIONS, aboutFieldErrors, aboutPageState, acceptedDestinations, buildAboutSaveRequest, changedSections, draftFromSnapshot,
  errorSection, firstErrorSection, pageFingerprint, pageOfSection, sectionChip, sectionSummary,
  type AboutDraft, type AboutDrafts, type AboutErrors, type AboutPageId, type LogoDraft, type SectionId,
} from "./about-sections";

const PAGES: readonly AboutPageId[] = ["about", "logo"];
const CRUMBS = [{ label: "Website" }, { label: "Pages", href: "/admin/website-pages" as const }];
const DESCRIPTION = "Your About page and your Club Logo page. Save publishes the page you are on.";
const blank = (): AboutDrafts => ({ about: draftFromSnapshot(undefined) as AboutDraft, logo: draftFromSnapshot({ page: "logo", revision: "0", designRevision: "", content: null }) as LogoDraft });
const none = <T,>(): Record<AboutPageId, T | undefined> => ({ about: undefined, logo: undefined });
const flags = (): Record<AboutPageId, boolean> => ({ about: false, logo: false });

/**
 * Rose City's About editor: the About page and the Club Logo page as section cards, one two-pane dialog, one Save.
 * Each page keeps its own draft, revision and request, so Save publishes the page you are on and each request
 * body is the one the classic editor sent.
 */
export default function RoseCityAboutEditor() {
  const [page, setPage] = useState<AboutPageId>("about");
  const [snapshots, setSnapshots] = useState<Record<AboutPageId, AboutEditorSnapshot | undefined>>(none);
  const [drafts, setDrafts] = useState<AboutDrafts | null>(null);
  const [saved, setSaved] = useState<AboutDrafts>(blank);
  const [retired, setRetired] = useState<Record<AboutPageId, string[]>>({ about: [], logo: [] });
  const [pending, setPending] = useState<Record<AboutPageId, AboutEditorSaveRequest | undefined>>(none);
  const [conflict, setConflict] = useState(flags);
  const [saveFailed, setSaveFailed] = useState(flags);
  const [cleanup, setCleanup] = useState<Record<AboutPageId, string | undefined>>(none);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaPending, setMediaPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [validation, setValidation] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [options, setOptions] = useState<SiteRouteOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<SectionId>();
  const latest = useRef({ drafts, snapshots, pending, retired, busy, uploading, mediaPending, conflict });
  latest.current = { drafts, snapshots, pending, retired, busy, uploading, mediaPending, conflict };

  const loading = !drafts || !snapshots.about || !snapshots.logo;
  const dirty = useMemo(() => ({
    about: !!drafts && pageFingerprint("about", drafts) !== pageFingerprint("about", saved),
    logo: !!drafts && pageFingerprint("logo", drafts) !== pageFingerprint("logo", saved),
  }), [drafts, saved]);
  const unsaved = (id: AboutPageId) => dirty[id] || !!pending[id];
  const locked = busy || uploading || !!pending[page] || conflict[page];
  const destinationAvailable = options.some(option => option.href === drafts?.about.closing_cta_href);
  const errors: AboutErrors = useMemo(() => showErrors && drafts ? aboutFieldErrors(drafts.about, { loaded: optionsLoaded, available: destinationAvailable }) : {}, [showErrors, drafts, optionsLoaded, destinationAvailable]);

  useEffect(() => {
    let active = true;
    setSnapshots(none()); setDrafts(null); setLoadFailed(false); setMessage(""); setFailed(false);
    Promise.all([loadAboutEditor("about"), loadAboutEditor("logo")]).then(([about, logo]) => {
      if (!active) return;
      const next = { about: draftFromSnapshot(about) as AboutDraft, logo: draftFromSnapshot(logo) as LogoDraft };
      setSnapshots({ about, logo }); setDrafts(next); setSaved({ about: draftFromSnapshot(about) as AboutDraft, logo: draftFromSnapshot(logo) as LogoDraft });
      setRetired({ about: [], logo: [] }); setPending(none()); setConflict(flags()); setSaveFailed(flags()); setCleanup(none());
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load the About pages."); setFailed(true); setLoadFailed(true); } });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    let active = true;
    setOptionsLoaded(false); setOptionsError(null);
    fetch("/api/admin/about-destinations", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Available button destinations could not be loaded");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("options" in result) || !Array.isArray(result.options)) throw new Error("Available button destinations could not be loaded");
      return result.options.filter((option: unknown): option is SiteRouteOption => !!option && typeof option === "object" && "href" in option && typeof option.href === "string" && "label" in option && typeof option.label === "string");
    }).then(loaded => { if (active) { setOptions(acceptedDestinations(loaded)); setOptionsLoaded(true); } })
      .catch((error: unknown) => { if (active) setOptionsError(error instanceof Error ? error.message : "Available pages could not be loaded"); });
    return () => { active = false; };
  }, [optionsAttempt]);

  useEffect(() => {
    if (!dirty.about && !dirty.logo && !pending.about && !pending.logo && !uploading && !mediaPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending, uploading, mediaPending]);

  const clean = () => { setMessage(""); setFailed(false); setValidation(""); setSaveFailed(flags()); };
  const setAbout = useCallback((edit: (draft: AboutDraft) => AboutDraft) => {
    if (latest.current.busy) return;
    setDrafts(current => current && { ...current, about: edit(current.about) }); clean();
  }, []);
  const setLogo = useCallback((edit: (draft: LogoDraft) => LogoDraft) => {
    if (latest.current.busy) return;
    setDrafts(current => current && { ...current, logo: edit(current.logo) }); clean();
  }, []);
  const retire = useCallback((target: AboutPageId, url: string) => {
    if (!aboutStoragePathFromPublicUrl(url)) return;
    setRetired(current => current[target].includes(url) ? current : { ...current, [target]: [...current[target], url] });
  }, []);

  /** Puts a page back to the snapshot it was loaded from (after a save, a reload or a discard). */
  function accept(snapshot: AboutEditorSnapshot) {
    const target = snapshot.page;
    setSnapshots(current => ({ ...current, [target]: snapshot }));
    setDrafts(current => current && { ...current, [target]: draftFromSnapshot(snapshot) });
    setSaved(current => ({ ...current, [target]: draftFromSnapshot(snapshot) }));
    setRetired(current => ({ ...current, [target]: [] }));
    setPending(current => ({ ...current, [target]: undefined }));
    setConflict(current => ({ ...current, [target]: false }));
    setSaveFailed(current => ({ ...current, [target]: false }));
  }

  async function upload(target: UploadTarget, file: File): Promise<boolean> {
    const current = latest.current.drafts;
    if (!current || latest.current.busy || latest.current.uploading) return false;
    setUploading(true); setFailed(false); setStatus("Adding your image…");
    try {
      const index = target.kind === "logoColorCard" ? current.logo.color_cards.findIndex(card => card._id === target.id) : 0;
      const stable = target.kind === "logoColorCard" ? `content/club-logo-colors/color-${index + 1}.png` : undefined;
      const url = await uploadAboutImage(file, stable, target.kind === "aboutFeature" ? "photo" : "graphic");
      if (target.kind === "aboutFeature") { retire("about", current.about.feature_image_url); setAbout(draft => ({ ...draft, feature_image_url: url })); }
      else if (target.kind === "logoAnnotated") { retire("logo", current.logo.annotated_image_url); setLogo(draft => ({ ...draft, annotated_image_url: url })); }
      else if (target.kind === "logoMap") { retire("logo", current.logo.map_image_url); setLogo(draft => ({ ...draft, map_image_url: url })); }
      else if (target.kind === "logoColorCard") {
        const old = current.logo.color_cards[index]?.image_url;
        if (old && aboutStoragePathFromPublicUrl(old) !== stable) retire("logo", old);
        setLogo(draft => ({ ...draft, color_cards: draft.color_cards.map(card => card._id === target.id ? { ...card, image_url: url } : card) }));
      } else {
        const field = target.kind === "logoFeaturePatch" ? "patch_url" : "icon_url";
        const old = current.logo.features.find(feature => feature._id === target.id)?.[field];
        if (old) retire("logo", old);
        setLogo(draft => ({ ...draft, features: draft.features.map(feature => feature._id === target.id ? { ...feature, [field]: url } : feature) }));
      }
      setStatus("Image ready. Save the page to use it.");
      return true;
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Upload failed"); return false; }
    finally { setUploading(false); }
  }

  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(target: AboutPageId = page): Promise<boolean> {
    const now = latest.current;
    if (!now.drafts || now.busy || now.uploading || now.mediaPending || now.conflict[target]) return false;
    const snapshot = now.snapshots[target];
    if (!snapshot) return false;
    const pendingRequest = now.pending[target] ?? null;
    if (!pendingRequest && target === "about") {
      const found = aboutFieldErrors(now.drafts.about, { loaded: optionsLoaded, available: destinationAvailable });
      const first = firstErrorSection(found);
      if (first) {
        setShowErrors(true); setSaveFailed(current => ({ ...current, about: true })); setValidation("Review the highlighted fields before saving.");
        dialog.openSection(first);
        return false;
      }
    }
    let request: AboutEditorSaveRequest;
    try {
      request = buildAboutSaveRequest({ page: target, pending: pendingRequest, operationId: crypto.randomUUID(), snapshot, drafts: now.drafts, retiredMediaUrls: now.retired[target], now: new Date().toISOString() });
    } catch (error) {
      setSaveFailed(current => ({ ...current, [target]: true })); setFailed(true); setMessage(error instanceof Error ? error.message : "Review the page fields and try again.");
      return false;
    }
    setBusy(true); latest.current.busy = true; setFailed(false); setValidation(""); setMessage(""); setStatus(`Saving ${PAGE_LABELS[target]}…`);
    try {
      const outcome = await saveAboutEditor(request);
      if (outcome.status === "committed") {
        accept(outcome.snapshot); setShowErrors(false); setStatus(`${PAGE_LABELS[target]} saved.`);
        if (outcome.snapshot.cleanupPending) {
          setCleanup(current => ({ ...current, [target]: request.operationId }));
          setFailed(true); setMessage("Page saved. Old image cleanup is pending; retry cleanup when ready.");
        }
        return true;
      }
      if (outcome.status === "uncertain") { setPending(current => ({ ...current, [target]: outcome.request })); setFailed(true); setMessage(outcome.message); }
      else {
        setPending(current => ({ ...current, [target]: undefined }));
        if (outcome.status === "conflict") setConflict(current => ({ ...current, [target]: true }));
        else setSaveFailed(current => ({ ...current, [target]: true }));
        setFailed(true); setMessage(outcome.message);
      }
      return false;
    } finally { latest.current.busy = false; setBusy(false); }
  }

  /** Leaving the page saves every page with edits, About first. A failure brings that page into view. */
  async function saveAll(): Promise<boolean> {
    for (const target of PAGES) {
      const current = latest.current;
      if (!current.drafts) return false;
      const edited = pageFingerprint(target, current.drafts) !== pageFingerprint(target, saved) || !!current.pending[target];
      if (edited && !(await save(target))) { setPage(target); return false; }
    }
    return true;
  }

  async function reload(keepDraft = false) {
    if (busy || uploading) return;
    setBusy(true);
    try {
      const loaded = await loadAboutEditor(page);
      if (keepDraft) {
        // The latest revision becomes the base and the edits stay.
        setSnapshots(current => ({ ...current, [page]: loaded }));
        setSaved(current => ({ ...current, [page]: draftFromSnapshot(loaded) }));
        setConflict(current => ({ ...current, [page]: false })); setSaveFailed(current => ({ ...current, [page]: false })); setPending(current => ({ ...current, [page]: undefined }));
        setFailed(false); setMessage("Latest saved version loaded. Your edits were kept. Review the page before saving again.");
      } else { accept(loaded); setFailed(false); setMessage(""); setShowErrors(false); setValidation(""); }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Latest page could not be loaded."); }
    finally { setBusy(false); }
  }

  async function retryCleanup() {
    const operation = cleanup[page];
    if (!operation) return;
    setBusy(true);
    try {
      const loaded = await loadAboutEditor(page, operation);
      if (loaded.operation?.status !== "committed") throw new Error("Cleanup could not be confirmed. Try again.");
      if (!loaded.operation.receipt.cleanupPending) { setCleanup(current => ({ ...current, [page]: undefined })); setFailed(false); setMessage(""); }
      else { setFailed(true); setMessage("Page saved. Old image cleanup is still pending; retry cleanup when ready."); }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Cleanup could not be confirmed."); }
    finally { setBusy(false); }
  }

  /** Discard asks first when there are unsaved edits, and reloads the page you are on. */
  function requestDiscard() {
    if (busy || uploading) return;
    if (pending[page]) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty[page]) setConfirmReload(true);
    else void reload();
  }

  const saveAction = useSaveState({
    isDirty: unsaved(page),
    onSave: async () => { if (!(await save())) throw new Error(`${PAGE_LABELS[page]} was not saved.`); },
  });
  const latestSaveAll = useRef(saveAll);
  latestSaveAll.current = saveAll;
  useUnsavedGuard(drafts ? {
    dirty: unsaved("about") || unsaved("logo") || uploading || mediaPending, edited: "About and Club Logo pages", onSave: () => latestSaveAll.current(),
    onDiscard: () => {
      if (busy || uploading || mediaPending) throw new Error("Wait for the current image or save to finish before discarding.");
      for (const snapshot of Object.values(latest.current.snapshots)) if (snapshot) accept(snapshot);
      setMessage(""); setFailed(false); setValidation(""); setShowErrors(false);
    },
  } : undefined);

  function switchPage(next: AboutPageId) {
    if (next === page || busy || uploading) return;
    setPage(next); setMessage(""); setFailed(false); setValidation(""); setShowErrors(false);
  }

  const pageState = aboutPageState({ base: heldSaveState(saveAction.state, uploading || mediaPending), busy, pending: !!pending[page], conflict: conflict[page], saveFailed: saveFailed[page] });
  const changed = useMemo(() => new Set(drafts ? changedSections(drafts, saved) : []), [drafts, saved]);
  const errorSections = useMemo(() => new Set<SectionId>(Object.keys(errors).map(path => errorSection(path))), [errors]);
  const items = drafts ? SECTIONS[page].map(section => ({
    id: section.id, title: section.title, disabled: locked, chip: sectionChip(drafts, section.id),
    summary: <>
      {sectionSummary(drafts, section.id)}
      {changed.has(section.id) && <span className={styles.srOnly}> (unsaved changes)</span>}
      {errorSections.has(section.id) && <span className={styles.srOnly}> (needs attention)</span>}
    </>,
  })) : [];
  const api: AboutFieldsApi | null = drafts ? {
    drafts, locked, uploading, errors, setAbout, setLogo, retire, upload, onMediaPending: setMediaPending,
    destinations: { options, loaded: optionsLoaded, available: destinationAvailable, error: optionsError, retry: () => setOptionsAttempt(current => current + 1) },
  } : null;

  const notice = (message || validation || conflict[page] || conflict[page === "about" ? "logo" : "about"]) ? <div className={styles.notice} data-about-notice="">
    {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
    {(message || conflict[page]) && <EditorNotice failed={failed || conflict[page]}>{message}
      {conflict[page] && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className={`admin-press ${styles.keep}`} disabled={busy || uploading} onClick={() => void reload(true)}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={busy || uploading} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
      {cleanup[page] && <span className={styles.noticeActions}><EditorSecondaryButton disabled={busy} onClick={() => void retryCleanup()}>Retry image cleanup</EditorSecondaryButton></span>}
    </EditorNotice>}
  </div> : null;

  if (!drafts && loadFailed) return <PageFrame title="About" breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => setLoadAttempt(current => current + 1)}>Retry loading</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel="Loading About…" minHeight={480}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><SectionCardsSkeleton count={SECTIONS.about.length} /></div>}>
      <PageFrame title="About" breadcrumb={CRUMBS} openPageHref={PAGE_PATHS[page]} description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <div className={styles.pages}>
          <div className={styles.switch} role="group" aria-label="Public page">
            {PAGES.map(id => <button key={id} type="button" aria-pressed={page === id} disabled={busy || uploading} onClick={() => switchPage(id)}>
              {PAGE_LABELS[id]}
              {unsaved(id) && <><span className={styles.dot} aria-hidden="true" data-unsaved-dot="" /><span className={styles.srOnly}> (unsaved edits)</span></>}
            </button>)}
          </div>
          <span className={styles.hint}>Save publishes the page you are on.</span>
        </div>
        <SectionCards sections={items} label={`${PAGE_LABELS[page]} sections`} onEdit={(id, event) => dialog.openSection(id as SectionId, event)} />
        <p className={styles.fixed}>{page === "about" ? "The order of the sections is fixed by the page design." : "The Club Logo page heading and the order of its sections are fixed by the page design."}</p>
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-about-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${PAGE_LABELS[page]}`} returnFocusRef={dialog.returnFocusRef}
      sections={SECTIONS[page].map(section => ({ id: section.id, title: section.title, summary: drafts && sectionSummary(drafts, section.id) }))}
      activeId={dialog.activeId && pageOfSection(dialog.activeId) === page ? dialog.activeId : SECTIONS[page][0].id} onActiveChange={id => dialog.switchTo(id as SectionId)}
      renderSection={id => dialog.open ? <AboutSectionFields api={api} id={id as SectionId} /> : null} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {PAGE_LABELS[page]} edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
