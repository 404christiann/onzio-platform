"use client";
import { AdminDialog,AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { button,formStatusLabel,type FormRow } from "./registration-editor-model";
import type { RegistrationsEditorModel } from "./useRegistrationsEditor";

export function RegistrationFormStatus({ form }: { form: FormRow }) {
  return <span className="registration-form-status" data-status={form.archived_at ? "archived" : form.status}><i aria-hidden="true" />{formStatusLabel(form)}</span>;
}

export function RegistrationFormCards({ model, onSelect, onAll }: { model: RegistrationsEditorModel; onSelect: (form: FormRow) => void; onAll: () => void }) {
  const cards = model.forms.filter((form) => !form.archived_at).slice(0, 4);
  if (model.selectedFormRow && !cards.some((form) => form.id === model.selectedFormRow?.id)) {
    if (cards.length === 4) cards[3] = model.selectedFormRow;
    else cards.push(model.selectedFormRow);
  }
  return <section aria-label="Registration forms" className="registration-form-cards">
    {cards.map((form) => <button type="button" key={form.id} className="admin-press registration-form-card" aria-pressed={model.draft.id === form.id} disabled={model.saving || model.opening} onClick={() => onSelect(form)}>
      <span className="registration-form-card-title">{form.title}</span>
      <span className="registration-form-card-count">{model.formCounts[form.id]?.paid ?? 0} paid registrants</span>
      <RegistrationFormStatus form={form} />
    </button>)}
    <button type="button" className="admin-press registration-form-card registration-all-card" onClick={onAll} disabled={model.saving || model.opening}>
      <span className="registration-form-card-title">All forms</span><span className="registration-form-card-count">{model.forms.length} forms · search and filter</span>
    </button>
    {cards.length === 0 && <p className="registration-empty">No registration forms yet. Create a form, add its fields and pricing, then publish it.</p>}
  </section>;
}

export type FormFilter = "all" | "open" | "draft" | "closed" | "archived";
export function RegistrationAllForms({ model, open, onClose, query, onQuery, filter, onFilter, onSelect }: { model: RegistrationsEditorModel; open: boolean; onClose: () => void; query: string; onQuery: (query: string) => void; filter: FormFilter; onFilter: (filter: FormFilter) => void; onSelect: (form: FormRow) => void }) {
  const matches = model.forms.filter((form) => {
    const statusMatches = filter === "archived" ? Boolean(form.archived_at) : !form.archived_at && (filter === "all" || form.status === filter);
    return statusMatches && form.title.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <AdminDialog open={open} onClose={onClose} title="All forms" eyebrow={model.forms.length + " forms"} size="md" busy={model.opening} footer={<AdminDialogFooter primary={<button type="button" className={button + " registration-dialog-action border border-border"} onClick={onClose}>Close</button>} />}>
    <label className="registration-search">Search forms<input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by form name" /></label>
    <div className="registration-chips" aria-label="Form status">
      {(["all", "open", "draft", "closed", "archived"] as const).map((status) => <button type="button" className="admin-press" key={status} aria-pressed={filter === status} onClick={() => onFilter(status)}>{status === "all" ? "All active" : status === "open" ? "Live" : status[0].toUpperCase() + status.slice(1)}{status === "archived" ? " · " + model.archivedFormCount : ""}</button>)}
    </div>
    <div className="registration-form-rows">
      {matches.map((form) => <button type="button" className="admin-press registration-form-row" key={form.id} aria-current={model.draft.id === form.id || undefined} disabled={model.opening} onClick={() => onSelect(form)}>
        <span><b>{form.title}</b><small>{model.formCounts[form.id]?.paid ?? 0} paid registrants</small></span><RegistrationFormStatus form={form} />
      </button>)}
      {matches.length === 0 && <p className="registration-empty">No forms match. Try a different name or status.</p>}
    </div>
  </AdminDialog>;
}
