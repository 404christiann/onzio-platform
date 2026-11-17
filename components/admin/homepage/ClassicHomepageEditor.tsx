"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { useAdminTheme } from "@/components/admin/AdminThemeProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminDialog, AdminDialogFooter, AdminDialogSection } from "@/components/admin/ui/AdminDialog";
import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";
import { AdminPhotoManager, type AdminPhoto } from "@/components/admin/ui/AdminPhotoManager";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { PreviewToggle, type PreviewSize } from "@/components/admin/ui/PreviewToggle";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { Button } from "@/components/ui/button";
import HomePageClient from "@/components/HomePageClient";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { getDirtyHomepageSections, getHomepageSaveBlocker, type HomepagePhoto, type PieceId } from "@/lib/homepage-editor/model";
import { HomepagePreviewContext } from "@/lib/homepage-editor/preview-context";
import { useHomepageEditor } from "@/lib/homepage-editor/useHomepageEditor";
import HomepagePreviewFrame from "./HomepagePreviewFrame";
import HomepageFields from "./HomepageFields";
import HomepageRecoveryReview from "./HomepageRecoveryReview";
import HomepageNotifications, { useHomepageNotification } from "./HomepageNotifications";
import "./classic-homepage.css";

type Target = "hero" | "story" | "photos" | "video";
const titles: Record<Target, string> = { hero: "Hero", story: "Our story", photos: "Photo slideshow", video: "Video feature" };
type Editor = ReturnType<typeof useHomepageEditor>;

type PreviewShellComponent = ComponentType<{ children: ReactNode; playback: boolean }>;

export default function ClassicHomepageEditor({ PreviewShell, navigationOpen = false }: { PreviewShell: PreviewShellComponent; navigationOpen?: boolean }) {
  const club = useClubContext();
  const [toastHost, setToastHost] = useState<HTMLElement | null>(null);
  return <AdminToastProvider key={club.id} portalTarget={toastHost}><Homepage key={club.id} setToastHost={setToastHost} PreviewShell={PreviewShell} navigationOpen={navigationOpen} /></AdminToastProvider>;
}

function Homepage({ setToastHost, PreviewShell, navigationOpen }: { setToastHost: (host: HTMLElement | null) => void; PreviewShell: PreviewShellComponent; navigationOpen: boolean }) {
  const club = useClubContext();
  const { theme } = useAdminTheme();
  const router = useRouter();
  const editor = useHomepageEditor(club.id);
  const latest = useRef(editor);
  latest.current = editor;
  const [target, setTarget] = useState<Target | null>(null);
  const [preview, setPreview] = useState(false);
  const [size, setSize] = useState<PreviewSize>("desktop");
  const [reviewRecovery, setReviewRecovery] = useState(false);
  const [photoDestination, setPhotoDestination] = useState<HTMLElement | null>(null);
  const pageToastHost = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const returnPiece = useRef<PieceId | null>(null);
  const sectionPopup = useRef<HTMLElement | null>(null);
  const recoveryOpener = useRef<HTMLButtonElement | null>(null);
  const activity = useRef(0);
  const pending = useRef(false);
  const undoPending = useRef(false);
  const undoWaiters = useRef(new Set<() => void>());
  const alive = useRef(true);
  const saveBusy = useRef(false);
  const [working, setWorking] = useState(false);
  const [undoWork, setUndoWork] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const known = useRef(new Map<string, HomepagePhoto>());
  for (const photo of editor.state?.draft.photos.items ?? []) known.current.set(photo.clientId, photo);
  useLayoutEffect(() => {
    alive.current = true;
    const waiters = undoWaiters.current;
    return () => { alive.current = false; for (const resolve of waiters) resolve(); waiters.clear(); };
  }, []);

  function interact() { activity.current++; setActionError(null); }
  function workChanged(value: boolean) {
    pending.current = value; setWorking(value);
    if (value) interact();
  }
  function undoChanged(value: boolean) {
    undoPending.current = value; setUndoWork(value);
    if (!value) { for (const resolve of undoWaiters.current) resolve(); undoWaiters.current.clear(); }
  }
  async function cleanupRemoved() {
    const state = latest.current.readState();
    if (state?.submitted || latest.current.recoveryConflict) return true;
    const retained = new Set(state?.draft.photos.items.map(photo => photo.assetId));
    const candidates = [...known.current.values()].filter(photo => photo.rowId === null && photo.assetId && !retained.has(photo.assetId));
    if (!await latest.current.cleanupRemovedPhotos(candidates)) return false;
    for (const photo of candidates) known.current.delete(photo.clientId);
    return true;
  }
  async function saveAll(): Promise<boolean> {
    if (saveBusy.current || pending.current) return false;
    saveBusy.current = true; setActionError(null);
    try {
      // Keep Undo available before the server can retire any removed media.
      while (alive.current && undoPending.current) await new Promise<void>(resolve => undoWaiters.current.add(resolve));
      if (!alive.current || pending.current || !await cleanupRemoved()) return false;
      const epoch = activity.current;
      const before = latest.current.readState();
      if (!before || latest.current.recoveryConflict) return false;
      if (getDirtyHomepageSections(before).length || before.submitted) {
        if (!await latest.current.save()) return false;
      }
      const after = latest.current.readState();
      return alive.current && epoch === activity.current && !pending.current && !undoPending.current &&
        !!after && !after.submitted && !getDirtyHomepageSections(after).length && !latest.current.recoveryConflict;
    } finally { saveBusy.current = false; }
  }
  const saveLatest = useRef(saveAll);
  saveLatest.current = saveAll;
  async function discardAll() {
    while (alive.current && undoPending.current) await new Promise<void>(resolve => undoWaiters.current.add(resolve));
    if (!alive.current || pending.current || !await cleanupRemoved() || !await latest.current.discardUnsavedUploads()) throw new Error("Photos are still being prepared or cleaned up.");
  }
  const discardLatest = useRef(discardAll);
  discardLatest.current = discardAll;
  const retainedAssets = new Set(editor.state?.draft.photos.items.map(photo => photo.assetId));
  const removedUploads = [...known.current.values()].some(photo => photo.rowId === null && photo.assetId && !retainedAssets.has(photo.assetId));
  const requestNavigation = useUnsavedGuard({
    dirty: !!editor.dirty.length || !!editor.state?.submitted || !!editor.recoveryConflict || working || undoWork || removedUploads || editor.cleanupWarning,
    edited: "Homepage",
    onSave: () => saveLatest.current(),
    retentionNotice: () => latest.current.readState()?.submitted || latest.current.recoveryConflict ? "Your browser draft and any unconfirmed save will be kept when you leave." : null,
    onDiscard: () => discardLatest.current(),
  });
  const saveAction = useSaveState({ isDirty: !!editor.dirty.length || !!editor.state?.submitted || working || undoWork || removedUploads,
    onSave: async () => { if (!await saveLatest.current()) throw new Error("Your homepage changes could not all be saved."); } });
  const notifications = useHomepageNotification({ save: editor.state?.save ?? "idle", error: editor.error, paused: navigationOpen,
    warning: editor.recoveryOtherTab ? editor.recoveryConflict ? "Another tab changed the recovered draft. Reload this page before reviewing or discarding it." : "Another tab has newer unsaved work. Its recovery copy has been kept. Save this page before closing it." : null });
  const notification = (inModal = false) => <HomepageNotifications notification={notifications.notification} inModal={inModal}
    retryDisabled={saveAction.state === "saving"}
    onRetry={() => void saveAction.save().catch(() => setActionError("Your changes are still here. Try saving again."))}
    onDismiss={notifications.dismiss} onHold={notifications.hold} onRelease={notifications.release} />;
  useLayoutEffect(() => {
    if (!navigationOpen) return;
    setToastHost(pageToastHost.current); setTarget(null); setPreview(false);
    latest.current.dispatch({ type: "done" });
  }, [navigationOpen, setToastHost]);
  function go(href: string, label: string) {
    requestNavigation({ kind: "page", label, continue: () => router.push(href), opener: opener.current });
  }
  function select(piece: PieceId) {
    const frame = document.querySelector<HTMLIFrameElement>(".hc-canvas iframe");
    const focused = frame?.contentDocument?.activeElement;
    opener.current = focused && typeof (focused as HTMLElement).focus === "function" ? focused as HTMLElement : document.activeElement as HTMLElement;
    const capabilities = editor.snapshot && resolveHomepageCapabilities(editor.snapshot.design);
    const shared = piece === "shared.story" ? capabilities?.sharedTargets.storyText : piece === "shared.programs" ? capabilities?.sharedTargets.programs : piece === "shared.shop" && club.storeEnabled ? capabilities?.sharedTargets.shop : null;
    if (shared) { go(shared.editorHref, shared.owner === "about" ? "About" : shared.owner === "shop" ? "Shop" : "Programs"); return; }
    if (piece.startsWith("shared.")) return;
    returnPiece.current = piece;
    latest.current.dispatch({ type: "piece-selected", piece });
    setTarget(piece.startsWith("hero.") ? "hero" : piece.startsWith("story") ? "story" : piece as Target);
  }
  function sectionFinalFocus() {
    if (navigationOpen || preview || target) return false;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement && !sectionPopup.current?.contains(active)) return false;
    const canvas = document.querySelector<HTMLIFrameElement>(".hc-canvas iframe")?.contentDocument;
    const piece = returnPiece.current;
    const replacement = piece && canvas?.querySelector<HTMLElement>(`[data-homepage-piece="${piece}"]`);
    const story = piece?.startsWith("story") && canvas?.querySelector<HTMLElement>('[data-homepage-piece="story.text"]');
    return opener.current?.isConnected && opener.current.ownerDocument === canvas ? opener.current :
      replacement || story || document.querySelector<HTMLButtonElement>(".hc-heading [data-admin-save-button]") || false;
  }
  function close() {
    // Move the live toast out of the footer before that footer becomes inert.
    flushSync(() => setToastHost(pageToastHost.current));
    setTarget(null);
    latest.current.dispatch({ type: "done" });
  }
  const stablePageHost = useCallback((host: HTMLDivElement | null) => { pageToastHost.current = host; }, []);
  useLayoutEffect(() => { if (!target) setToastHost(pageToastHost.current); }, [target, setToastHost]);
  const footerHost = useCallback((host: HTMLElement | null) => { if (host && target) setToastHost(host); }, [setToastHost, target]);
  const state = editor.state;
  const capabilities = editor.snapshot && resolveHomepageCapabilities(editor.snapshot.design);
  const frozen = !!state?.submitted || !!editor.recoveryConflict;
  const sharedShortcuts = [capabilities?.sharedTargets.storyText, capabilities?.sharedTargets.programs, club.storeEnabled ? capabilities?.sharedTargets.shop : null].filter((shortcut): shortcut is NonNullable<typeof shortcut> => !!shortcut);
  const blocked = state ? !!getHomepageSaveBlocker(state) && getHomepageSaveBlocker(state) !== "NO_CHANGES" : true;
  const fields = (piece: PieceId) => state && <HomepageFields classic piece={piece} clubName={club.name} draft={state.draft} disabled={frozen} change={(field, value) => { interact(); editor.dispatch({ type: "field-changed", field, value }); }} programs={editor.programs} more />;
  const content = state && <HomePageClient initialHeroContent={{ ...state.draft.hero, id: 1, updated_at: "" }} />;
  const frame = (playback: boolean) => <HomepagePreviewContext.Provider value={state && editor.snapshot ? { playback, navigateShared: true, draft: state.draft, videoSource: editor.snapshot.videoSource, selection: state.selection, allowedPieces: state.allowedPieces, select } : null}>
    <HomepagePreviewFrame classic theme={theme} loading={editor.loading} host={club.primaryDomain} playback={playback}>
      {state && <PreviewShell playback={playback}>{content}</PreviewShell>}
    </HomepagePreviewFrame>
  </HomepagePreviewContext.Provider>;

  return <div className="hc-editor hp-editor">
    <header className="hc-heading"><div><h1>Homepage</h1><p>Click a part of your homepage to edit it.</p></div>
      <AdminSaveActions state={blocked || editor.recoveryConflict ? (state?.save === "saving" ? "saving" : "clean") : saveAction.state} onSave={() => { void saveAction.save().catch(() => setActionError("Your changes are still here. Try saving again.")); }} stackOnMobile />
    </header>
    {actionError && !editor.error && <p role="alert" className="hc-notice">{actionError}</p>}
    {!target && !preview && !navigationOpen && notification()}
    {state?.submitted && <p className="hc-notice" role="status">Your browser draft and any unconfirmed save will be kept if you leave.</p>}
    {editor.recoveryUnavailable && <p role="alert" className="hc-notice">Browser recovery is unavailable. Keep this page open until you save; your unsaved work may not survive closing it.</p>}
    {editor.cleanupWarning && <div className="hc-notice" role="alert"><p>An unused photo could not be removed from storage.</p><Button variant="outline" onClick={() => void editor.retryUnusedCleanup()}>Try removing it again</Button></div>}
    {editor.recoveryConflict && <div className="hc-notice" role="alert"><p>Another version of this homepage was saved. Your recovered draft is kept separately.</p><div className="hc-notice-actions"><Button variant="outline" disabled={editor.discardingRecovery || editor.recoveryOtherTab} onClick={event => { recoveryOpener.current = event.currentTarget; setReviewRecovery(true); }}>Review recovered draft</Button><Button variant="outline" disabled={editor.discardingRecovery || editor.recoveryOtherTab} onClick={() => void editor.discardRecoveredDraft()}>{editor.discardingRecovery ? "Discarding recovered draft…" : "Discard recovered draft"}</Button></div></div>}
    {editor.recoveryNotice && <div className="hc-notice" role="status"><p>{editor.recoveryNotice === "restored" ? "Restored an unsaved draft from before. Review it, then save when ready. Browser recovery keeps drafts for up to seven days." : "Your last save was confirmed. The latest homepage is loaded."}</p><Button variant="outline" onClick={editor.dismissRecoveryNotice}>Dismiss</Button></div>}
    {reviewRecovery && editor.recoveryConflict && <HomepageRecoveryReview classic finalFocus={() => recoveryOpener.current?.isConnected ? recoveryOpener.current : document.querySelector<HTMLButtonElement>(".hc-heading [data-admin-save-button]") ?? false} current={state!.baseline} recovered={editor.recoveryConflict.draft} reason={editor.recoveryConflict.reason} allowedAction={editor.recoveryConflict.allowedAction} close={() => setReviewRecovery(false)} restore={editor.restoreRecoveredDraft} />}
    <div className="hc-preview-tools"><PreviewToggle value={size} onChange={setSize} /><Button variant="outline" onClick={event => { opener.current = event.currentTarget; setPreview(true); }} disabled={!state}>Preview of your homepage</Button></div>
    {sharedShortcuts.length > 0 && <div className="hp-shared-links"><p><span className="hp-shared-long">Edited elsewhere:</span><span className="hp-shared-short">Edited elsewhere:</span></p>{sharedShortcuts.map(shortcut => {
      const label = shortcut.owner === "about" ? "About" : shortcut.owner === "programs" ? "Programs" : "Shop";
      return <button key={shortcut.editorHref} className="hp-button" aria-label={`Edit in ${label}`} onClick={event => { opener.current = event.currentTarget; go(shortcut.editorHref, label); }}><span className="hp-shared-long">Edit in {label}</span><span className="hp-shared-short">{label}</span></button>;
    })}</div>}
    <p className="hc-preview-caption">Changes appear on your website after you save.</p>
    <div className="hc-canvas" data-size={size}>
      {!editor.loading && !state ? <div className="hc-load-error"><p>We could not load your homepage.</p><Button onClick={editor.retryLoad}>Try loading again</Button></div> : frame(false)}
    </div>
    <AdminDialog open={target !== null} title={target ? titles[target] : "Homepage"} onClose={close} finalFocus={sectionFinalFocus} size={target === "photos" ? "lg" : "md"}
      initialFocus={target === "photos" ? undefined : () => {
        const piece = latest.current.readState()?.selection;
        const id = piece === "hero.eyebrow" ? "hero-eyebrow" : piece === "hero.intro" ? "hero-intro" : piece === "hero.cta" ? "hero-primary-label" : piece === "story.cta" ? "story-cta-label" : target === "hero" ? "hero-headline-line-one" : target === "story" ? "story-heading" : target === "video" ? "video-eyebrow" : null;
        return id ? document.getElementById(id) ?? false : false;
      }}
      footer={<AdminDialogFooter status={<div ref={footerHost} className="hc-undo-host" />} primary={<Button onClick={close}>Done</Button>} />}>
      <div className="hc-fields" ref={node => { if (node) sectionPopup.current = node.closest<HTMLElement>('[data-slot="admin-dialog"]'); }}>
        {target && notification(true)}
        {target === "hero" && capabilities && <>{capabilities.heroEditableFields.includes("eyebrow") && fields("hero.eyebrow")}{fields("hero.heading")}{fields("hero.intro")}<AdminDialogSection title="Top buttons">{fields("hero.cta")}<p className="hp-help">Leave the second button’s text empty to show only one button.</p></AdminDialogSection></>}
        {target === "story" && state && <><div className="hc-switch-row"><span>Show on homepage</span><AdminSwitch checked={state.draft.story.visible} label="Show our story on homepage" disabled={frozen} onCheckedChange={value => { interact(); editor.dispatch({ type: "field-changed", field: "story.visible", value }); }} /></div>{fields("story.text")}{fields("story.cta")}<p className="hp-help">The button opens your About page. Blank fields use your website’s standard wording.</p></>}
        {target === "video" && state && <><div className="hc-switch-row"><span>Show on homepage</span><AdminSwitch checked={state.draft.video.visible} label="Show video on homepage" disabled={frozen || !editor.snapshot?.videoSource} disabledReason={!editor.snapshot?.videoSource ? "No video yet. Ask Onzio to connect one." : undefined} onCheckedChange={value => { interact(); editor.dispatch({ type: "field-changed", field: "video.visible", value }); }} /></div>{fields("video")}<p className="hp-help">The video is connected by Onzio.</p></>}
        {target === "photos" && <><p className="hp-help">Your homepage design controls where the slideshow appears.</p>{capabilities?.photoCaptionEditable && <>{fields("photos")}<p className="hp-help">Up to 40 characters for new wording. Your existing label is kept.</p></>}<div ref={setPhotoDestination} /></>}
      </div>
    </AdminDialog>
    {state && capabilities?.editableSections.includes("photos") && <PersistentPhotos editor={editor} known={known.current} destination={target === "photos" ? photoDestination : null} onWork={workChanged} onUndoWork={undoChanged} onInteraction={interact} />}
    <AdminDialog open={preview} title="Preview of your homepage" size="xl" finalFocus={() => opener.current?.isConnected ? opener.current : false} onClose={() => setPreview(false)} footer={<AdminDialogFooter primary={<Button onClick={() => setPreview(false)}>Done</Button>} />}>
      {preview && notification(true)}<div className="hc-preview-tools"><PreviewToggle value={size} onChange={setSize} /></div><div className="hc-whole-preview" data-size={size}>{preview && frame(true)}</div>
    </AdminDialog>
    <div ref={stablePageHost} className="hc-toast-host" />
  </div>;
}

function PersistentPhotos({ editor, known, destination, onWork, onUndoWork, onInteraction }: {
  editor: Editor; known: Map<string, HomepagePhoto>; destination: HTMLElement | null;
  onWork: (pending: boolean) => void; onUndoWork: (pending: boolean) => void; onInteraction: () => void;
}) {
  const parking = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const current = useRef(editor);
  current.current = editor;
  const preparing = useRef(new Set<string>());
  const [, refresh] = useState(0);
  useLayoutEffect(() => { const node = document.createElement("div"); setHost(node); return () => node.remove(); }, []);
  useLayoutEffect(() => { if (host) (destination ?? parking.current)?.appendChild(host); }, [host, destination]);
  const photos = editor.state!.draft.photos.items;
  const ready = photos.filter(photo => photo.upload === "ready" && !preparing.current.has(photo.clientId));
  const item = (photo: HomepagePhoto): AdminPhoto => ({ id: photo.clientId, url: photo.url ?? "", description: photo.alt });
  return <><div ref={parking} hidden />{host && createPortal(<>
    <AdminPhotoManager collectionId={editor.snapshot!.designRevision} label="Slideshow photos" descriptionLabel="Describe this photo" emptyUploadMessage="" variant="rows" photos={ready.map(item)} allowedTypes={["image/jpeg", "image/png", "image/webp"]} maxBytes={15 * 1024 * 1024} removalMessage="Photo removed" disabled={!!editor.state?.submitted || !!editor.recoveryConflict}
      onPendingChange={onWork} onUndoPendingChange={onUndoWork} onDirty={onInteraction}
      onChange={next => {
        for (const photo of next) preparing.current.delete(photo.id);
        const unfinished = current.current.readState()?.draft.photos.items.filter(photo => photo.upload !== "ready") ?? [];
        current.current.dispatch({ type: "photos-changed", photos: [...next.map(photo => ({ ...known.get(photo.id)!, alt: photo.description })), ...unfinished].map((photo, order) => ({ ...photo, order })) });
      }}
      onUpload={async files => {
        const before = new Set(current.current.readState()?.draft.photos.items.map(photo => photo.clientId));
        const task = current.current.addPhotos(files);
        const ids = current.current.readState()?.draft.photos.items.filter(photo => !before.has(photo.clientId)).map(photo => photo.clientId) ?? [];
        for (const id of ids) preparing.current.add(id);
        refresh(value => value + 1);
        const added = await task;
        const successful = new Set(added.map(photo => photo.clientId));
        for (const id of ids) if (!successful.has(id)) preparing.current.delete(id);
        for (const photo of added) known.set(photo.clientId, photo);
        refresh(value => value + 1);
        return added.map(item);
      }}
    />
    {photos.filter(photo => photo.upload !== "ready").map(photo => <div key={photo.clientId} className="hc-photo-status"><p role={photo.upload === "failed" ? "alert" : "status"}>{photo.upload === "failed" ? photo.error?.message ?? "This photo needs to be added again." : "Adding your photo…"}</p>{photo.upload === "failed" && <Button variant="outline" onClick={() => void editor.retryPhoto(photo.clientId)}>Try this photo again</Button>}<Button variant="outline" onClick={() => { onInteraction(); editor.removePhoto(photo.clientId); }}>Remove photo</Button></div>)}
  </>, host)}</>;
}
