"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useClubContext } from "@/components/ClubContextProvider";
import HomePageClient from "@/components/HomePageClient";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import TemplateFontScope from "@/components/TemplateFontScope";
import EditorialShell from "@/components/editorial/EditorialShell";
import HomepageRecoveryReview from "./HomepageRecoveryReview";
import HomepageEditorSkeleton from "./HomepageEditorSkeleton";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { getHomepageSaveBlocker, type PieceId } from "@/lib/homepage-editor/model";
import { HOMEPAGE_PIECE_LABELS, HomepagePreviewContext } from "@/lib/homepage-editor/preview-context";
import { useHomepageEditor } from "@/lib/homepage-editor/useHomepageEditor";
import HomepagePreviewFrame from "./HomepagePreviewFrame";
import HomepageFields from "./HomepageFields";
import HomepageNotifications, { useHomepageNotification } from "./HomepageNotifications";
import "./homepage-editor.css";

const SECTION_NAMES = { hero: "Top of your homepage", photos: "Photos", story: "Your club’s story", video: "Video feature" };

export default function HomepageEditor() {
  const club = useClubContext();
  const router = useRouter();
  const editor = useHomepageEditor(club.id);
  const { state, snapshot, dispatch } = editor;
  const [reviewRecovery, setReviewRecovery] = useState(false);
  const [playback, setPlayback] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const thumbBar = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const anchor = useRef<{ piece: PieceId; top: number } | null>(null);
  const piece = state?.selection ?? null;
  const disclosure = state?.disclosure;
  const disclosurePiece = disclosure?.piece;
  const disclosureMode = disclosure?.mode;

  const previewPieceTop = useCallback((target: PieceId | null) => {
    if (!target) return null;
    const frame = root.current?.querySelector("iframe");
    const element = frame?.contentDocument?.querySelector<HTMLElement>(`[data-homepage-piece="${target}"]`);
    if (!frame || !element) return null;
    return frame.getBoundingClientRect().top + element.getBoundingClientRect().top;
  }, []);
  // Showing or hiding the options panel resizes the preview viewport, so the
  // real public page rewraps and the piece being edited slides away — at common
  // laptop widths far enough to leave the preview entirely. Remember where the
  // selected piece sat and put the preview back under it afterwards.
  const captureAnchor = useCallback((target: PieceId | null) => {
    const top = previewPieceTop(target);
    anchor.current = target && top !== null ? { piece: target, top } : null;
  }, [previewPieceTop]);
  const settleAnchor = useCallback(() => {
    const pending = anchor.current;
    if (!pending) return;
    const view = root.current?.querySelector("iframe")?.contentWindow;
    const current = previewPieceTop(pending.piece);
    if (!view || current === null) return;
    const drift = current - pending.top;
    if (Math.abs(drift) < 1) return;
    view.scrollTo({ left: view.scrollX, top: Math.max(0, view.scrollY + drift), behavior: "auto" });
  }, [previewPieceTop]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      root.current?.style.setProperty("--hp-viewport", `${viewport?.height ?? window.innerHeight}px`);
      root.current?.style.setProperty("--hp-keyboard-offset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    };
    update(); window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [editor.loading]);
  useEffect(() => {
    const bar = thumbBar.current;
    if (!bar) return;
    const measure = () => root.current?.style.setProperty("--hp-toolbar-height", `${bar.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(bar); measure();
    return () => observer.disconnect();
  }, [editor.loading]);
  useEffect(() => {
    const options = panel.current;
    if (!options || !disclosurePiece || playback) return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const focused = document.activeElement as HTMLElement | null;
    captureAnchor(disclosurePiece);
    if (options.open) options.close();
    if (mobile) options.showModal(); else options.show();
    // Native non-modal dialogs may scroll their static position into view when
    // opened. The editor canvas should not jump just because a field is being
    // selected, so restore the document position after the browser lays it out.
    window.requestAnimationFrame(() => window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" }));
    if (focused && options.contains(focused)) focused.focus({ preventScroll: true });
  }, [captureAnchor, disclosurePiece, mobile, playback]);
  // Runs after every commit so the anchor also survives the panel unmounting,
  // which is a plain render rather than a dialog call.
  useEffect(() => {
    if (!anchor.current) return;
    settleAnchor();
    const frame = window.requestAnimationFrame(() => { settleAnchor(); anchor.current = null; });
    return () => window.cancelAnimationFrame(frame);
  });
  useEffect(() => {
    if (disclosurePiece) (panel.current?.querySelector<HTMLElement>("input,textarea,select") ?? panel.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  }, [disclosurePiece, disclosureMode]);
  useEffect(() => {
    if (destination) dialog.current?.showModal();
    else dialog.current?.close();
  }, [destination]);
  const notifications = useHomepageNotification({
    save: state?.save ?? "idle",
    error: editor.error,
    warning: editor.recoveryOtherTab ? "Another tab has newer unsaved work. Its recovery copy has been kept. Save this page before closing it." : null,
  });
  // One presenter is visible at a time: the host that owns the notification is
  // the surface holding the Save the person actually used.
  const notificationProps = {
    notification: notifications.notification,
    onRetry: () => void editor.save(),
    onDismiss: notifications.dismiss,
    onHold: notifications.hold,
    onRelease: notifications.release,
  };

  function restoreSelectionFocus() {
    const doc = root.current?.querySelector("iframe")?.contentDocument;
    if (piece) doc?.querySelector<HTMLElement>(`[data-homepage-piece="${piece}"]`)?.focus({ preventScroll: true });
  }
  function closePanel() {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    captureAnchor(piece);
    panel.current?.close();
    dispatch({ type: "disclosure-closed" });
    restoreSelectionFocus();
    window.requestAnimationFrame(() => window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" }));
  }
  async function go(href: string) {
    if (editor.dirty.length) { setDestination(href); return; }
    if (await editor.discardUnsavedUploads()) router.push(href);
  }

  if (editor.loading) return <HomepageEditorSkeleton />;
  if (!state || !snapshot) return <section className="hp-editor" aria-label="Homepage editor"><h1>Homepage</h1><p role="alert">{editor.error?.message ?? "We could not load your homepage."}</p><button className="hp-button" onClick={editor.retryLoad}>Try loading again</button></section>;
  const capabilities = resolveHomepageCapabilities(snapshot.design);
  const frozen = !!state.submitted || !!editor.recoveryConflict;
  const isShared = piece?.startsWith("shared.");
  const isStory = piece === "story.text" || piece === "story.cta";
  const visibility = isStory ? "story" : piece === "video" ? "video" : null;
  const sharedShortcuts: { label: string; short: string; href: string }[] = [];
  if (capabilities.sharedTargets.storyText) sharedShortcuts.push({ label: "Edit in About", short: "About", href: "/admin/about" });
  if (capabilities.sharedTargets.programs) sharedShortcuts.push({ label: "Edit in Programs", short: "Programs", href: "/admin/programs" });
  if (capabilities.sharedTargets.shop) sharedShortcuts.push({ label: "Edit in Shop", short: "Shop", href: "/admin/shop" });
  const sharedHref = piece === "shared.story" ? "/admin/about" : piece === "shared.programs" ? "/admin/programs" : "/admin/shop";
  const sharedLabel = piece === "shared.story" ? "Edit in About" : piece === "shared.programs" ? "Edit in Programs" : "Edit in Shop";
  const select = (target: PieceId) => { captureAnchor(target); dispatch({ type: "piece-selected", piece: target }); };
  const done = () => { captureAnchor(piece); panel.current?.close(); restoreSelectionFocus(); dispatch({ type: "done" }); };
  const status = state.save === "saving" ? "Saving your homepage…" : state.save === "saved" ? "Saved. Your homepage is updated." : editor.dirty.length ? `Not saved yet: ${editor.dirty.map(section => SECTION_NAMES[section]).join(", ")}` : "Nothing to save yet.";
  const saveButton = <button type="button" className="hp-button hp-save" disabled={!!getHomepageSaveBlocker(state) || !!editor.recoveryConflict} onClick={() => void editor.save()}>{state.save === "saving" ? "Saving…" : "Save homepage"}</button>;
  const preview = <HomePageClient initialHeroContent={{ ...state.draft.hero, id: 1, updated_at: "" }} />;
  const tools = piece ? <>
    {isShared ? <button className="hp-button" onClick={() => go(sharedHref)}>{sharedLabel}</button> : <button className="hp-button" onClick={() => { captureAnchor(piece); dispatch({ type: "disclosure-opened", mode: "primary" }); }}>Change the words</button>}
    {piece === "photos" && <button className="hp-button" disabled={frozen || state.draft.photos.items.length >= 6} onClick={() => photoInput.current?.click()}>Add photo</button>}
    {visibility && <label className="hp-visibility"><input type="checkbox" checked={state.draft[visibility].visible} disabled={frozen || (visibility === "video" && !snapshot.videoSource)} onChange={event => dispatch({ type: "field-changed", field: `${visibility}.visible`, value: event.target.checked })} />Show on homepage</label>}
    {!isShared && <button className="hp-button hp-more" onClick={() => { captureAnchor(piece); dispatch({ type: "disclosure-opened", mode: "more" }); }}>More options</button>}
    <button className="hp-button" onClick={done}>Done</button>
  </> : null;
  const parts: { name: string; piece: PieceId }[] = [];
  if (capabilities.editableSections.includes("hero")) parts.push({ name: "Top", piece: "hero.heading" });
  if (capabilities.editableSections.includes("photos")) parts.push({ name: "Photos", piece: "photos" });
  if (capabilities.editableSections.includes("story")) parts.push({ name: "Your story", piece: "story.text" });

  if (capabilities.editableSections.includes("video")) parts.push({ name: "Video", piece: "video" });

  return <div ref={root} className="hp-editor" data-sheet-open={!!disclosure && !playback} data-playback={playback}>
    <header className="hp-heading"><div><h1>Homepage</h1><p>Click a part of your page to make it yours.</p></div><div className="hp-desktop-save">{!disclosure && saveButton}</div></header>
    <div className="hp-status" role="status" aria-live="off" data-dirty={editor.dirty.length > 0}>{status}</div>
    {!mobile && !disclosure && !destination && <HomepageNotifications {...notificationProps} />}
    {editor.recoveryUnavailable && <p className="hp-recovery-notice" role="alert">Browser recovery is unavailable. Keep this page open until you save; your unsaved work may not survive closing it.</p>}
    {editor.cleanupWarning && <div className="hp-recovery-notice" role="alert"><p>An unused photo could not be removed from storage.</p><button className="hp-button" onClick={() => void editor.retryUnusedCleanup()}>Try removing it again</button></div>}
    {editor.recoveryConflict && <div className="hp-recovery-notice" role="alert"><p>Another version of this homepage was saved. Your recovered draft is kept separately.</p><button className="hp-button" onClick={() => setReviewRecovery(true)}>Review recovered draft</button><button className="hp-button" onClick={() => void editor.discardRecoveredDraft()}>Discard recovered draft</button></div>}
    {reviewRecovery && editor.recoveryConflict && <HomepageRecoveryReview current={state.baseline} recovered={editor.recoveryConflict.draft} designChanged={editor.recoveryConflict.reason === "DESIGN_CHANGED"} close={() => setReviewRecovery(false)} restore={editor.restoreRecoveredDraft} />}
    {editor.recoveryNotice && <div className="hp-recovery-notice" role="status"><p>{editor.recoveryNotice === "restored" ? "Restored an unsaved draft from before. Review it, then save when ready. Browser recovery keeps drafts for up to seven days." : "Checked on your last save attempt and restored your draft. Review it, then save when ready."}</p><button className="hp-button" onClick={editor.dismissRecoveryNotice}>Dismiss</button></div>}
    <div className="hp-toolbar" aria-label="Homepage tools" hidden={playback}>{piece ? <><strong>{HOMEPAGE_PIECE_LABELS[piece]}</strong><div className="hp-tools">{tools}</div></> : <p>Click any words, photo or button in the preview to edit it.</p>}</div>
    <div className="hp-preview-actions"><p>{playback ? "Play videos and browse photos. Links stay in this preview." : "Select pieces to edit, or preview photos and video playback."}</p><button className="hp-button" aria-pressed={playback} onClick={() => { dispatch({ type: "disclosure-closed" }); setPlayback(value => !value); }}>{playback ? "Back to editing" : "Playback preview"}</button></div>
    {!playback && sharedShortcuts.length > 0 && <div className="hp-shared-links">
      <p><span className="hp-shared-long">Some sections come from their own pages, so they are not shown here:</span><span className="hp-shared-short">Edited elsewhere:</span></p>
      {/* Phones get the compact name; the accessible name stays complete either way. */}
      {sharedShortcuts.map(shortcut => <button key={shortcut.href} type="button" className="hp-button" aria-label={shortcut.label} onClick={() => go(shortcut.href)}><span className="hp-shared-long">{shortcut.label}</span><span className="hp-shared-short">{shortcut.short}<ArrowRight aria-hidden="true" size={16} strokeWidth={2} /></span></button>)}
    </div>}
    <div className="hp-preview-notice">{playback ? "Preview — not your live site." : "Preview · Changes appear on your website after you save."}</div>
    <div className="hp-workspace">
      <HomepagePreviewContext.Provider value={{ playback, draft: state.draft, videoSource: snapshot.videoSource, selection: piece, allowedPieces: state.allowedPieces, select }}>
        <HomepagePreviewFrame host={club.primaryDomain} playback={playback}>
          {club.presentationTemplateKey === "editorial@1" ? <EditorialShell editing={!playback}>{preview}</EditorialShell> : <TemplateFontScope templateKey={club.presentationTemplateKey}>{playback && <Nav />}<main>{preview}</main>{playback && <Footer />}</TemplateFontScope>}
        </HomepagePreviewFrame>
      </HomepagePreviewContext.Provider>
      {piece && disclosure && !isShared && !playback && <dialog ref={panel} className="hp-panel" aria-label={HOMEPAGE_PIECE_LABELS[piece]} aria-modal={mobile || undefined} onCancel={event => { event.preventDefault(); closePanel(); }} onKeyDown={event => {
        if (event.key === "Escape" && !mobile) { event.preventDefault(); closePanel(); }
        if (event.key === "Tab" && mobile) {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')).filter(control => control.getClientRects().length);
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <div className="hp-panel-heading"><h2>{HOMEPAGE_PIECE_LABELS[piece]}</h2>{saveButton}</div>
        <div className="hp-panel-fields">
        {!destination && <HomepageNotifications {...notificationProps} inModal />}
          {(piece !== "photos" || capabilities.photoCaptionEditable) && <HomepageFields clubName={club.name} piece={piece} draft={state.draft} disabled={frozen} change={(field, value) => dispatch({ type: "field-changed", field, value })} programs={editor.programs} more={disclosure.mode === "more"} />}
          {(piece === "hero.cta" || (piece === "photos" && capabilities.photoCaptionEditable)) && disclosure.mode !== "more" && <button className="hp-button" onClick={() => dispatch({ type: "disclosure-opened", mode: "more" })}>More options</button>}
          {isStory && <p className="hp-help">Blank fields use your website’s standard wording.</p>}
          {piece === "video" && <p className="hp-help">The video is set by Onzio.{!snapshot.videoSource && " Contact Onzio to add a video."}</p>}
          {piece === "photos" && <><p>{state.draft.photos.items.length} of 6 photos used</p>{state.draft.photos.items.map((photo, index) => <section key={photo.clientId} className="hp-photo" aria-label={`Photo ${index + 1}`}>
            {photo.url && <ResilientNativeImage src={photo.url} alt={photo.alt} />}
            <label htmlFor={`photo-${photo.clientId}`}>Describe this photo</label><input id={`photo-${photo.clientId}`} className="hp-field" value={photo.alt} disabled={frozen} maxLength={20000} aria-describedby={`photo-help-${photo.clientId}`} onChange={event => editor.updatePhoto(photo.clientId, { alt: event.target.value })} />
            <p id={`photo-help-${photo.clientId}`} className="hp-help">Helps people using screen readers understand the photo.</p>
            <div className="hp-photo-actions">{([-1, 1] as const).map(delta => <button className="hp-button" key={delta} disabled={frozen || (delta === -1 ? index === 0 : index === state.draft.photos.items.length - 1)} onClick={() => {
              const items = [...state.draft.photos.items]; [items[index], items[index + delta]] = [items[index + delta], items[index]];
              dispatch({ type: "photos-changed", photos: items.map((p, order) => ({ ...p, order })) });
            }}>{delta === -1 ? "Move up" : "Move down"}</button>)}<button className="hp-button" disabled={frozen} onClick={() => editor.removePhoto(photo.clientId)}>Remove photo</button></div>
            {photo.upload === "uploading" && <p role="status">Adding your photo…</p>}{photo.upload === "failed" && <div role="alert"><p>{photo.error?.message}</p><button className="hp-button" onClick={() => void editor.retryPhoto(photo.clientId)}>Try this photo again</button></div>}
          </section>)}<button className="hp-button" disabled={frozen || state.draft.photos.items.length >= 6} onClick={() => photoInput.current?.click()}>Add photo</button></>}
        </div>
        <div className="hp-panel-footer"><button className="hp-button" onClick={done}>Done</button></div>
      </dialog>}
    </div>
    {mobile && !disclosure && !destination && <div className="hp-mobile-notification-slot"><HomepageNotifications {...notificationProps} /></div>}
    <input ref={photoInput} className="sr-only" tabIndex={-1} aria-label="Choose homepage photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { editor.addPhotos(event.target.files); event.target.value = ""; }} />
    <div ref={thumbBar} className="hp-thumb-bar"><div className="hp-thumb-tools">{playback ? <button className="hp-button" onClick={() => setPlayback(false)}>Back to editing</button> : piece ? tools : parts.map(part => <button key={part.piece} className="hp-button" onClick={() => select(part.piece)}>{part.name}</button>)}</div><div className="hp-thumb-save">{saveButton}</div>{piece && <p className="hp-selected-name">{HOMEPAGE_PIECE_LABELS[piece]}</p>}</div>
    <dialog ref={dialog} className="hp-leave-dialog" aria-labelledby="hp-leave-title" onCancel={() => setDestination(null)}><h2 id="hp-leave-title">Save your homepage changes?</h2><p>Your changes have not been saved yet.</p>{destination && <HomepageNotifications {...notificationProps} inModal />}<div><button className="hp-button hp-save" disabled={!!getHomepageSaveBlocker(state) || !!editor.recoveryConflict} onClick={async () => { if (await editor.save()) { setDestination(null); if (destination) router.push(destination); } }}>Save and continue</button><button className="hp-button" onClick={() => setDestination(null)}>Keep editing</button><button className="hp-button" onClick={async () => { if (!await editor.discardUnsavedUploads()) return; await editor.clearRecovery(); setDestination(null); if (destination) router.push(destination); }}>Leave without saving</button></div></dialog>
  </div>;
}
