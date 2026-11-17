"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";
import { AdminPanel } from "@/components/admin/AdminPage";
import { ChevronDown, ChevronUp, IconExternalLink, IconUpload, X } from "@/components/admin/icons";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import saveButton from "@/components/admin/ui/AdminSaveButton.module.css";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { PreviewToggle } from "@/components/admin/ui/PreviewToggle";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import type { SaveState } from "@/components/admin/ui/useSaveState";
import NativeImage from "@/components/ResilientNativeImage";
import { Button } from "@/components/ui/button";
import { ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";
import styles from "./CinematicEditorKit.module.css";

/** Presentational pieces shared by the cinematic page editors. None of them load, validate or save data. */
export const kit = styles;

/** A short "Saved" confirmation on the Save button after a committed save, cleared by the next edit. */
export function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), ADMIN_MOTION_DURATIONS.savedShown);
    return () => window.clearTimeout(timer);
  }, [saved]);
  return [saved, setSaved] as const;
}

export function editorSaveState({ busy, canSave, saved }: { busy: boolean; canSave: boolean; saved: boolean }): SaveState {
  return busy ? "saving" : canSave ? "dirty" : saved ? "saved" : "clean";
}

export function EditorPageLink({ href, children, onClick }: { href: string; children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return <Link className={styles.pageLink} href={href} target="_blank" onClick={onClick}>
    <IconExternalLink size={15} aria-hidden="true" />{children}<span className="sr-only"> (opens in a new tab)</span>
  </Link>;
}

export function EditorNotice({ failed, children }: { failed: boolean; children: ReactNode }) {
  return <div className={styles.notice} data-tone={failed ? "error" : "info"} role={failed ? "alert" : "status"}>{children}</div>;
}

export function EditorSection({ title, description, aside, children, className }: {
  title: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  const headingId = useId();
  return <AdminPanel aria-labelledby={headingId} className={className}>
    <div className={styles.sectionHead}>
      <div className={styles.sectionHeading}>
        <h2 id={headingId} className={styles.sectionTitle}>{title}</h2>
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </div>
      {aside && <span className={styles.sectionAside}>{aside}</span>}
    </div>
    {children}
  </AdminPanel>;
}

export function EditorGroup({ legend, children, className, invalid }: { legend: ReactNode; children: ReactNode; className?: string; invalid?: boolean }) {
  return <fieldset className={className ? `${styles.group} ${className}` : styles.group} data-invalid={invalid || undefined}>
    <legend>{legend}</legend>
    <div className="grid min-w-0 gap-4">{children}</div>
  </fieldset>;
}

export function EditorLoading({ label, failed, onRetry }: { label: string; failed: boolean; onRetry: () => void }) {
  return <AdminPanel>
    <div className={styles.loading}>
      {!failed && <><Shimmer className={`${styles.loadingLine} w-48`} /><Shimmer className={`${styles.loadingLine} w-full`} /><Shimmer className={`${styles.loadingLine} w-3/4`} /></>}
      <p role="status" className={styles.note}>{label}</p>
      {failed && <div><Button className="min-h-11" onClick={onRetry}>Try again</Button></div>}
    </div>
  </AdminPanel>;
}

export function EditorSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <div className={styles.switchRow}>
    <span aria-hidden="true">{label}</span>
    <AdminSwitch label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>;
}

export function EditorSegmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <div className={styles.segmented} role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

export function EditorIconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`admin-press ${styles.action} ${styles.iconAction}`} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function EditorRemoveButton({ label, disabled, onClick, children = "Remove" }: { label?: string; disabled?: boolean; onClick: () => void; children?: ReactNode }) {
  return <button type="button" className={`admin-press ${styles.remove}`} aria-label={label} disabled={disabled} onClick={onClick}><X width="14" height="14" aria-hidden="true" />{children}</button>;
}

export function EditorActionButton({ disabled, onClick, children, className }: { disabled?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return <button type="button" className={`admin-press ${styles.action}${className ? ` ${className}` : ""}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** One image slot styled like AdminImageField. The editor's own upload and remove handlers run unchanged. */
export function EditorImage({ label, noun = "image", url, alt = "", accept, hint, empty, tone, shape, uploading, disabled, hasImage, onFile, onRemove, removeDisabled }: {
  label: string; noun?: string; url?: string | null; alt?: string; accept: string; hint?: ReactNode; empty: string;
  tone?: "light" | "dark"; shape?: "wide"; uploading: boolean; disabled: boolean; hasImage: boolean;
  onFile: (file: File) => void; onRemove?: () => void; removeDisabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const action = uploading ? "Uploading…" : `${hasImage ? "Replace" : "Upload"} ${noun}`;
  return <div className={styles.image}>
    <div className={styles.imagePreview} data-tone={tone} data-shape={shape} aria-busy={uploading || undefined}>
      {url ? <NativeImage src={url} alt={alt} /> : <span className={styles.imageEmpty}>{empty}</span>}
    </div>
    <div className={styles.imageActions}>
      <input ref={input} className={styles.fileInput} type="file" accept={accept} tabIndex={-1} aria-label={`Choose ${label.toLowerCase()}`} disabled={disabled}
        onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
      <button type="button" className={`admin-press ${styles.action}`} disabled={disabled} aria-describedby={hint ? hintId : undefined} aria-label={`${action} (${label})`} onClick={() => input.current?.click()}>
        <IconUpload size={16} aria-hidden="true" />{action}
      </button>
      {onRemove && <EditorRemoveButton label={`Remove ${label.toLowerCase()}`} disabled={removeDisabled ?? disabled} onClick={onRemove} />}
    </div>
    {hint && <span id={hintId} className={styles.hint}>{hint}</span>}
  </div>;
}

/** The public-page preview: device toggle, optional extra controls, then the frame at phone or desktop width. */
export function EditorPreview({ title = "What visitors see", phone, onPhoneChange, controls, children }: {
  title?: ReactNode; phone: boolean; onPhoneChange: (phone: boolean) => void; controls?: ReactNode; children: ReactNode;
}) {
  return <section className={styles.preview} aria-label="Page preview">
    <div className={styles.previewToolbar}>
      <span>{title}</span>
      <div className={styles.previewControls}>{controls}<PreviewToggle value={phone ? "phone" : "desktop"} onChange={value => onPhoneChange(value === "phone")} /></div>
    </div>
    <div className={styles.previewViewport} style={{ "--hp-viewport": "100dvh" } as CSSProperties}>
      <div className={styles.previewCanvas} style={{ width: phone ? 390 : 1280 }}>{children}</div>
    </div>
  </section>;
}

/** A primary action with AdminSaveButton's 38px look and a custom label (retrying an unconfirmed save, adding an article). */
export function EditorPrimaryButton({ busy = false, disabled = false, onClick, children }: { busy?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  const inactive = busy || disabled;
  return <button type="button" className={`admin-press ${saveButton.button}`} data-state={busy ? "saving" : disabled ? "clean" : "dirty"}
    aria-disabled={inactive || undefined} aria-busy={busy || undefined}
    onClick={event => { if (inactive) { event.preventDefault(); return; } onClick(); }}>
    <span className={saveButton.label}>{children}</span>
  </button>;
}

export function EditorSecondaryButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`admin-press ${styles.secondary}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

/**
 * The sticky save bar. While an earlier save awaits confirmation the primary button retries that exact save;
 * otherwise it is AdminSaveButton with main's Save changes / Saving… / Saved wording.
 */
export function EditorSaveBar({ state, retry = false, status, onSave, primary, children }: {
  state: SaveState; retry?: boolean; status: string; onSave: () => void; primary?: ReactNode; children?: ReactNode;
}) {
  return <div className={styles.saveBar} data-cinematic-save-bar="">
    <span className={styles.saveStatus} role="status">{status}</span>
    <div className={styles.saveButtons}>
      {primary ?? (retry && state !== "saving"
        ? <EditorPrimaryButton onClick={onSave}>Retry same save</EditorPrimaryButton>
        : <AdminSaveButton state={state} onSave={onSave} />)}
      {children}
    </div>
  </div>;
}

/** One labelled text field (the Rose City visitor-page editors). The label is linked to the control by id. */
export function EditorField({ label, value, max, disabled, multiline, hint, invalid, describedBy, onChange }: {
  label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: ReactNode;
  invalid?: boolean; describedBy?: string; onChange: (value: string) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const described = [hint ? hintId : null, describedBy].filter(Boolean).join(" ") || undefined;
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea id={id} disabled={disabled} value={value} maxLength={max} aria-describedby={described} onChange={event => onChange(event.target.value)} />
      : <input id={id} disabled={disabled} value={value} maxLength={max} aria-invalid={invalid || undefined} aria-describedby={described} onChange={event => onChange(event.target.value)} />}
    {hint && <span id={hintId} className={styles.hint}>{hint}</span>}
  </div>;
}

/** Move up, move down and remove for one item in a list. The icon buttons name the item they move. */
export function EditorReorderButtons({ index, length, disabled, noun, removeLabel, onMove, onRemove }: {
  index: number; length: number; disabled: boolean; noun: string; removeLabel?: string;
  onMove: (delta: -1 | 1) => void; onRemove: () => void;
}) {
  const name = `${noun} ${index + 1}`;
  return <div className={styles.toolbar}>
    <EditorIconButton label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ChevronUp width="16" height="16" /></EditorIconButton>
    <EditorIconButton label={`Move ${name} down`} disabled={disabled || index === length - 1} onClick={() => onMove(1)}><ChevronDown width="16" height="16" /></EditorIconButton>
    <EditorRemoveButton disabled={disabled} onClick={onRemove}>{removeLabel ?? `Remove ${name}`}</EditorRemoveButton>
  </div>;
}

/** For editors on useSaveState: hold Save while an upload or reload runs, without hiding a running save or its Saved tick. */
export function heldSaveState(state: SaveState, held: boolean): SaveState {
  return held && state === "dirty" ? "clean" : state;
}
