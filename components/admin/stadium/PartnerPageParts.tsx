"use client";

import { useId, type ReactNode } from "react";
import { IconAdd, IconCaretDown, IconCaretUp, IconDelete } from "@/components/admin/icons";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { EditorField } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ValidationMessage } from "@/components/admin/ui/editor-kit";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import styles from "./PartnerPageParts.module.css";

/** The small pieces the Foothill Transit and Chick-fil-A dialogs share. Same look as the Stadium dialog. */

/** Move up, move down and remove for one list item. */
export function ReorderButtons({ index, length, disabled, noun, onMove, onRemove }: { index: number; length: number; disabled: boolean; noun: string; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const name = `${noun} ${index + 1}`;
  return <div className={styles.tools}>
    <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><IconCaretUp size={16} aria-hidden="true" /></button>
    <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} down`} disabled={disabled || index === length - 1} onClick={() => onMove(1)}><IconCaretDown size={16} aria-hidden="true" /></button>
    <button type="button" className={`admin-press ${styles.tool}`} disabled={disabled} onClick={onRemove}><IconDelete size={16} aria-hidden="true" />Remove {name}</button>
  </div>;
}

export function ActionButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`admin-press ${styles.tool}`} disabled={disabled} onClick={onClick}><IconAdd size={16} aria-hidden="true" />{children}</button>;
}

/** A text field that tells the person when they have reached the limit the page allows. `target` is the click-to-field id a preview click focuses it by. */
export function TextField({ label, value, max, disabled, multiline, hint, target, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: string; target?: EditTargetId; onChange: (value: string) => void }) {
  const limitId = useId();
  const atLimit = value.length >= max;
  return <div className={styles.fieldWithLimit} {...editTargetProps(target)}>
    <EditorField label={label} value={value} max={max} disabled={disabled} multiline={multiline} hint={hint} invalid={atLimit} describedBy={atLimit ? limitId : undefined} onChange={onChange} />
    {atLimit && <ValidationMessage id={limitId} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
  </div>;
}

/** A row with the section's own show/hide switch. */
export function ShowRow({ label, switchLabel, checked, disabled, onChange, describedBy }: { label: string; switchLabel: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void; describedBy?: string }) {
  return <div className={styles.showRow}>
    <span aria-hidden="true">{label}</span>
    <AdminSwitch label={switchLabel} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-describedby={describedBy} />
  </div>;
}

/** The row shown for a section with no show/hide flag in the saved page. */
export function AlwaysShownRow({ note }: { note?: string }) {
  return <div className={styles.showRow}><span>Always shown</span>{note && <span className={styles.note}>{note}</span>}</div>;
}
