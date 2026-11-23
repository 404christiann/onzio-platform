"use client";

import { useState } from "react";
import { IconAdd, IconCaretDown, IconCaretUp, IconDelete } from "@/components/admin/icons";
import { ListField, PositionTools } from "@/components/admin/list-cards/ListField";
import lists from "@/components/admin/list-cards/ListEditor.module.css";
import { POLICY_LIMITS, type CinematicPolicyDraft, type PolicyPageKey } from "@/lib/cinematic-policies-content";
import { POLICY_PAGE_NAMES, type PolicyDraftAction } from "@/lib/cinematic-policies-draft";
import { POLICY_TARGETS, lineTarget, rowHeadingTarget } from "./policies-edit-targets";
import { parseDialogId, type PolicyDialogId } from "./policies-sections";
import styles from "./policies.module.css";

export type PolicyFieldsApi = {
  draft: CinematicPolicyDraft;
  page: PolicyPageKey;
  locked: boolean;
  /** Field-level messages by key: `<page>.title`, `<page>.<row id>.heading`. Shown after a refused save. */
  errors: Record<string, string>;
  /** Every edit goes through the same reducer the editor has always used. */
  edit: (action: PolicyDraftAction) => void;
  moveRow: (index: number, delta: -1 | 1) => void;
  removeRow: (index: number) => void;
};

function PageFields({ api }: { api: PolicyFieldsApi }) {
  const { draft, page, locked, errors, edit } = api;
  const current = draft[page];
  const set = (field: "title" | "subtitle" | "heading") => (value: string) => edit({ type: "set-page", page, field, value });
  return <div className={lists.fields}>
    <ListField label="Title" value={current.title} max={POLICY_LIMITS.title} disabled={locked} error={errors[`${page}.title`]} target={POLICY_TARGETS.title} onChange={set("title")} />
    <ListField label="Red line under the title" value={current.subtitle} max={POLICY_LIMITS.title} disabled={locked} hint="Leave blank to hide it." target={POLICY_TARGETS.subtitle} onChange={set("subtitle")} />
    <ListField label="Section heading" value={current.heading} max={POLICY_LIMITS.title} disabled={locked} hint="Shown above the rows. Leave blank to hide it." target={POLICY_TARGETS.heading} onChange={set("heading")} />
  </div>;
}

function RowFields({ api, rowId }: { api: PolicyFieldsApi; rowId: string }) {
  const { draft, page, locked, errors, edit, moveRow, removeRow } = api;
  const [confirming, setConfirming] = useState(false);
  const rows = draft[page].rows;
  const index = rows.findIndex(row => row.id === rowId);
  const row = rows[index];
  if (!row) return null;
  const name = row.heading.trim() || `Row ${index + 1}`;
  const full = row.blocks.length >= POLICY_LIMITS.blocks;
  return <div className={lists.fields}>
    <ListField label="Row heading" value={row.heading} max={POLICY_LIMITS.heading} disabled={locked} error={errors[`${page}.${row.id}.heading`]} target={rowHeadingTarget(row.id)}
      hint="The line visitors tap to open the answer." onChange={value => edit({ type: "set-heading", page, row: index, value })} />
    <div className={styles.section}>
      <h3 className={styles.answerHead}>Answer · {row.blocks.length} of {POLICY_LIMITS.blocks} lines</h3>
      {row.blocks.length === 0
        ? <p className={styles.noAnswer}>No answer yet. The site shows “Details coming soon.”</p>
        : <ul className={styles.lines} aria-label={`${name} answer lines`}>
          {row.blocks.map((line, lineIndex) => {
            const number = lineIndex + 1, subheading = line.kind === "subheading";
            return <li key={lineIndex} className={styles.line}>
              <div className={styles.lineHead}>
                <label className={styles.lineTitle}>
                  <span>Line {number} type</span>
                  <select disabled={locked} value={line.kind} onChange={event => edit({ type: "set-line-kind", page, row: index, line: lineIndex, kind: event.target.value as typeof line.kind })}>
                    <option value="subheading">Subheading</option>
                    <option value="paragraph">Paragraph</option>
                  </select>
                </label>
                <span className={styles.lineTools}>
                  <button type="button" className={`admin-press ${lists.tool}`} aria-label={`Move line ${number} up`} disabled={locked || lineIndex === 0} onClick={() => edit({ type: "move-line", page, row: index, line: lineIndex, by: -1 })}><IconCaretUp size={16} aria-hidden="true" /></button>
                  <button type="button" className={`admin-press ${lists.tool}`} aria-label={`Move line ${number} down`} disabled={locked || lineIndex === row.blocks.length - 1} onClick={() => edit({ type: "move-line", page, row: index, line: lineIndex, by: 1 })}><IconCaretDown size={16} aria-hidden="true" /></button>
                  <button type="button" className={`admin-press ${lists.tool}`} aria-label={`Remove line ${number}`} disabled={locked} onClick={() => edit({ type: "remove-line", page, row: index, line: lineIndex })}><IconDelete size={16} aria-hidden="true" /></button>
                </span>
              </div>
              <ListField label={`Line ${number} ${subheading ? "subheading" : "paragraph"}`} value={line.text} max={subheading ? POLICY_LIMITS.subheading : POLICY_LIMITS.paragraph} multiline={!subheading} disabled={locked}
                hint={line.text.trim() ? undefined : "Empty lines are left out when you save."} target={lineTarget(row.id, lineIndex)} onChange={text => edit({ type: "set-line", page, row: index, line: lineIndex, text })} />
            </li>;
          })}
        </ul>}
      <div className={styles.adds}>
        <button type="button" className={`admin-press ${lists.tool}`} disabled={locked || full} onClick={() => edit({ type: "add-line", page, row: index, kind: "subheading" })}><IconAdd size={16} aria-hidden="true" />Add subheading</button>
        <button type="button" className={`admin-press ${lists.tool}`} disabled={locked || full} onClick={() => edit({ type: "add-line", page, row: index, kind: "paragraph" })}><IconAdd size={16} aria-hidden="true" />Add paragraph</button>
        {full && <span className={styles.limit} role="status">{POLICY_LIMITS.blocks} lines is the most an answer can hold.</span>}
      </div>
    </div>
    {confirming
      ? <div className={styles.removeRow} role="group" aria-label={`Remove ${name}`}>
        <p>Remove “{name}”? The row and its answer are removed from your draft. Nothing changes on the site until you save.</p>
        <div className={lists.tools}>
          <button type="button" className={`admin-press ${lists.tool}`} data-danger="" disabled={locked} onClick={() => removeRow(index)}><IconDelete size={16} aria-hidden="true" />Remove row</button>
          <button type="button" className={`admin-press ${lists.tool}`} onClick={() => setConfirming(false)}>Keep row</button>
        </div>
      </div>
      : <PositionTools index={index} length={rows.length} name={name} noun="row" disabled={locked} note={`Rows appear on ${POLICY_PAGE_NAMES[page]} in this order.`}
        onMove={delta => moveRow(index, delta)} onRemove={() => setConfirming(true)} />}
  </div>;
}

/** The fields of one dialog section: the page heading, or one row with its answer lines. */
export function PolicyDialogFields({ api, id }: { api: PolicyFieldsApi; id: PolicyDialogId }) {
  const target = parseDialogId(id);
  if (!target) return null;
  return target.kind === "page" ? <PageFields api={api} /> : <RowFields key={target.id} api={api} rowId={target.id} />;
}
