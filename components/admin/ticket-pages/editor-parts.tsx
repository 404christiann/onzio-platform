"use client";

import { useId, type ReactNode } from "react";
import { IconAdd, IconCaretDown, IconCaretUp, IconDelete } from "@/components/admin/icons";
import NativeImage from "@/components/ResilientNativeImage";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { currentAdminTab, trackAdminEvent } from "@/lib/admin-analytics";
import { EditorField, EditorGroup } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { ImageFieldWithDescription, ValidationMessage } from "@/components/admin/ui/editor-kit";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import { mediaHint } from "@/lib/media-rules";
import { GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import styles from "./ticket-editors.module.css";
import { linkDestinationHint, linkDestinationProblem } from "@/lib/link-destination";

/** The artwork on these pages uploads to the homepage-artwork bucket, so every slot takes a graphic. */
export const IMAGE_RULES = adminImageRules("graphic");
/** The graphic type list from the rules, for each slot's description. */
export const IMAGE_TYPES = GRAPHIC_UPLOAD_TYPES_LABEL;
export const IMAGE_NOTE = `Images: ${mediaHint("graphic", { pixels: true })}.`;
export const ICON_HINT = `Leave the description empty: the label says what it is. Upload icons on the 752 × 350 canvas (${IMAGE_TYPES}) so every icon keeps its size and lines up.`;

/** Move up, move down and remove for one list item, with the icons.download glyphs. */
export function ReorderTools({ index, length, disabled, noun, onMove, onRemove }: { index: number; length: number; disabled: boolean; noun: string; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const name = `${noun} ${index + 1}`;
  return <div className={styles.tools}>
    <button type="button" className={`admin-press ${styles.tool} ${styles.iconTool}`} aria-label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><IconCaretUp size={16} aria-hidden="true" /></button>
    <button type="button" className={`admin-press ${styles.tool} ${styles.iconTool}`} aria-label={`Move ${name} down`} disabled={disabled || index === length - 1} onClick={() => onMove(1)}><IconCaretDown size={16} aria-hidden="true" /></button>
    <button type="button" className={`admin-press ${styles.tool}`} disabled={disabled} onClick={onRemove}><IconDelete size={16} aria-hidden="true" />Remove {name}</button>
  </div>;
}

export function AddButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`admin-press ${styles.tool}`} disabled={disabled} onClick={onClick}><IconAdd size={16} aria-hidden="true" />{children}</button>;
}

/** A text field that tells the person when they have reached the limit the page allows. */
export function TextField({ label, value, max, disabled, multiline, hint, invalid, error, target, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: ReactNode; invalid?: boolean; error?: string; target?: EditTargetId; onChange: (value: string) => void }) {
  const limitId = useId();
  const errorId = useId();
  const atLimit = value.length >= max;
  const describedBy = [error ? errorId : "", atLimit ? limitId : ""].filter(Boolean).join(" ") || undefined;
  return <div className={styles.fieldWithLimit} {...editTargetProps(target)}>
    <EditorField label={label} value={value} max={max} disabled={disabled} multiline={multiline} hint={hint} invalid={invalid || atLimit || Boolean(error)} describedBy={describedBy} onChange={onChange} />
    {error && <ValidationMessage id={errorId} live="polite">{error}</ValidationMessage>}
    {atLimit && <ValidationMessage id={limitId} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
  </div>;
}

/** A link destination field: the shared hint, and the shared error while the value is not a link. */
export function LinkTextField({ hintExtra, ...props }: Omit<Parameters<typeof TextField>[0], "hint" | "error"> & { hintExtra?: string }) {
  return <TextField {...props} hint={linkDestinationHint({ extra: hintExtra })} error={linkDestinationProblem(props.value)} />;
}

/** The "Show on the page" switch that opens a section's fields. `copy` says exactly what it hides. */
export function ShowRow({ label, title = "Show on the page", checked, disabled, onChange, copy }: { label: string; title?: string; checked: boolean; disabled: boolean; onChange: (shown: boolean) => void; copy?: ReactNode }) {
  return <div className={styles.showRow}>
    <span className={copy ? styles.showCopy : undefined} aria-hidden="true">{copy ? <><span>{title}</span><small>{copy}</small></> : title}</span>
    <AdminSwitch label={label} checked={checked} disabled={disabled} onCheckedChange={next => { trackAdminEvent("admin_visibility_toggled", { scope: `${currentAdminTab()}:section`, visible: next }); onChange(next); }} />
  </div>;
}

export type ImageSlotProps = {
  label: string; description: ReactNode; previewUrl: string | null; alt: string; hasImage: boolean; disabled: boolean; uploading: boolean;
  hint?: string; /** The click-to-field id of the image description. */ altTarget?: EditTargetId; size?: 64 | 72 | 96; /** Inside a card that already has its own legend. */ bare?: boolean; /** Show the picture on a dark tile too (white artwork). */ dark?: boolean;
  onUpload: (file: File) => Promise<boolean>; onRemove: () => void; onAlt: (alt: string) => void;
};

/** One picture: upload or replace, remove, and its description. */
export function ImageSlot({ label, description, previewUrl, alt, hasImage, disabled, uploading, hint, altTarget, size, bare, dark, onUpload, onRemove, onAlt }: ImageSlotProps) {
  const inner = <>
    <ImageFieldWithDescription label={label} description={description} previewUrl={previewUrl} initials="" size={size} disabled={disabled} uploading={uploading} {...IMAGE_RULES}
      onUpload={async files => { const file = files[0]; return file ? onUpload(file) : false; }} onRemove={hasImage ? onRemove : undefined} />
    {dark && previewUrl && <div className={styles.darkTile}><NativeImage src={previewUrl} alt="" /></div>}
    <TextField label="Image description" value={alt} max={1000} disabled={disabled} hint={hint} target={altTarget} onChange={onAlt} />
  </>;
  return bare ? inner : <EditorGroup legend={label}>{inner}</EditorGroup>;
}
