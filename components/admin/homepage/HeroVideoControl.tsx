"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import { CheckCircle2, CircleAlert, CloudUpload, FileVideo, Trash2, Undo2 } from "lucide-react";
import { EditorActionButton, EditorGroup, EditorNotice, EditorPrimaryButton, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";
import { HERO_VIDEO_COMPLETED_COPY } from "@/lib/hero-video-lifecycle";
import { heroVideoHint, megabytes, HERO_VIDEO_UPLOADING_COPY, HERO_VIDEO_PROCESSING_COPY, type HeroVideoController } from "@/lib/homepage-editor/hero-video-upload";
import styles from "./HeroVideoControl.module.css";

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
    if (enabled && file) void controller.replace(file);
  };
  const inFlight = phase === "uploading" || phase === "preparing";
  const showRow = phase === "uploading"|| phase === "preparing" || (phase === "live" && barPercent === 100) || (phase === "error" && !!error);
  const failed = phase === "error" && !!error;
  const completed = phase === "live";
  const fileName = state.fileName || "Video";
  const phaseLabel = completed ? HERO_VIDEO_COMPLETED_COPY : phase === "uploading" ? HERO_VIDEO_UPLOADING_COPY : HERO_VIDEO_PROCESSING_COPY;

  return <EditorGroup legend="Video">
    <p className={kit.hint}>Replacing or reverting the video changes your live website right away. It is not part of the Save button.</p>
    <div className={kit.image}>
      <div className={styles.preview} aria-busy={busy || undefined}>
        {status?.liveGuid
          ? <video key={status.liveGuid} src={bunnyVideoMp4Url(status.liveGuid, "240p")} muted playsInline controls preload="metadata" aria-label="Current hero video preview" />
          : <span className={kit.imageEmpty}>{phase === "loading" ? "Loading…" : "No video yet"}</span>}
      </div>
      {confirmRevert && !locked
        ? <div ref={confirmBox} className="grid gap-3" role="group" aria-label="Confirm revert" onKeyDown={onConfirmKeyDown}>
          <p className={kit.hint}>Go back to the previous video? It goes live on your website right away; you don’t need to press Save.</p>
          <div className={kit.imageActions}>
            <EditorPrimaryButton onClick={() => { setConfirmRevert(false); void controller.revert(); }}>Revert video</EditorPrimaryButton>
            <EditorActionButton onClick={cancelRevert}>Cancel</EditorActionButton>
          </div>
        </div>
        : status?.previousGuid && <div className={kit.imageActions}>
          <button ref={revertButton} type="button" className={`admin-press ${kit.action}`} disabled={locked} onClick={() => setConfirmRevert(true)}><Undo2 size={16} aria-hidden="true" />Revert to previous</button>
        </div>}
    </div>
    <input ref={input} type="file" className={kit.fileInput} tabIndex={-1} aria-label="Choose hero video" accept="video/*" disabled={locked}
      onChange={event => { const file = event.target.files?.[0]; if (file) void controller.replace(file); event.target.value = ""; }} />
    {/* While a video uploads or processes, its file row takes the drop zone's place. */}
    {!inFlight && <div className={styles.uploader}>
      <button type="button" className={`admin-press ${styles.zone}`} aria-disabled={!enabled || undefined} data-dragging={dragging || undefined}
        onClick={openPicker} onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop}>
        <span className={styles.zoneIcon}><CloudUpload size={20} aria-hidden="true" /></span>
        <span className={styles.zoneTitle}><span className={styles.zoneLink}>Click to upload</span> or drag and drop</span>
        <span className={styles.zoneHint}>{status ? `MP4, MOV or WebM · up to ${megabytes(status.maxBytes)} · up to ${Math.round(status.maxSeconds / 60)} minutes · at least 720p` : "MP4, MOV or WebM"}</span>
      </button>
    </div>}
    {showRow && <div className={styles.row} data-hero-row={failed ? "failed" : completed ? "completed" : phase} data-hero-phase={phase}>
      <span className={styles.rowIcon} data-tone={failed ? "error" : undefined}>{failed ? <CircleAlert size={18} aria-hidden="true" /> : <FileVideo size={18} aria-hidden="true" />}</span>
      <div className={styles.rowBody}>
        <div className={styles.rowHead}>
          <div className={styles.rowMeta}>
            <p className={styles.fileName} title={fileName}>{fileName}</p>
            {state.fileSize !== null && <p className={styles.fileSize}>{megabytes(state.fileSize)}</p>}
          </div>
          {phase === "uploading" && <button type="button" className={`admin-press ${styles.trash}`} aria-label="Cancel upload" onClick={() => controller.cancel()}><Trash2 size={16} aria-hidden="true" /></button>}
        </div>
        {barPercent !== null && !failed && <div className={styles.barLine}>
          <div className={styles.track} role="progressbar" aria-label="Hero video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={barPercent} aria-valuetext={state.message}>
            <div className={styles.bar} data-working={phase === "preparing" || undefined} style={{ width: `${barPercent}%` }} />
          </div>
          <span aria-hidden="true" className={styles.percent}>{barPercent}%</span>
        </div>}
        {!failed && <p className={styles.phaseLabel} aria-hidden="true">
          {completed && <CheckCircle2 className={styles.check} size={16} aria-hidden="true" data-hero-check="" />}{phaseLabel}
        </p>}
        {!failed && hint && <p className={kit.hint}>{hint}</p>}
        {failed && error && <div role="alert" className={`${styles.alert} grid gap-2`}><p>{error.message}</p>
          <div className="flex flex-wrap gap-2">
            {error.retry === "status" && <EditorActionButton onClick={() => void controller.retryStatus()}>Check again</EditorActionButton>}
            {error.retry === "load" && <EditorActionButton onClick={() => void controller.load()}>Try again</EditorActionButton>}
            {error.retry === null && status && <EditorActionButton onClick={openPicker}>Try again</EditorActionButton>}
            {error.retry === null && status && <EditorActionButton onClick={() => controller.dismiss()}>Dismiss</EditorActionButton>}
          </div></div>}
      </div>
    </div>}
    {left !== null && <p className={kit.hint}>{left} of {status!.replacesPerDay} replaces left today.</p>}
    <p role="status" aria-live="polite" className={`${kit.hint} ${styles.status}${showRow ? ` ${styles.srOnly}` : ""}`}>{phase === "error" ? "" : state.message}</p>
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
