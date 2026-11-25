"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { IconLink } from "@/components/admin/icons";
import { mediaAccept } from "@/lib/media-rules";
import {
  EditorDialog,
  PageFrame,
  derivePageSaveState,
  useEditorDialog,
  type EditorDialogSection,
  type PageSaveFailure,
  type PageSaveState,
} from "@/components/admin/ui/editor-kit";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { getHomepageSaveBlocker } from "@/lib/homepage-editor/model";
import { useHomepageEditor } from "@/lib/homepage-editor/useHomepageEditor";
import { useHeroVideoController } from "./useHeroVideoController";
import { HeroVideoNotice } from "./HeroVideoControl";
import HomepagePartFields, { type HomepagePartEditor } from "./HomepagePartFields";
import HomepageOverviewPreview, { type PartNumbers } from "./HomepageOverviewPreview";
import HomepageOverviewSkeleton from "./HomepageOverviewSkeleton";
import HomepageRecoveryReview from "./HomepageRecoveryReview";
import { HOMEPAGE_PARTS, hiddenHomepageParts, type PartId } from "./homepage-parts";
import { resolveEditTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import styles from "./HomepageOverview.module.css";
import "./homepage-editor.css";
import { DISCARD_CONFIRM } from "../editor-copy";

/** Registers the unsaved guard the classic admin shell asks before it follows a sidebar link. */
function ClassicGuard({ dirty, onSave, onDiscard, retention }: { dirty: boolean; onSave: () => Promise<boolean>; onDiscard: () => Promise<void>; retention: () => string | null }) {
  useUnsavedGuard({ dirty, edited: "Homepage", onSave, onDiscard, retentionNotice: retention });
  return null;
}

const FORM_KEYS = ["tryouts", "mediaCredentials", "nationalAnthem"] as const;

/**
 * The cinematic@2 (Rose City) homepage editor: the public page in two columns at about half size, a numbered part over
 * each block, and the part's fields in the shared editor dialog. Loading, saving, recovery, uploads and the save
 * request all come from useHomepageEditor, unchanged.
 */
export default function HomepageOverviewEditor() {
  const club = useClubContext();
  const editor = useHomepageEditor(club.id);
  const { state, snapshot, dispatch } = editor;
  const dialog = useEditorDialog<PartId>();
  const photoInput = useRef<HTMLInputElement>(null);
  const [actual, setActual] = useState(false);
  const [numbers, setNumbers] = useState<PartNumbers>({});
  const [reviewRecovery, setReviewRecovery] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Saved shows for a moment, then the button goes back to Save (grey) until the next edit.
  const [savedFlash, setSavedFlash] = useState(false);
  const keepAfterReload = useRef(false);
  const recoveryOpener = useRef<HTMLButtonElement | null>(null);
  const latest = useRef(editor);
  latest.current = editor;

  const capabilities = snapshot ? resolveHomepageCapabilities(snapshot.design) : null;
  const heroVideo = useHeroVideoController(capabilities?.heroVideoReplaceable === true, editor.refreshBaseRevision, editor.refreshPresentation);
  const parts = useMemo(() => HOMEPAGE_PARTS.filter(part => capabilities?.editableSections.includes(part.section)), [capabilities]);
  const frozen = !!state?.submitted || !!editor.recoveryConflict;
  const dirty = editor.dirty.length > 0;
  const blocker = state ? getHomepageSaveBlocker(state) : null;
  const waitingOnUploads = dirty && (blocker === "PHOTOS_NOT_READY" || blocker === "ARTWORK_NOT_READY");

  const failure: PageSaveFailure | null = editor.recoveryConflict ? "conflict"
    : state?.submitted && state.save === "failed" ? "retry"
      : editor.error?.code === "CONTENT_CHANGED" && !state?.submitted && state?.save !== "saving" ? "conflict"
      : editor.error && !state?.submitted && state?.save !== "saving" ? "error" : null;
  const base = state?.save === "saving" ? "saving" : state?.save === "saved" && !dirty && savedFlash ? "saved" : dirty || state?.submitted ? "dirty" : "clean";
  const saveState: PageSaveState = derivePageSaveState(base, failure);

  const savedNow = state?.save === "saved";
  useEffect(() => {
    if (!savedNow) { setSavedFlash(false); return; }
    setSavedFlash(true);
    const timer = window.setTimeout(() => setSavedFlash(false), 1800);
    return () => window.clearTimeout(timer);
  }, [savedNow]);
  // "Load latest and keep my edits": reload the saved page; the browser keeps this draft as a recovered conflict, and
  // restoreRecoveredDraft lays the edits back over the latest page (the same step as the recovery review's button).
  const recoveryConflictNow = editor.recoveryConflict;
  useEffect(() => {
    if (!keepAfterReload.current || editor.loading || !recoveryConflictNow) return;
    keepAfterReload.current = false;
    if (recoveryConflictNow.allowedAction === "apply") void latest.current.restoreRecoveredDraft();
    else setReviewRecovery(true);
  }, [editor.loading, recoveryConflictNow]);
  // Leaving with unsaved work: the shell's guard asks first, and a hard navigation warns.
  useEffect(() => {
    if (!dirty && !state?.submitted) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, state?.submitted]);
  const guardSave = useCallback(async () => {
    const saved = await latest.current.save();
    const after = latest.current.readState();
    return saved && !!after && !after.submitted && latest.current.dirty.length === 0;
  }, []);
  const guardDiscard = useCallback(async () => {
    if (!await latest.current.discardUnsavedUploads()) throw new Error("Photos are still being prepared or cleaned up.");
  }, []);
  const retention = useCallback(() => latest.current.readState()?.submitted || latest.current.recoveryConflict ? "Your browser draft and any unconfirmed save will be kept when you leave." : null, []);

  function openPart(part: PartId, opener: HTMLElement) {
    dialog.returnFocusRef.current = opener;
    dialog.switchTo(part);
  }
  const openFromPreview = useCallback((part: PartId, opener: HTMLElement, target?: EditTargetId) => {
    dialog.returnFocusRef.current = opener;
    // A field click opens the field's own section (it is always the clicked part's) and focuses the field.
    const section = resolveEditTarget(target)?.section as PartId | undefined;
    dialog.switchTo(section && parts.some(item => item.id === section) ? section : part);
    if (section) dialog.focusField(target);
  }, [dialog, parts]);

  async function discard() {
    setDiscarding(true);
    try {
      if (await editor.discardUnsavedUploads()) { dialog.close(); editor.retryLoad(); }
    } finally { setDiscarding(false); setConfirmDiscard(false); }
  }

  if (editor.loading) return <HomepageOverviewSkeleton />;
  if (!state || !snapshot || !capabilities) {
    return <PageFrame title="Homepage" breadcrumb={[{ label: "Website", href: "/admin/website-pages" }, { label: "Pages" }]} openPageHref="/">
      <div className={styles.notice} role="alert" data-tone="error"><p>{editor.error?.message ?? "We could not load your homepage."}</p><button type="button" onClick={editor.retryLoad}>Try loading again</button></div>
    </PageFrame>;
  }

  const e: HomepagePartEditor = {
    draft: state.draft, disabled: frozen, maxPhotos: capabilities.maxPhotos, programs: editor.programs,
    photoCaptionEditable: capabilities.photoCaptionEditable, videoSourceSet: !!snapshot.videoSource,
    field: (field, value) => dispatch({ type: "field-changed", field, value }),
    setRevamp: content => dispatch({ type: "revamp-changed", content }),
    setPhotos: photos => dispatch({ type: "photos-changed", photos }),
    updatePhoto: editor.updatePhoto, removePhoto: editor.removePhoto, retryPhoto: id => void editor.retryPhoto(id),
    addPhotos: () => photoInput.current?.click(),
    replaceArtwork: editor.replaceArtwork, retryArtwork: slot => void editor.retryArtwork(slot),
    heroVideo,
  };
  const hiddenParts = hiddenHomepageParts(state.draft);
  const sections: EditorDialogSection[] = parts.map(part => ({
    id: part.id, title: part.title,
    summary: part.offPage ? "Not on the page" : hiddenParts.has(part.id) ? "Hidden on the page" : numbers[part.id]?.length ? `Part ${numbers[part.id]!.join(" and ")}` : undefined,
  }));
  const formsSet = FORM_KEYS.filter(key => state.draft.revamp?.navigation.destinations[key]).length;
  const notice = <div className={styles.notices}>
    {editor.error && failure && <div className={styles.notice} role="alert" data-tone="error"><p>{editor.error.message}</p>
      {failure === "conflict" && !editor.recoveryConflict && <button type="button" onClick={() => { keepAfterReload.current = true; editor.retryLoad(); }}>Load latest and keep my edits</button>}</div>}
    {heroVideo && <HeroVideoNotice controller={heroVideo} className={styles.notice} />}
    {waitingOnUploads && <div className={styles.notice} role="status"><p>Your uploads are still finishing. Save becomes available when they are done.</p></div>}
    {state.submitted && !editor.error && state.save !== "saving" && <div className={styles.notice} role="status"><p>Your browser draft and any unconfirmed save will be kept if you leave.</p></div>}
    {editor.recoveryUnavailable && <div className={styles.notice} role="alert"><p>Browser recovery is unavailable. Keep this page open until you save; your unsaved work may not survive closing it.</p></div>}
    {editor.recoveryOtherTab && <div className={styles.notice} role="status"><p>{editor.recoveryConflict ? "Another tab changed the recovered draft. Reload this page before reviewing or discarding it." : "Another tab has newer unsaved work. Its recovery copy has been kept. Save this page before closing it."}</p></div>}
    {editor.cleanupWarning && <div className={styles.notice} role="alert"><p>An unused photo could not be removed from storage.</p><button type="button" onClick={() => void editor.retryUnusedCleanup()}>Try removing it again</button></div>}
    {editor.recoveryConflict && <div className={styles.notice} role="alert"><p>Another version of this homepage was saved. Your recovered draft is kept separately.</p>
      <button type="button" disabled={editor.discardingRecovery || editor.recoveryOtherTab} onClick={event => { recoveryOpener.current = event.currentTarget; setReviewRecovery(true); }}>Review recovered draft</button>
      <button type="button" disabled={editor.discardingRecovery || editor.recoveryOtherTab} onClick={() => void editor.discardRecoveredDraft()}>{editor.discardingRecovery ? "Discarding recovered draft…" : "Discard recovered draft"}</button></div>}
    {editor.recoveryNotice && <div className={styles.notice} role="status"><p>{editor.recoveryNotice === "restored" ? "Restored an unsaved draft from before. Review it, then save when ready. Browser recovery keeps drafts for up to seven days." : "Your last save was confirmed. The latest homepage is loaded."}</p><button type="button" onClick={editor.dismissRecoveryNotice}>Dismiss</button></div>}
  </div>;

  return <>
    <ClassicGuard dirty={dirty || !!state.submitted || !!editor.recoveryConflict || editor.cleanupWarning} onSave={guardSave} onDiscard={guardDiscard} retention={retention} />
    <PageFrame
      title="Homepage"
      breadcrumb={[{ label: "Website", href: "/admin/website-pages" }, { label: "Pages" }]}
      openPageHref="/"
      state={saveState}
      onSave={() => void editor.save()}
      onRetry={() => void editor.save()}
      onConflict={() => { if (editor.recoveryConflict) setReviewRecovery(true); else { keepAfterReload.current = true; editor.retryLoad(); } }}
      onDiscard={frozen ? undefined : () => setConfirmDiscard(true)}
      notice={notice}
    >
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <div className={styles.zoom} role="group" aria-label="Preview size">
            <button type="button" aria-pressed={!actual} onClick={() => setActual(false)}>Whole page</button>
            <button type="button" aria-pressed={actual} onClick={() => setActual(true)}>Actual size</button>
          </div>
          <p className={styles.hint}>Your homepage at half size. Click a numbered part to edit it. Changes appear on your website after you save.</p>
        </div>
        {parts.some(part => part.id === "forms") && <button type="button" className={styles.forms} data-part="forms" data-kit-edit="" onClick={event => openPart("forms", event.currentTarget)}>
          <IconLink size={18} aria-hidden="true" />External forms<span>{formsSet} of 3 form links set · not shown on the page</span>
        </button>}
        <HomepageOverviewPreview draft={state.draft} videoSource={snapshot.videoSource} parts={parts} actual={actual} onOpen={openFromPreview} onNumbers={setNumbers} />

      </div>
    </PageFrame>
    <input ref={photoInput} className="sr-only" tabIndex={-1} aria-label="Choose homepage photos" type="file" accept={mediaAccept("photo")} multiple onChange={event => { editor.addPhotos(event.target.files); event.target.value = ""; }} />
    <EditorDialog
      open={dialog.open}
      onClose={dialog.close}
      title="Edit homepage"
      sections={sections}
      activeId={dialog.activeId}
      onActiveChange={id => dialog.switchTo(id as PartId)}
      returnFocusRef={dialog.returnFocusRef}
      focusRequest={dialog.focusRequest}
      renderSection={id => <HomepagePartFields part={id as PartId} e={e} />}
    />
    {reviewRecovery && editor.recoveryConflict && <HomepageRecoveryReview current={state.baseline} recovered={editor.recoveryConflict.draft} reason={editor.recoveryConflict.reason} allowedAction={editor.recoveryConflict.allowedAction} close={() => setReviewRecovery(false)} restore={editor.restoreRecoveredDraft} />}
    <AdminConfirmDialog open={confirmDiscard} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive busy={discarding} onCancel={() => setConfirmDiscard(false)} onConfirm={() => void discard()}>
      Your unsaved homepage edits and any photos added since the last save will be removed, and the saved homepage will load again.
    </AdminConfirmDialog>
  </>;
}
