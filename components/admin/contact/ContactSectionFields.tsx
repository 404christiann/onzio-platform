"use client";

import { useId } from "react";
import { EditorField } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ValidationMessage } from "@/components/admin/ui/editor-kit";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import { linkDestinationHint } from "@/lib/link-destination";
import { CONTACT_ROUTES, type CinematicContactContent, type ContactAction } from "@/lib/cinematic-contact-content";
import styles from "./ContactEditor.module.css";
import { CONTACT_TARGETS, contactRowTarget } from "./contact-edit-targets";
import { contactSectionTitle, type ContactSectionId } from "./contact-sections";

export type ContactFieldsApi = {
  draft: CinematicContactContent;
  locked: boolean;
  /** Field messages. Empty until a save was refused, then kept current as the draft changes. */
  errors: Record<string, string>;
  /** Edits a copy of the draft, as the editor always has. */
  update: (edit: (value: CinematicContactContent) => void) => void;
};

/** A text field with its limit and, once a save was refused, the message the schema gives for it. */
function Field({ label, value, max, locked, error, hint, target, onChange }: { label: string; value: string; max: number; locked: boolean; error?: string; hint?: string; target?: EditTargetId; onChange: (value: string) => void }) {
  const base = useId(), errorId = `${base}-error`, limitId = `${base}-limit`;
  const atLimit = value.length >= max;
  const described = [error ? errorId : null, atLimit ? limitId : null].filter(Boolean).join(" ") || undefined;
  return <div className={styles.fieldWrap} {...editTargetProps(target)}>
    <EditorField label={label} value={value} max={max} disabled={locked} hint={hint} invalid={!!error || atLimit} describedBy={described} onChange={onChange} />
    {error && <ValidationMessage id={errorId} live="polite">{error}</ValidationMessage>}
    {atLimit && <ValidationMessage id={limitId} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
  </div>;
}

/** The fields of one card. Each edits the same content key it always did. */
export function ContactSectionFields({ api, id }: { api: ContactFieldsApi; id: ContactSectionId }) {
  const { draft, locked, errors, update } = api;
  if (id === "heading") return <div className={styles.stack}>
    <Field label="Title" value={draft.title} max={120} locked={locked} error={errors.title} target={CONTACT_TARGETS.title} onChange={value => update(v => { v.title = value; })} />
    <Field label="Subtitle" value={draft.subtitle} max={120} locked={locked} error={errors.subtitle} target={CONTACT_TARGETS.subtitle} onChange={value => update(v => { v.subtitle = value; })} />
  </div>;
  const action: ContactAction = id, row = draft.rows[action];
  return <div className={styles.stack}>
    <Field label="Row text" value={row.prompt} max={120} locked={locked} error={errors[`rows.${action}.prompt`]} target={contactRowTarget(action, "prompt")} hint="The line visitors read, left of the button." onChange={value => update(v => { v.rows[action].prompt = value; })} />
    <Field label="Button text" value={row.action} max={60} locked={locked} error={errors[`rows.${action}.action`]} target={contactRowTarget(action, "action")} onChange={value => update(v => { v.rows[action].action = value; })} />
    {action === "information"
      ? <Field label="Information destination" value={draft.informationHref} max={2000} locked={locked} error={errors.informationHref} target={contactRowTarget("information", "destination")}
          hint={linkDestinationHint({ extra: "Leave blank to keep the button inactive." })} onChange={value => update(v => { v.informationHref = value; })} />
      : <p className={styles.route}>The {contactSectionTitle(id)} button opens <code>{CONTACT_ROUTES[action]}</code>. That page is managed on its own editor, so its destination is not changed here.</p>}
  </div>;
}
