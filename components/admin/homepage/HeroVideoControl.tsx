"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Undo2, Upload, X } from "lucide-react";
import { EditorActionButton, EditorGroup, EditorNotice, EditorPrimaryButton, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";
import { heroVideoHint, megabytes, type HeroVideoController } from "@/lib/homepage-editor/hero-video-upload";
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
  useEffect(() => { if (locked) setConfirmRevert(false); }, [locked]);
  const left = status ? Math.max(0, status.replacesPerDay - status.replacesUsedToday) : null;
  const hint = heroVideoHint(phase);

  return <EditorGroup legend="Hero video">
    <p className={kit.hint}>Replacing or reverting the video changes your live website right away. It is not part of the Save button.</p>
    <div className={kit.image}>
      <div className={styles.preview} aria-busy={busy || undefined}>
        {status?.liveGuid
          ? <video key={status.liveGuid} src={bunnyVideoMp4Url(status.liveGuid, "240p")} muted playsInline controls preload="metadata" aria-label="Current hero video preview" />
          : <span className={kit.imageEmpty}>{phase === "loading" ? "Loading…" : "No hero video yet"}</span>}
      </div>
      {confirmRevert && !locked
        ? <div ref={confirmBox} className="grid gap-3" role="group" aria-label="Confirm revert" onKeyDown={onConfirmKeyDown}>
          <p className={kit.hint}>Go back to the previous video? It goes live on your website right away; you don’t need to press Save.</p>
          <div className={kit.imageActions}>
            <EditorPrimaryButton onClick={() => { setConfirmRevert(false); void controller.revert(); }}>Revert video</EditorPrimaryButton>
            <EditorActionButton onClick={cancelRevert}>Cancel</EditorActionButton>
          </div>
        </div>
        : <div className={kit.imageActions}>
          <input ref={input} type="file" className={kit.fileInput} tabIndex={-1} aria-label="Choose hero video" accept="video/*" disabled={locked}
            onChange={event => { const file = event.target.files?.[0]; if (file) void controller.replace(file); event.target.value = ""; }} />
          <button type="button" className={`admin-press ${kit.action}`} disabled={locked || !status} onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" />Replace video</button>
          {status?.previousGuid && <button ref={revertButton} type="button" className={`admin-press ${kit.action}`} disabled={locked} onClick={() => setConfirmRevert(true)}><Undo2 size={16} aria-hidden="true" />Revert to previous</button>}
          {phase === "uploading" && <button type="button" className={`admin-press ${kit.remove}`} onClick={() => controller.cancel()}><X size={14} aria-hidden="true" />Cancel upload</button>}
        </div>}
    </div>
    <div className={styles.progress} data-hero-phase={phase}>
      {barPercent !== null && <div className={styles.track} role="progressbar" aria-label="Hero video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={barPercent} aria-valuetext={state.message}>
        <div className={styles.bar} data-working={phase === "preparing" || undefined} style={{ width: `${barPercent}%` }} />
      </div>}
      <p role="status" aria-live="polite" className={`${kit.hint} ${styles.status}`}>{phase === "live" && <svg className={styles.check} viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" data-hero-check=""><path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} /></svg>}{phase === "error" ? "" : state.message}</p>
      {hint && <p className={kit.hint}>{hint}</p>}
    </div>
    {phase === "error" && error && <div role="alert" className={`${kit.notice} grid gap-2`} data-tone="error"><p>{error.message}</p>
      <div className="flex flex-wrap gap-2">
        {error.retry === "status" && <EditorActionButton onClick={() => void controller.retryStatus()}>Check again</EditorActionButton>}
        {error.retry === "load" && <EditorActionButton onClick={() => void controller.load()}>Try again</EditorActionButton>}
        {error.retry === null && status && <EditorActionButton onClick={() => controller.dismiss()}>Dismiss</EditorActionButton>}
      </div></div>}
    {state.revisionWarning && <EditorNotice failed>The video is live, but we couldn’t refresh this page’s version. Reload the page before you save other changes.</EditorNotice>}
    {state.revisionConflict && <EditorNotice failed>The homepage also changed somewhere else while your video was switching. Use “Load latest and keep my edits” before saving.</EditorNotice>}
    {left !== null && <p className={kit.hint}>{left} of {status!.replacesPerDay} replaces left today. Maximum file size {megabytes(status!.maxBytes)}, up to {Math.round(status!.maxSeconds / 60)} minutes, at least 720p.</p>}
  </EditorGroup>;
}

/** Keeps the page informed while an upload or processing runs and the edit dialog is closed. */
export function HeroVideoNotice({ controller, className }: { controller: HeroVideoController; className?: string }) {
  const { phase, message } = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  if (phase !== "uploading" && phase !== "preparing" && phase !== "reverting") return null;
  const hint = heroVideoHint(phase);
  return <div className={className} role="status"><p>{hint ? `${message} ${hint}` : message}</p></div>;
}
