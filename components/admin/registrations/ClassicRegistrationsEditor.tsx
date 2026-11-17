"use client";

import { AdminPage,AdminPageHeader,AdminPanel } from "@/components/admin/AdminPage";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminDialog,AdminDialogFooter,AdminDialogSection } from "@/components/admin/ui/AdminDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { formatRegistrationUsd } from "@/lib/registration-currency";
import { registrationPublicUrl } from "@/lib/registration-public-link";
import { useRef,useState } from "react";
import "./classic-registrations.css";
import { answerText,button,registrationName,type FormRow,type Registration } from "./registration-editor-model";
import { RegistrationFormFields } from "./RegistrationFormFields";
import { RegistrationAllForms,RegistrationFormCards,RegistrationFormStatus,type FormFilter } from "./RegistrationForms";
import { RegistrationLoading } from "./RegistrationLoading";
import { RegistrationPaymentAccount } from "./RegistrationPaymentAccount";
import { RegistrationRegistrants } from "./RegistrationRegistrants";
import { useRegistrationsEditor } from "./useRegistrationsEditor";

const sections = [{ id: "basics", label: "Basics" }, { id: "questions", label: "Questions" }, { id: "prices", label: "Price options" }, { id: "waiver", label: "Waiver" }] as const;

export function ClassicRegistrationsEditor() {
 const model = useRegistrationsEditor({ classic: true });
 const [allOpen, setAllOpen] = useState(false);
 const [query, setQuery] = useState("");
 const [filter, setFilter] = useState<FormFilter>("all");
 const [builderOpen, setBuilderOpen] = useState(false);
 const [section, setSection] = useState<(typeof sections)[number]["id"]>("basics");
 const [detail, setDetail] = useState<Registration | null>(null);
 const [action, setAction] = useState<"archive" | "delete" | null>(null);
 const [reloadOpen, setReloadOpen] = useState(false);
 const editorOpener = useRef<HTMLButtonElement>(null);
 const newFormOpener = useRef<HTMLButtonElement>(null);
 const latest = useRef(model);
 latest.current = model;
 const savedResult = useRef(false);
 const save = useSaveState({
  isDirty: model.isDirty && model.canEditStructure && !model.opening && !model.needsReview,
  onSave: async () => {
   savedResult.current = await latest.current.saveDraft();
   if (!savedResult.current) throw new Error("Could not save this form.");
  },
 });
 const busy = model.saving || save.state === "saving";
 const requestNavigation = useUnsavedGuard({
  dirty: model.isDirty || model.needsReview,
  edited: model.draft.title || "New registration form",
  onSave: async () => {
   const current = latest.current;
   if (current.needsReview || !current.canEditStructure) return false;
   try { await save.save(); return savedResult.current; } catch { return false; }
  },
  onDiscard: async () => { latest.current.discardDraft(); },
 });
 function navigate(label: string, proceed: () => void) {
  if (busy || model.opening) return;
  requestNavigation({ kind: "switch", label, continue: proceed });
 }
 function selectForm(form: FormRow) {
  if (model.draft.id === form.id) { setAllOpen(false); return; }
  navigate(form.title, () => { setAllOpen(false); setBuilderOpen(false); void model.edit(form); });
 }
 function openEditor(opener: HTMLButtonElement | null = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null) { if (model.loading || model.opening || busy) return; editorOpener.current = opener; setSection("basics"); setBuilderOpen(true); }
 function closeEditor() {
  if (busy) return;
  requestNavigation({ kind: "switch", label: "Registrants", continue: () => setBuilderOpen(false) });
 }
 function changeTab(tab: string) {
  if (tab === model.formTab) return;
  model.setFormTab(tab as "build" | "registrants");
 }
 const selected = model.selectedFormRow;
 return <AdminPage className="classic-registrations">
  <AdminPageHeader eyebrow="Registrations" title="Registrations" description="Pick a form to see who has signed up for it." actions={<>
   {selected && <a className="admin-press registration-header-button" href={"/api/admin/registrations/export?formId=" + selected.id}>Download list</a>}
   <button type="button" className="admin-press registration-header-button" disabled={model.loading || model.opening || !selected || Boolean(model.draft.archivedAt) || busy} onClick={() => openEditor()}>Edit form</button>
   <button ref={newFormOpener} type="button" className="admin-press registration-header-button registration-primary" disabled={model.loading || busy || model.opening} onClick={(event) => { const opener = event.currentTarget; navigate("New form", () => { model.startNew(); openEditor(opener); }); }}>New form</button>
  </>} />
  {model.loadError && <p role="alert" className="registration-message">{model.loadError}</p>}
  {model.message && <p role="status" className="registration-message">{model.message}</p>}
  {model.needsReview && <div role="alert" className="registration-recovery"><p>Some changes may already be saved. Your draft is retained here. Reload and review the saved form before saving again.</p><button type="button" className="admin-press registration-header-button" onClick={() => setReloadOpen(true)}>Reload and review</button></div>}
  {!model.loading && !model.connect?.chargesEnabled && <RegistrationPaymentAccount model={model} />}
  <span className="sr-only" role="status">{model.opening ? "Loading selected form…" : ""}</span>
  <RegistrationLoading loading={model.loading || model.opening} quietRefresh={!model.loading && model.draft.id !== null}>
   <RegistrationFormCards model={model} onSelect={selectForm} onAll={() => { setFilter("all"); setQuery(""); setAllOpen(true); }} />
   {selected ? <>
    <div className="registration-workspace-heading"><div><h2>{selected.title}</h2><RegistrationFormStatus form={selected} /></div>
     {!selected.archived_at && <div className="registration-lifecycle">
      {selected.status !== "draft" && <button type="button" className="admin-press registration-header-button" onClick={() => void model.copyLink(selected)}>Copy link</button>}
      <button type="button" className="admin-press registration-header-button" disabled={busy || model.opening || model.needsReview} onClick={() => navigate(selected.status === "open" ? "Stop registrations" : "Publish form", () => void model.runFormAction(selected, selected.status === "open" ? "stop" : "publish"))}>{selected.status === "open" ? "Stop registrations" : "Publish"}</button>
      <button type="button" className="admin-press registration-header-button" disabled={busy || model.opening || model.needsReview} onClick={() => navigate("Archive form", () => setAction("archive"))}>Archive</button>
      {(model.formCounts[selected.id]?.total ?? 0) === 0 && <button type="button" className="admin-press registration-header-button text-destructive" disabled={busy || model.opening || model.needsReview} onClick={() => navigate("Delete form", () => setAction("delete"))}>Delete</button>}
     </div>}
    </div>
    <AdminTabs items={[{ id: "registrants", label: "Registrants", badge: model.roster.length }, { id: "build", label: "Form" }]} value={model.formTab} onChange={changeTab} tabsId="registration-form" label="Form sections" />
    {model.draft.archivedAt && <p className="registration-message">Archived forms are read-only. Registrant data and CSV export remain available below.</p>}
    <RegistrationRegistrants model={model} onView={setDetail} />
    <section id="registration-form-panel-build" role="tabpanel" aria-labelledby="registration-form-tab-build" hidden={model.formTab !== "build"} className="registration-form-summary">
     <div className="registration-summary-heading"><div><h3>{model.draft.title || "Untitled form"}</h3><p>{model.draft.description || "No description added."}</p></div><button type="button" className="admin-press registration-header-button" disabled={model.opening || Boolean(model.draft.archivedAt) || busy} onClick={() => openEditor()}>Edit form</button></div>
     <div className="registration-summary-grid"><AdminPanel><h3>Questions</h3><ul>{[...model.core, ...model.draft.custom].map((field) => <li key={field.field_key}>{field.label}{field.required ? " · Required" : ""}</li>)}</ul></AdminPanel><AdminPanel><h3>Price options</h3><ul>{model.draft.prices.map((price, i) => <li key={price.id ?? i}>{price.label} · {price.amount || "0"} USD{price.active ? "" : " · Inactive"}</li>)}</ul></AdminPanel></div>
     <AdminPanel><h3>Sign-up link</h3><p className="break-all">{registrationPublicUrl({ currentOrigin: typeof window === "undefined" ? "" : window.location.origin, primaryDomain: model.club.primaryDomain, formSlug: model.draft.slug })}</p><button type="button" className="admin-press registration-header-button mt-3" onClick={() => void model.copyLink(selected)}>Copy link</button></AdminPanel>
    </section>
   </> : <p className="registration-empty">Select a form from All forms, or create a new form.</p>}
  </RegistrationLoading>
  <RegistrationAllForms model={model} open={allOpen} onClose={() => setAllOpen(false)} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onSelect={selectForm} />
  <AdminDialog open={builderOpen} onClose={closeEditor} title={model.draft.title || "New form"} eyebrow="Registration form" size="xl" busy={busy} finalFocus={() => editorOpener.current?.isConnected && !editorOpener.current.disabled ? editorOpener.current : newFormOpener.current ?? false} footer={<AdminDialogFooter primary={<AdminSaveButton state={save.state} onSave={() => void save.save().catch(() => undefined)} className="registration-dialog-action" />} status={model.message ?? "Families see changes the next time they open the form."}><button type="button" className={button + " registration-dialog-action border border-border"} disabled={busy} onClick={closeEditor}>Cancel</button></AdminDialogFooter>}>
   {model.needsReview && <div role="alert" className="registration-recovery"><p>Reload and review before saving again. Your draft is retained.</p><button type="button" className="registration-header-button" onClick={() => setReloadOpen(true)}>Reload and review</button></div>}
   {model.draft.status === "open" && <p className="registration-message">Stop registrations before editing this form.</p>}
   <div className="registration-builder"><nav aria-label="Form editor sections">{sections.map((item) => <button type="button" className="admin-press" key={item.id} aria-current={section === item.id || undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav><fieldset disabled={busy || model.opening || Boolean(model.draft.archivedAt)}><AdminDialogSection title={sections.find((item) => item.id === section)!.label}><RegistrationFormFields model={model} section={section} readOnly={model.draft.status === "open"} /></AdminDialogSection></fieldset></div>
  </AdminDialog>
  <AdminDialog open={detail !== null} onClose={() => setDetail(null)} title={detail ? registrationName(detail) : "Registration details"} eyebrow={selected?.title} size="md" footer={<AdminDialogFooter primary={<button type="button" className={button + " registration-dialog-action border border-border"} onClick={() => setDetail(null)}>Close</button>} />}>
   {detail && <><p>{formatRegistrationUsd(detail.amount_cents)} · {detail.price_label} · {detail.status}</p>{detail.payment_recovery_required && <p role="alert" className="registration-recovery">Payment completion needs manual review before this record is treated as confirmed.</p>}<dl className="registration-detail">{model.answerRows(detail).map((answer) => <div key={answer.key}><dt>{answer.label}</dt><dd>{answer.isSignature ? "Signature captured" : answerText(answer.value)}</dd></div>)}<div><dt>Email</dt><dd>{detail.registrant_email}</dd></div><div><dt>Email delivery</dt><dd>Registrant {detail.registrant_email_status} · Admin {detail.admin_email_status}{detail.email_error ? " · " + detail.email_error : ""}</dd></div></dl></>}
  </AdminDialog>
  <AdminConfirmDialog open={action !== null} title={action === "delete" ? "Delete this empty form?" : "Archive this form?"} confirmLabel={action === "delete" ? "Delete form" : "Archive form"} destructive busy={model.saving} onCancel={() => setAction(null)} onConfirm={() => { if (selected && action) { void model.runFormAction(selected, action); setAction(null); } }}>{action === "delete" ? "Permanently delete this empty form? This cannot be undone." : "Registrant data and CSV export will remain available in All forms under Archived."}</AdminConfirmDialog>
  <AdminConfirmDialog open={reloadOpen} title="Reload and review saved changes?" confirmLabel="Reload forms" busy={busy} onCancel={() => setReloadOpen(false)} onConfirm={() => window.location.reload()}>This form may have been partly saved. Reloading discards this local draft and shows the server&apos;s current forms. Review them before creating or saving another form.</AdminConfirmDialog>
 </AdminPage>;
}
