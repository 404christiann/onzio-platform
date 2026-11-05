"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import CinematicPolicyPage from "@/components/cinematic/CinematicPolicyPage";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { POLICY_LIMITS, POLICY_PAGES, POLICY_PAGE_PATHS, cinematicPolicyDraftSchema, cinematicPolicySaveSchema, starterCinematicPolicyContent, type CinematicPolicyDraft, type CinematicPolicySave, type CinematicPolicySnapshot, type PolicyPageKey } from "@/lib/cinematic-policies-content";
import { POLICY_PAGE_NAMES, policyDraftReducer, preparePolicySave, type PolicyDraftAction } from "@/lib/cinematic-policies-draft";
import { loadCinematicPolicyEditor, saveCinematicPolicyEditor } from "@/lib/cinematic-policies-editor";
import "@/components/admin/homepage/homepage-editor.css";

const recoverySchema = z.object({ content: cinematicPolicyDraftSchema, pending: cinematicPolicySaveSchema.nullable() });
const TEXTAREA_CLASS = `${ADMIN_INPUT_CLASS} min-h-24 resize-y`;
const SMALL = "min-h-11";

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
  const edit = (action: PolicyDraftAction) => { setDraft(current => current ? policyDraftReducer(current, action) : current); setMessage(""); setFailed(false); };
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
      setMessage("Stadium Guidelines and Fan Code of Conduct saved."); clearRecovery();
    } else if (result.status === "uncertain") {
      setPending(result.request); setMessage(result.message); setFailed(true);
    } else {
      setPending(null); setMessage(result.message); setFailed(true);
    }
  }

  async function reload() {
    if (locked) return;
    if (dirty && !window.confirm("Discard unsaved edits and load the saved pages?")) return;
    try {
      const loaded = await loadCinematicPolicyEditor();
      setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicPolicyContent());
      setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload the policy pages."); setFailed(true); }
  }

  const current = draft?.[page];
  const textField = (label: string, value: string, maximum: number, onChange: (value: string) => void, hint?: string) =>
    <label className="block space-y-2"><span className="text-sm font-medium">{label}</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={value} maxLength={maximum} onChange={event => onChange(event.target.value)} />{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>;

  return <AdminPage className="pb-24">
    <AdminPageHeader title="Stadium Guidelines & Fan Code" description="Edit both accordion pages. Save applies all changes to both pages together."
      actions={<Link className="text-primary underline" href={POLICY_PAGE_PATHS[page]} target="_blank">Open {POLICY_PAGE_NAMES[page]}</Link>} />
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || !snapshot || !current ? <AdminPanel><p role="status">Loading…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Page to edit">
        {POLICY_PAGES.map(key => <Button key={key} className={SMALL} variant={page === key ? "default" : "outline"} aria-pressed={page === key} onClick={() => setPage(key)}>{POLICY_PAGE_NAMES[key]}</Button>)}
      </div>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">{POLICY_PAGE_NAMES[page]}: page heading</h2><div className="grid gap-5 md:grid-cols-3">
        {textField("Title", current.title, POLICY_LIMITS.title, value => edit({ type: "set-page", page, field: "title", value }))}
        {textField("Red line under the title", current.subtitle, POLICY_LIMITS.title, value => edit({ type: "set-page", page, field: "subtitle", value }), "Leave blank to hide it.")}
        {textField("Section heading", current.heading, POLICY_LIMITS.title, value => edit({ type: "set-page", page, field: "heading", value }), "Shown above the rows. Leave blank to hide it.")}
      </div></AdminPanel>
      <AdminPanel>
        <h2 className="mb-2 text-lg font-semibold">Rows</h2>
        <p className="mb-5 text-sm text-muted-foreground">Each row opens to show its answer. An answer is a list of subheadings and paragraphs. A row without an answer shows “Details coming soon.” The first row with an answer starts open. Up to {POLICY_LIMITS.rows} rows, {POLICY_LIMITS.blocks} lines per answer.</p>
        <div className="space-y-5">{current.rows.map((row, index) => <fieldset key={row.id} className="space-y-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">Row {index + 1}</legend>
          {textField("Row heading", row.heading, POLICY_LIMITS.heading, value => edit({ type: "set-heading", page, row: index, value }))}
          <div className="space-y-3">
            {row.blocks.map((line, lineIndex) => <div key={lineIndex} className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm"><span className="font-medium">Line {lineIndex + 1}</span>
                  <select className="min-h-11 rounded-lg border border-input bg-card px-2 text-sm" disabled={locked} value={line.kind} onChange={event => edit({ type: "set-line-kind", page, row: index, line: lineIndex, kind: event.target.value as typeof line.kind })}>
                    <option value="subheading">Subheading</option><option value="paragraph">Paragraph</option>
                  </select></label>
                <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked || lineIndex === 0} aria-label={`Row ${index + 1}: move line ${lineIndex + 1} up`} onClick={() => edit({ type: "move-line", page, row: index, line: lineIndex, by: -1 })}>Up</Button>
                <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked || lineIndex === row.blocks.length - 1} aria-label={`Row ${index + 1}: move line ${lineIndex + 1} down`} onClick={() => edit({ type: "move-line", page, row: index, line: lineIndex, by: 1 })}>Down</Button>
                <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked} aria-label={`Row ${index + 1}: remove line ${lineIndex + 1}`} onClick={() => edit({ type: "remove-line", page, row: index, line: lineIndex })}>Remove</Button>
              </div>
              {line.kind === "subheading"
                ? <input className={ADMIN_INPUT_CLASS} aria-label={`Row ${index + 1}, line ${lineIndex + 1} subheading`} disabled={locked} value={line.text} maxLength={POLICY_LIMITS.subheading} onChange={event => edit({ type: "set-line", page, row: index, line: lineIndex, text: event.target.value })} />
                : <textarea className={TEXTAREA_CLASS} aria-label={`Row ${index + 1}, line ${lineIndex + 1} paragraph`} disabled={locked} value={line.text} maxLength={POLICY_LIMITS.paragraph} onChange={event => edit({ type: "set-line", page, row: index, line: lineIndex, text: event.target.value })} />}
            </div>)}
            {row.blocks.length === 0 && <p className="text-sm text-muted-foreground">No answer yet. The site shows “Details coming soon.”</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked || row.blocks.length >= POLICY_LIMITS.blocks} onClick={() => edit({ type: "add-line", page, row: index, kind: "subheading" })}>Add subheading</Button>
            <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked || row.blocks.length >= POLICY_LIMITS.blocks} onClick={() => edit({ type: "add-line", page, row: index, kind: "paragraph" })}>Add paragraph</Button>
            <span className="grow" />
            <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked || index === 0} aria-label={`Move row ${index + 1} up`} onClick={() => edit({ type: "move-row", page, row: index, by: -1 })}>Move up</Button>
            <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked || index === current.rows.length - 1} aria-label={`Move row ${index + 1} down`} onClick={() => edit({ type: "move-row", page, row: index, by: 1 })}>Move down</Button>
            <Button type="button" size="sm" variant="outline" className={SMALL} disabled={locked} aria-label={`Remove row ${index + 1}`} onClick={() => { if (window.confirm(`Remove “${row.heading || `Row ${index + 1}`}”?`)) edit({ type: "remove-row", page, row: index }); }}>Remove row</Button>
          </div>
        </fieldset>)}</div>
        <Button type="button" className={`${SMALL} mt-5`} variant="outline" disabled={locked || current.rows.length >= POLICY_LIMITS.rows} onClick={() => edit({ type: "add-row", page, id: crypto.randomUUID() })}>Add row</Button>
      </AdminPanel>
      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview {POLICY_PAGE_NAMES[page]}</summary>
        <div className="my-4 flex gap-3"><Button variant={phone ? "default" : "outline"} onClick={() => setPhone(true)}>Phone</Button><Button variant={!phone ? "default" : "outline"} onClick={() => setPhone(false)}>Desktop</Button></div>
        <div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: phone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={POLICY_PAGE_NAMES[page]}><CinematicShell contentOnly initialContent={shared}><CinematicPolicyPage page={current} /></CinematicShell></HomepagePreviewFrame></div></div>
      </details></AdminPanel>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg">
        <Button disabled={busy || (!dirty && !pending)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : "Save both pages"}</Button>
        <Button variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved pages</Button>
        <span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>
    </>}
  </AdminPage>;
}
