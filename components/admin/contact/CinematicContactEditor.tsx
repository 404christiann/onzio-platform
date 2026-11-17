"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { EditorGroup, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorSaveBar, EditorSecondaryButton, EditorSection, editorSaveState, kit, useSavedFlash } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import CinematicContact from "@/components/cinematic/CinematicContact";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { createClient } from "@/lib/admin-client";
import { CONTACT_ACTIONS, CONTACT_ROUTES, cinematicContactDraftSchema, cinematicContactSaveSchema, starterCinematicContactContent, type CinematicContactContent, type CinematicContactSave, type CinematicContactSnapshot } from "@/lib/cinematic-contact-content";
import { loadCinematicContactEditor, saveCinematicContactEditor } from "@/lib/cinematic-contact-editor";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import "@/components/admin/homepage/homepage-editor.css";

const recoverySchema = z.object({
  content: cinematicContactDraftSchema,
  pending: cinematicContactSaveSchema.nullable(),
});

export default function CinematicContactEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicContactSnapshot | null>(null);
  const [draft, setDraft] = useState<CinematicContactContent | null>(null);
  const [pending, setPending] = useState<CinematicContactSave | null>(null);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState(true);
  const [confirmReload, setConfirmReload] = useState(false);
  const [saved, setSaved] = useSavedFlash();
  const recoveryKey = useRef<string | null>(null);
  const dirty = !!snapshot && !!draft && JSON.stringify(snapshot.content ?? starterCinematicContactContent()) !== JSON.stringify(draft);

  useEffect(() => {
    let active = true;
    setSnapshot(null); setDraft(null); setPending(null); setMessage(""); setFailed(false); recoveryKey.current = null;
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicContactEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)]).then(([loaded, user, homepage]) => {
      if (!active) return;
      if (!user.data.user) throw new Error("Sign in again to edit Contact.");
      const key = `onzio:cinematic-contact:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      let saved: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) saved = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(loaded);
      setDraft(saved?.content ?? loaded.content ?? starterCinematicContactContent());
      setPending(saved?.pending ?? null);
      setShared(homepage);
      if (saved) setMessage(saved.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Contact draft has been restored.");
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load Contact."); setFailed(true); } });
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

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Contact" description="This Contact editor is unavailable for this website design." /></AdminPage>;
  const locked = busy || !!pending;
  const update = (change: (value: CinematicContactContent) => void) => {
    setDraft(current => { if (!current) return current; const next = structuredClone(current); change(next); return next; });
    setMessage(""); setFailed(false); setSaved(false);
  };
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };

  async function save() {
    if (!draft || !snapshot || busy) return;
    const parsed = cinematicContactSaveSchema.safeParse(pending ?? {
      operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft,
    });
    if (!parsed.success) { setMessage("Review the Contact fields and Information destination."); setFailed(true); return; }
    const request = parsed.data;
    setPending(request); setBusy(true); setMessage("Saving Contact…"); setFailed(false);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request })); } catch {}
    const result = await saveCinematicContactEditor(request);
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? starterCinematicContactContent()); setPending(null);
      setMessage("Contact saved."); clearRecovery(); setSaved(true);
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
      const loaded = await loadCinematicContactEditor();
      setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicContactContent());
      setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload Contact."); setFailed(true); }
  }

  const textField = (label: string, value: string, maximum: number, onChange: (value: string) => void) =>
    <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>{label}</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={value} maxLength={maximum} onChange={event => onChange(event.target.value)} /></label>;

  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title="Contact" description="Edit Contact copy and the Information destination. Save applies all changes together." actions={<EditorPageLink href="/contact">Open Contact page</EditorPageLink>} />
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!draft || !snapshot ? <EditorLoading label="Loading Contact…" failed={failed} onRetry={() => location.reload()} /> : <>
      <EditorSection title="Page heading"><div className="grid gap-5 md:grid-cols-2">
        {textField("Title", draft.title, 120, value => update(content => { content.title = value; }))}
        {textField("Subtitle", draft.subtitle, 120, value => update(content => { content.subtitle = value; }))}
      </div></EditorSection>
      <EditorSection title="Contact options" description="Media, Tryouts, Tickets and Partnerships use their matching site routes. Their destinations are managed on those pages. Information stays inactive until its destination is entered.">
        <div className="grid gap-4">{CONTACT_ACTIONS.map(id => <EditorGroup legend={id[0].toUpperCase() + id.slice(1)} key={id}><div className="grid gap-4 md:grid-cols-2">
          {textField("Row text", draft.rows[id].prompt, 120, value => update(content => { content.rows[id].prompt = value; }))}
          {textField("Button text", draft.rows[id].action, 60, value => update(content => { content.rows[id].action = value; }))}
          {id !== "information" && <p className={`${kit.hint} md:col-span-2`}>Site route: {CONTACT_ROUTES[id]}</p>}
        </div></EditorGroup>)}</div>
        <div className="mt-5">{textField("Information destination", draft.informationHref, 2000, value => update(content => { content.informationHref = value; }))}
          <p className={kit.hint}>Use a full HTTPS URL, a site path beginning with /, or a mailto: email destination. Leave blank to keep the button inactive.</p></div>
      </EditorSection>
      <EditorPreview phone={phone} onPhoneChange={setPhone}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Contact"><CinematicShell contentOnly initialContent={shared}><CinematicContact content={draft} /></CinematicShell></HomepagePreviewFrame></EditorPreview>
      <EditorSaveBar state={editorSaveState({ busy, canSave: !busy && (dirty || !!pending), saved })} retry={!!pending} onSave={() => void save()} status={pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : ""}>
        <EditorSecondaryButton disabled={locked} onClick={() => void reload()}>Reload saved page</EditorSecondaryButton>
      </EditorSaveBar>
    </>}
    <AdminConfirmDialog open={confirmReload} title="Discard your Contact edits?" confirmLabel="Discard and reload" destructive onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(true); }}>Your unsaved Contact edits will be discarded and the saved page loaded.</AdminConfirmDialog>
  </AdminPage>;
}
