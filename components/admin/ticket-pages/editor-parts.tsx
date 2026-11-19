"use client";

import { useId, type ReactNode } from "react";
import { IconAdd, IconCaretDown, IconCaretUp, IconDelete } from "@/components/admin/icons";
import NativeImage from "@/components/ResilientNativeImage";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { EditorField, EditorGroup } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ImageFieldWithDescription, ValidationMessage } from "@/components/admin/ui/editor-kit";
import styles from "./ticket-editors.module.css";

export const IMAGE_RULES = { allowedTypes: ["image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 } as const;
export const IMAGE_NOTE = "Images: PNG or WebP, up to 5 MB and 3000 pixels per side.";

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
export function TextField({ label, value, max, disabled, multiline, hint, invalid, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: ReactNode; invalid?: boolean; onChange: (value: string) => void }) {
  const limitId = useId();
  const atLimit = value.length >= max;
  return <div className={styles.fieldWithLimit}>
    <EditorField label={label} value={value} max={max} disabled={disabled} multiline={multiline} hint={hint} invalid={invalid || atLimit} describedBy={atLimit ? limitId : undefined} onChange={onChange} />
    {atLimit && <ValidationMessage id={limitId} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
  </div>;
}

/** The "Show on the page" switch that opens a section's fields. `copy` says exactly what it hides. */
export function ShowRow({ label, title = "Show on the page", checked, disabled, onChange, copy }: { label: string; title?: string; checked: boolean; disabled: boolean; onChange: (shown: boolean) => void; copy?: ReactNode }) {
  return <div className={styles.showRow}>
    <span className={copy ? styles.showCopy : undefined} aria-hidden="true">{copy ? <><span>{title}</span><small>{copy}</small></> : title}</span>
    <AdminSwitch label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>;
}

export type ImageSlotProps = {
  label: string; description: ReactNode; previewUrl: string | null; alt: string; hasImage: boolean; disabled: boolean; uploading: boolean;
  hint?: string; size?: 64 | 72 | 96; /** Inside a card that already has its own legend. */ bare?: boolean; /** Show the picture on a dark tile too (white artwork). */ dark?: boolean;
  onUpload: (file: File) => Promise<boolean>; onRemove: () => void; onAlt: (alt: string) => void;
};

/** One picture: upload or replace, remove, and its description. */
export function ImageSlot({ label, description, previewUrl, alt, hasImage, disabled, uploading, hint, size, bare, dark, onUpload, onRemove, onAlt }: ImageSlotProps) {
  const inner = <>
    <ImageFieldWithDescription label={label} description={description} previewUrl={previewUrl} initials="" size={size} disabled={disabled} uploading={uploading} {...IMAGE_RULES}
      onUpload={async files => { const file = files[0]; return file ? onUpload(file) : false; }} onRemove={hasImage ? onRemove : undefined} />
    {dark && previewUrl && <div className={styles.darkTile}><NativeImage src={previewUrl} alt="" /></div>}
    <TextField label="Image description" value={alt} max={1000} disabled={disabled} hint={hint} onChange={onAlt} />
  </>;
  return bare ? inner : <EditorGroup legend={label}>{inner}</EditorGroup>;
}
