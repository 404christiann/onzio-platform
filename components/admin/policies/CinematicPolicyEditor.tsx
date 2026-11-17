"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { EditorActionButton, EditorGroup, EditorIconButton, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorRemoveButton, EditorSaveBar, EditorSecondaryButton, EditorSection, EditorSegmented, editorSaveState, kit, useSavedFlash } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { ChevronDown, ChevronUp } from "@/components/admin/icons";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import CinematicPolicyPage from "@/components/cinematic/CinematicPolicyPage";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { POLICY_LIMITS, POLICY_PAGES, POLICY_PAGE_PATHS, cinematicPolicyDraftSchema, cinematicPolicySaveSchema, starterCinematicPolicyContent, type CinematicPolicyDraft, type CinematicPolicySave, type CinematicPolicySnapshot, type PolicyPageKey } from "@/lib/cinematic-policies-content";
import { POLICY_PAGE_NAMES, policyDraftReducer, preparePolicySave, type PolicyDraftAction } from "@/lib/cinematic-policies-draft";
import { loadCinematicPolicyEditor, saveCinematicPolicyEditor } from "@/lib/cinematic-policies-editor";
import "@/components/admin/homepage/homepage-editor.css";

const recoverySchema = z.object({ content: cinematicPolicyDraftSchema, pending: cinematicPolicySaveSchema.nullable() });
const TEXTAREA_CLASS = `${ADMIN_INPUT_CLASS} min-h-24 resize-y`;

export default function CinematicPolicyEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicPolicySnapshot | null>(null);
  const [draft, setDraft] = useState<CinematicPolicyDraft | null>(null);
  const [pending, setPending] = useState<CinematicPolicySave | null>(null);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [page, setPage] = useState<PolicyPageKey>("guidelines");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState(true);
  const [confirmReload, setConfirmReload] = useState(false);
  const [removeRow, setRemoveRow] = useState<{ page: PolicyPageKey; row: number; heading: string } | null>(null);
  const [justSaved, setJustSaved] = useSavedFlash();
  const recoveryKey = useRef<string | null>(null);
  const saved = snapshot?.content ?? starterCinematicPolicyContent();
  const dirty = !!snapshot && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);

  useEffect(() => {
    let active = true;
    setSnapshot(null); setDraft(null); setPending(null); setMessage(""); setFailed(false); recoveryKey.current = null;
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicPolicyEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)]).then(([loaded, user, homepage]) => {
      if (!active) return;
      if (!user.data.user) throw new Error("Sign in again to edit these pages.");
      const key = `onzio:cinematic-policies:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      let recovered: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) recovered = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(loaded);
      setDraft(recovered?.content ?? loaded.content ?? starterCinematicPolicyContent());
      setPending(recovered?.pending ?? null);
      setShared(homepage);
      if (recovered) setMessage(recovered.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved draft has been restored.");
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load the policy pages."); setFailed(true); } });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending }));
      else localStorage.removeItem(recoveryKey.current);
    } catch {}
  }, [draft, snapshot, dirty, pending]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Stadium Guidelines & Fan Code" description="This editor is unavailable for this website design." /></AdminPage>;
  const locked = busy || !!pending;
  const edit = (action: PolicyDraftAction) => { setDraft(current => current ? policyDraftReducer(current, action) : current); setMessage(""); setFailed(false); setJustSaved(false); };
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };

  async function save() {
    if (!draft || !snapshot || busy) return;
    let request = pending;
    if (!request) {
      const ready = preparePolicySave(draft);
      if (!ready.ok) { setMessage(ready.message); setFailed(true); return; }
      request = { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: ready.content };
    }
    setPending(request); setBusy(true); setMessage("Saving…"); setFailed(false);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request })); } catch {}
    const result = await saveCinematicPolicyEditor(request);
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? starterCinematicPolicyContent()); setPending(null);
      setMessage("Stadium Guidelines and Fan Code of Conduct saved."); clearRecovery(); setJustSaved(true);
    } else if (result.status === "uncertain") {
      setPending(result.request); setMessage(result.message); setFailed(true);
    } else {
      setPending(null); setMessage(result.message); setFailed(true);
    }
  }

  async function reload(confirmed = false) {
    if (locked) return;
    if (dirty && !confirmed) { setConfirmReload(true); return; }
    try {
      const loaded = await loadCinematicPolicyEditor();
      setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicPolicyContent());
      setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload the policy pages."); setFailed(true); }
  }

  const current = draft?.[page];
  const textField = (label: string, value: string, maximum: number, onChange: (value: string) => void, hint?: string) =>
    <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>{label}</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={value} maxLength={maximum} onChange={event => onChange(event.target.value)} />{hint && <span className={kit.hint}>{hint}</span>}</label>;

  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title="Stadium Guidelines & Fan Code" description="Edit both accordion pages. Save applies all changes to both pages together."
      actions={<EditorPageLink href={POLICY_PAGE_PATHS[page]}>Open {POLICY_PAGE_NAMES[page]}</EditorPageLink>} />
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!draft || !snapshot || !current ? <EditorLoading label="Loading…" failed={failed} onRetry={() => location.reload()} /> : <>
      <div><EditorSegmented label="Page to edit" value={page} onChange={setPage} options={POLICY_PAGES.map(key => ({ value: key, label: POLICY_PAGE_NAMES[key] }))} /></div>
      <EditorSection title={`${POLICY_PAGE_NAMES[page]}: page heading`}><div className="grid gap-5 md:grid-cols-3">
        {textField("Title", current.title, POLICY_LIMITS.title, value => edit({ type: "set-page", page, field: "title", value }))}
        {textField("Red line under the title", current.subtitle, POLICY_LIMITS.title, value => edit({ type: "set-page", page, field: "subtitle", value }), "Leave blank to hide it.")}
        {textField("Section heading", current.heading, POLICY_LIMITS.title, value => edit({ type: "set-page", page, field: "heading", value }), "Shown above the rows. Leave blank to hide it.")}
      </div></EditorSection>
      <EditorSection title="Rows" description={`Each row opens to show its answer. An answer is a list of subheadings and paragraphs. A row without an answer shows “Details coming soon.” The first row with an answer starts open. Up to ${POLICY_LIMITS.rows} rows, ${POLICY_LIMITS.blocks} lines per answer.`}>
        <div className="grid gap-4">{current.rows.map((row, index) => <EditorGroup key={row.id} legend={`Row ${index + 1}`}>
          {textField("Row heading", row.heading, POLICY_LIMITS.heading, value => edit({ type: "set-heading", page, row: index, value }))}
          <div className="grid gap-3">
            {row.blocks.map((line, lineIndex) => <div key={lineIndex} className={kit.subgroup}>
              <div className={kit.toolbar}>
                <label className="flex items-center gap-2 text-sm"><span className="font-medium">Line {lineIndex + 1}</span>
                  <select className="min-h-11 rounded-xl border border-input bg-card px-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/15" disabled={locked} value={line.kind} onChange={event => edit({ type: "set-line-kind", page, row: index, line: lineIndex, kind: event.target.value as typeof line.kind })}>
                    <option value="subheading">Subheading</option><option value="paragraph">Paragraph</option>
                  </select></label>
                <span className={kit.spacer} />
                <EditorIconButton label={`Row ${index + 1}: move line ${lineIndex + 1} up`} disabled={locked || lineIndex === 0} onClick={() => edit({ type: "move-line", page, row: index, line: lineIndex, by: -1 })}><ChevronUp width="16" height="16" /></EditorIconButton>
                <EditorIconButton label={`Row ${index + 1}: move line ${lineIndex + 1} down`} disabled={locked || lineIndex === row.blocks.length - 1} onClick={() => edit({ type: "move-line", page, row: index, line: lineIndex, by: 1 })}><ChevronDown width="16" height="16" /></EditorIconButton>
                <EditorRemoveButton label={`Row ${index + 1}: remove line ${lineIndex + 1}`} disabled={locked} onClick={() => edit({ type: "remove-line", page, row: index, line: lineIndex })} />
              </div>
              {line.kind === "subheading"
                ? <input className={ADMIN_INPUT_CLASS} aria-label={`Row ${index + 1}, line ${lineIndex + 1} subheading`} disabled={locked} value={line.text} maxLength={POLICY_LIMITS.subheading} onChange={event => edit({ type: "set-line", page, row: index, line: lineIndex, text: event.target.value })} />
                : <textarea className={TEXTAREA_CLASS} aria-label={`Row ${index + 1}, line ${lineIndex + 1} paragraph`} disabled={locked} value={line.text} maxLength={POLICY_LIMITS.paragraph} onChange={event => edit({ type: "set-line", page, row: index, line: lineIndex, text: event.target.value })} />}
            </div>)}
            {row.blocks.length === 0 && <p className={kit.note}>No answer yet. The site shows “Details coming soon.”</p>}
          </div>
          <div className={kit.toolbar}>
            <EditorActionButton disabled={locked || row.blocks.length >= POLICY_LIMITS.blocks} onClick={() => edit({ type: "add-line", page, row: index, kind: "subheading" })}>Add subheading</EditorActionButton>
            <EditorActionButton disabled={locked || row.blocks.length >= POLICY_LIMITS.blocks} onClick={() => edit({ type: "add-line", page, row: index, kind: "paragraph" })}>Add paragraph</EditorActionButton>
            <span className={kit.spacer} />
            <EditorIconButton label={`Move row ${index + 1} up`} disabled={locked || index === 0} onClick={() => edit({ type: "move-row", page, row: index, by: -1 })}><ChevronUp width="16" height="16" /></EditorIconButton>
            <EditorIconButton label={`Move row ${index + 1} down`} disabled={locked || index === current.rows.length - 1} onClick={() => edit({ type: "move-row", page, row: index, by: 1 })}><ChevronDown width="16" height="16" /></EditorIconButton>
            <EditorRemoveButton label={`Remove row ${index + 1}`} disabled={locked} onClick={() => setRemoveRow({ page, row: index, heading: row.heading || `Row ${index + 1}` })}>Remove row</EditorRemoveButton>
          </div>
        </EditorGroup>)}</div>
        <div className="mt-5"><EditorActionButton disabled={locked || current.rows.length >= POLICY_LIMITS.rows} onClick={() => edit({ type: "add-row", page, id: crypto.randomUUID() })}>Add row</EditorActionButton></div>
      </EditorSection>
      <EditorPreview title={`What visitors see · ${POLICY_PAGE_NAMES[page]}`} phone={phone} onPhoneChange={setPhone}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={POLICY_PAGE_NAMES[page]}><CinematicShell contentOnly initialContent={shared}><CinematicPolicyPage page={current} /></CinematicShell></HomepagePreviewFrame></EditorPreview>
      <EditorSaveBar state={editorSaveState({ busy, canSave: !busy && (dirty || !!pending), saved: justSaved })} retry={!!pending} onSave={() => void save()} status={pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : ""}>
        <EditorSecondaryButton disabled={locked} onClick={() => void reload()}>Reload saved pages</EditorSecondaryButton>
      </EditorSaveBar>
    </>}
    <AdminConfirmDialog open={confirmReload} title="Discard your edits?" confirmLabel="Discard and reload" destructive onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(true); }}>Your unsaved edits to both pages will be discarded and the saved pages loaded.</AdminConfirmDialog>
    <AdminConfirmDialog open={removeRow !== null} title={`Remove “${removeRow?.heading ?? ""}”?`} confirmLabel="Remove row" destructive onCancel={() => setRemoveRow(null)} onConfirm={() => { if (removeRow) edit({ type: "remove-row", page: removeRow.page, row: removeRow.row }); setRemoveRow(null); }}>The row and its answer are removed from your draft. Nothing changes on the site until you save.</AdminConfirmDialog>
  </AdminPage>;
}
