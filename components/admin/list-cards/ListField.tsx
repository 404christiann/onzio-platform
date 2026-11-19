"use client";

import { useId, type ReactNode } from "react";
import { kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { IconCaretDown, IconCaretUp, IconDelete } from "@/components/admin/icons";
import { ValidationMessage } from "@/components/admin/ui/editor-kit";
import styles from "./ListEditor.module.css";

/** A labelled text field that says when it reaches the limit the page allows, and shows a save error under it. */
export function ListField({ label, value, max, disabled, multiline, hint, error, onChange }: {
  label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: ReactNode; error?: string; onChange: (value: string) => void;
}) {
  const id = useId();
  const atLimit = value.length >= max;
  const described = [hint ? `${id}-hint` : null, atLimit ? `${id}-limit` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const props = { id, disabled, value, maxLength: max, "aria-invalid": error ? true : undefined, "aria-describedby": described } as const;
  return <div className={kit.field}>
    <label htmlFor={id}>{label}</label>
    {multiline
      ? <textarea {...props} onChange={event => onChange(event.target.value)} />
      : <input {...props} onChange={event => onChange(event.target.value)} />}
    {hint && <span id={`${id}-hint`} className={kit.hint}>{hint}</span>}
    {atLimit && <ValidationMessage id={`${id}-limit`} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
    {error && <ValidationMessage id={`${id}-error`}>{error}</ValidationMessage>}
  </div>;
}

/** Move earlier, move later and remove for the item being edited. The buttons name the item. */
export function PositionTools({ index, length, name, noun, disabled, onMove, onRemove, note }: {
  index: number; length: number; name: string; noun: string; disabled: boolean; onMove: (delta: -1 | 1) => void; onRemove: () => void; note: string;
}) {
  return <fieldset className={`${kit.group}`}>
    <legend>Position</legend>
    <p className={styles.note}>{noun[0].toUpperCase() + noun.slice(1)} {index + 1} of {length}. {note}</p>
    <div className={styles.tools} style={{ marginBlockStart: 12 }}>
      <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} earlier`} data-move-earlier="" disabled={disabled || index === 0} onClick={() => onMove(-1)}><IconCaretUp size={16} aria-hidden="true" />Earlier</button>
      <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} later`} data-move-later="" disabled={disabled || index === length - 1} onClick={() => onMove(1)}><IconCaretDown size={16} aria-hidden="true" />Later</button>
      <button type="button" className={`admin-press ${styles.tool}`} data-danger="" aria-label={`Remove ${name}`} disabled={disabled} onClick={onRemove}><IconDelete size={16} aria-hidden="true" />Remove {noun}</button>
    </div>
  </fieldset>;
}
