"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import { Check, CheckCircle2, CircleAlert, CloudUpload, FileVideo, Undo2, X } from "lucide-react";
import { EditorActionButton, EditorGroup, EditorNotice, EditorPrimaryButton, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";
import { HERO_VIDEO_SUCCESS_DETAIL_COPY, HERO_VIDEO_SUCCESS_TITLE_COPY } from "@/lib/hero-video-lifecycle";
import { heroVideoHint, megabytes, type HeroVideoController } from "@/lib/homepage-editor/hero-video-upload";
import styles from "./HeroVideoControl.module.css";

/** How long the success state holds before it fades, and how long the fade takes (keep in step with the CSS). */
const HERO_SUCCESS_HOLD_MS = 2500;
const HERO_SUCCESS_EXIT_MS = 200;
/**
 * The success state shows once per live video. The controller outlives the edit dialog, so what was already shown is
 * remembered per controller: reopening the dialog after it faded goes straight back to the invitation.
 */
const acknowledgedSuccess = new WeakMap<HeroVideoController, string>();
/**
 * The chosen file's first frame, display only. It lives per controller so it survives the edit dialog closing and
 * reopening mid-upload, and it is shown only while the controller's file name is still this file's name.
 */
const localThumbs = new WeakMap<HeroVideoController, { url: string; name: string }>();
const dropThumb = (controller: HeroVideoController) => {
  const thumb = localThumbs.get(controller);
  if (thumb) URL.revokeObjectURL(thumb.url);
  localThumbs.delete(controller);
};

type Face = "idle" | "flight" | "done" | "failed";

/**
 * Rose City hero video: replace or revert the background video. Both go live on the site by themselves through their
 * own endpoint; they are not part of the editor's Save. The controller lives in the Overview editor so an upload keeps
 * running while the person closes this dialog or edits another part.
 */
export default function HeroVideoControl({ controller, disabled }: { controller: HeroVideoController; disabled: boolean }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const input = useRef<HTMLInputElement>(null);
  const revertButton = useRef<HTMLButtonElement>(null);
  const confirmBox = useRef<HTMLDivElement>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [exit, setExit] = useState<"leaving" | "returned" | null>(null);
  const [, setThumbVersion] = useState(0);
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const restoreFocus = useRef(false);
  // The confirmation is inline (a nested dialog would sit under the edit dialog): focus follows it in and out.
  useEffect(() => {
    // preventScroll: focusing must not scroll the dialog's overflow:hidden popup. scrollIntoView only moves the
    // nearest auto-overflow panel.
    const focusQuietly = (target: HTMLElement | null | undefined) => {
      if (!target) return;
      target.scrollIntoView({ block: "nearest" });
      target.focus({ preventScroll: true });
    };
    if (confirmRevert) focusQuietly(confirmBox.current?.querySelector("button"));
    else if (restoreFocus.current) { restoreFocus.current = false; focusQuietly(revertButton.current); }
  }, [confirmRevert]);
  const cancelRevert = () => { restoreFocus.current = true; setConfirmRevert(false); };
  // Escape closes only this confirmation, never the edit dialog around it.
  const onConfirmKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
    cancelRevert();
  };
  const { phase, status, error, barPercent } = state;
  const busy = phase === "loading" || phase === "uploading" || phase === "preparing" || phase === "reverting";
  const locked = disabled || busy;
  const enabled = !locked && !!status;
  useEffect(() => { if (locked) setConfirmRevert(false); }, [locked]);
  useEffect(() => { if (!enabled) setDragging(false); }, [enabled]);
  const left = status ? Math.max(0, status.replacesPerDay - status.replacesUsedToday) : null;
  const hint = heroVideoHint(phase);
  const openPicker = () => { if (enabled) input.current?.click(); };
  // The one entry point for a chosen or dropped file: remember its first frame, then hand the file on untouched.
  const replaceWith = (file: File) => {
    dropThumb(controller);
    localThumbs.set(controller, { url: URL.createObjectURL(file), name: file.name });
    setThumbVersion(version => version + 1);
    void controller.replace(file);
  };
  // A browser opens a dropped file unless the drop is cancelled, so the zone always cancels it and only acts when enabled.
  const onDrag = (event: DragEvent) => {
    event.preventDefault();
    if (event.type === "dragleave") { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); return; }
    if (event.dataTransfer) event.dataTransfer.dropEffect = enabled ? "copy" : "none";
    if (enabled) setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (enabled && file) replaceWith(file);
  };
  const inFlight = phase === "uploading" || phase === "preparing";
  const failed = phase === "error" && !!error;
  // A video that just went live (after a replace in this tab, or a swap that finished while away) shows the success face
  // in the box, holds, fades, and is then acknowledged so it never shows again for that video.
  const successKey = phase === "live" && barPercent === 100 ? (status?.liveGuid ?? "live") : null;
  const acknowledged = successKey !== null && acknowledgedSuccess.get(controller) === successKey;
  const showCard = successKey !== null && !acknowledged;
  useEffect(() => {
    if (successKey === null || acknowledgedSuccess.get(controller) === successKey) return;
    let done: ReturnType<typeof setTimeout> | undefined;
    const hold = setTimeout(() => {
      setExit("leaving");
      done = setTimeout(() => { acknowledgedSuccess.set(controller, successKey); setExit("returned"); }, HERO_SUCCESS_EXIT_MS);
    }, HERO_SUCCESS_HOLD_MS);
    return () => { clearTimeout(hold); clearTimeout(done); setExit(null); };
  }, [controller, successKey]);

  const face: Face = failed ? "failed" : inFlight ? "flight" : showCard ? "done" : "idle";
  // The first frame is only needed while the file is in flight or its success shows; once that is over, release it.
  const keepThumb = inFlight || showCard;
  const wasKeepingThumb = useRef(keepThumb);
  useEffect(() => {
    if (wasKeepingThumb.current && !keepThumb) dropThumb(controller);
    wasKeepingThumb.current = keepThumb;
  }, [controller, keepThumb]);
  // Faces fade in when they replace one another, never on the page's first paint.
  const firstFace = useRef<Face | null>(face);
  const enter = firstFace.current === null || firstFace.current !== face;
  useEffect(() => { if (face !== firstFace.current) firstFace.current = null; }, [face]);

  const stored = localThumbs.get(controller);
  const thumbUrl = stored && state.fileName === stored.name ? stored.url : null;
  const thumbPlays = thumbUrl !== null && brokenThumb !== thumbUrl;
  const fileName = state.fileName || "Video";
  const phaseWord = phase === "uploading" ? "Uploading" : "Processing";
  const percent = barPercent ?? 0;
  const leaving = exit === "leaving" || undefined;
  const liveName = phase === "live" ? state.fileName : null;
  const thumb = thumbUrl && <video key={thumbUrl} src={`${thumbUrl}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" hidden={!thumbPlays} onError={() => setBrokenThumb(thumbUrl)} />;

  return <EditorGroup legend="Video" className={styles.section}>
    {left !== null && <span className={styles.meter} role="img" aria-label={`${left} of ${status!.replacesPerDay} replaces left today`}>
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: status!.replacesPerDay }, (_, index) => <span key={index} data-on={index < left || undefined} />)}
      </span>
      <span className={styles.meterText} aria-hidden="true">{left} of {status!.replacesPerDay} left today</span>
    </span>}
    <p className={kit.hint}>Replacing or reverting the video changes your live website right away. It is not part of the Save button.</p>
    <div className={styles.live}>
      <div className={styles.preview} aria-busy={busy || undefined}>
        {status?.liveGuid
          ? <video key={status.liveGuid} src={bunnyVideoMp4Url(status.liveGuid, "240p")} muted playsInline controls preload="metadata" aria-label="Current hero video preview" />
          : <span className={kit.imageEmpty}>{phase === "loading" ? "Loading…" : "No video yet"}</span>}
        <span className={styles.badge} data-hero-badge="" data-on={(showCard && exit !== "leaving") || undefined} aria-hidden="true"><span className={styles.badgeDot} />Live</span>
      </div>
      <div className={styles.liveMeta}>
        <span className={styles.eyebrow}>On your website</span>
        {status?.liveGuid && <span key={liveName ?? ""} className={styles.liveName} data-unknown={liveName ? undefined : ""} title={liveName ?? undefined}>{liveName ?? "Current video"}</span>}
        {!(confirmRevert && !locked) && status?.previousGuid && <button ref={revertButton} type="button" className={`admin-press ${kit.action} ${styles.revert}`} disabled={locked} onClick={() => setConfirmRevert(true)}><Undo2 size={16} aria-hidden="true" />Revert to previous</button>}
      </div>
    </div>
    {confirmRevert && !locked && <div ref={confirmBox} className="grid gap-3" role="group" aria-label="Confirm revert" onKeyDown={onConfirmKeyDown}>
      <p className={kit.hint}>Go back to the previous video? It goes live on your website right away; you don’t need to press Save.</p>
      <div className={kit.imageActions}>
        <EditorPrimaryButton onClick={() => { setConfirmRevert(false); void controller.revert(); }}>Revert video</EditorPrimaryButton>
        <EditorActionButton onClick={cancelRevert}>Cancel</EditorActionButton>
      </div>
    </div>}
    <input ref={input} type="file" className={kit.fileInput} tabIndex={-1} aria-label="Choose hero video" accept="video/*" disabled={locked}
      onChange={event => { const file = event.target.files?.[0]; if (file) replaceWith(file); event.target.value = ""; }} />
    {/* One box in the same spot for the invitation, the file in flight, the failure and the success: only its contents change. */}
    <div className={styles.box} data-face={face} data-leaving={leaving} data-lead={face === "done" && !thumbUrl ? "circle" : undefined}>
      {(face === "flight" || face === "done") && (face === "done" && !thumbUrl
        ? <span className={styles.lead} data-leaving={leaving} data-enter={enter || undefined} aria-hidden="true"><span className={styles.checkCircle}><CheckCircle2 className={styles.check} size={22} aria-hidden="true" data-hero-check="" /></span></span>
        : <span className={styles.lead} data-leaving={leaving} data-enter={enter || undefined} aria-hidden="true">
          <span className={styles.thumb} data-fallback={thumbPlays ? undefined : "icon"}>
            {thumb}
            {!thumbPlays && <FileVideo size={18} aria-hidden="true" />}
          </span>
          {face === "done" && <span className={styles.thumbCheck}><Check size={10} strokeWidth={3.5} aria-hidden="true" data-hero-check="" /></span>}
        </span>)}
      {face === "idle" && <button type="button" className={`admin-press ${styles.zone}`} aria-disabled={!enabled || undefined} data-dragging={dragging || undefined} data-returning={exit === "returned" || undefined} data-enter={enter || undefined}
        onClick={openPicker} onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop}>
        <span className={styles.zoneIcon}><CloudUpload size={20} aria-hidden="true" /></span>
        <span className={styles.text}>
          <span className={styles.title}><span className={styles.zoneLink}>Click to upload</span> or drag and drop</span>
          <span className={styles.meta}>{status ? `MP4, MOV or WebM · ${megabytes(status.maxBytes)} · ${Math.round(status.maxSeconds / 60)} min · 720p+` : "MP4, MOV or WebM"}</span>
        </span>
      </button>}
      {face === "flight" && <div className={styles.face} data-hero-row={phase} data-hero-phase={phase} data-enter={enter || undefined}>
        <span className={styles.text}>
          <span className={`${styles.title} ${styles.fileName}`} title={fileName}>{fileName}</span>
          <span className={styles.meta}>
            {state.fileSize !== null && <span className={styles.metaItem}>{megabytes(state.fileSize)}</span>}
            {hint && <span className={styles.metaItem}>{hint}</span>}
          </span>
        </span>
        <span className={styles.end}>
          <span className={styles.phasePercent} aria-hidden="true"><span className={styles.phaseWord}>{phaseWord}</span> <span className={styles.percent}>{percent}%</span></span>
          {phase === "uploading"
            ? <button type="button" className={`admin-press ${styles.cancel}`} aria-label="Cancel upload" onClick={() => controller.cancel()}><X size={16} aria-hidden="true" /></button>
            : <span className={styles.cancel} aria-hidden="true" />}
        </span>
      </div>}
      {face === "done" && <div className={styles.face} data-hero-row="completed" data-leaving={leaving} data-enter={enter || undefined} aria-hidden="true">
        <span className={styles.text}>
          <span className={styles.title}>{HERO_VIDEO_SUCCESS_TITLE_COPY}</span>
          <span className={styles.meta}>{HERO_VIDEO_SUCCESS_DETAIL_COPY}</span>
        </span>
      </div>}
      {face === "failed" && error && <div className={styles.face} data-hero-row="failed" data-enter={enter || undefined}>
        <span className={styles.failIcon}><CircleAlert size={18} aria-hidden="true" /></span>
        <div role="alert" className={`${styles.alert} grid gap-2`}><p>{error.message}</p>
          <div className="flex flex-wrap gap-2">
            {error.retry === "status" && <EditorActionButton onClick={() => void controller.retryStatus()}>Check again</EditorActionButton>}
            {error.retry === "load" && <EditorActionButton onClick={() => void controller.load()}>Try again</EditorActionButton>}
            {error.retry === null && status && <EditorActionButton onClick={openPicker}>Try again</EditorActionButton>}
            {error.retry === null && status && <EditorActionButton onClick={() => controller.dismiss()}>Dismiss</EditorActionButton>}
          </div></div>
      </div>}
      <span className={styles.dash} aria-hidden="true" />
      {face === "flight" && barPercent !== null && <div className={styles.track} role="progressbar" aria-label="Hero video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={barPercent} aria-valuetext={state.message}>
        <div className={styles.bar} data-working={phase === "preparing" || undefined} style={{ width: `${barPercent}%` }} />
      </div>}
    </div>
    <p role="status" aria-live="polite" className={`${kit.hint} ${styles.status}${face !== "idle" ? ` ${styles.srOnly}` : ""}`}>{phase === "error" || acknowledged ? "" : state.message}</p>
    {state.revisionWarning && <EditorNotice failed>The video is live, but we couldn’t refresh this page’s version. Reload the page before you save other changes.</EditorNotice>}
    {state.revisionConflict && <EditorNotice failed>The homepage also changed somewhere else while your video was switching. Use “Load latest and keep my edits” before saving.</EditorNotice>}
  </EditorGroup>;
}

/** Keeps the page informed while an upload or processing runs and the edit dialog is closed. */
export function HeroVideoNotice({ controller, className }: { controller: HeroVideoController; className?: string }) {
  const { phase, message } = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  if (phase !== "uploading" && phase !== "preparing" && phase !== "reverting") return null;
  const hint = heroVideoHint(phase);
  return <div className={className} role="status"><p>{hint ? `${message} ${hint}` : message}</p></div>;
}
