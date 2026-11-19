"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, SectionCards, SectionCardsSkeleton, ValidationMessage, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { createClient } from "@/lib/admin-client";
import {
  cinematicContactDraftSchema, cinematicContactSaveSchema, starterCinematicContactContent,
  type CinematicContactContent, type CinematicContactSave, type CinematicContactSnapshot,
} from "@/lib/cinematic-contact-content";
import { loadCinematicContactEditor, saveCinematicContactEditor } from "@/lib/cinematic-contact-editor";
import { DISCARD_CONFIRM } from "../editor-copy";
import styles from "./ContactEditor.module.css";
import { ContactSectionFields, type ContactFieldsApi } from "./ContactSectionFields";
import {
  CONTACT_SECTIONS, buildContactSaveInput, changedContactSections, contactFieldErrors, contactPageState, contactSectionOfPath, contactSectionSummary,
  firstContactErrorSection, type ContactSectionId,
} from "./contact-sections";

const recoverySchema = z.object({
  content: cinematicContactDraftSchema,
  pending: cinematicContactSaveSchema.nullable(),
});
const PAGE = "Contact";
const CRUMBS = [{ label: "Website" }, { label: "Pages", href: "/admin/website-pages" as const }];
const DESCRIPTION = "The heading and five contact rows on your Contact page. Save applies all changes together.";

export default function CinematicContactEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicContactSnapshot | null>(null);
  const [draft, setDraft] = useState<CinematicContactContent | null>(null);
  const [pending, setPending] = useState<CinematicContactSave | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [validation, setValidation] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<ContactSectionId>();
  const dirty = !!snapshot && !!draft && JSON.stringify(snapshot.content ?? starterCinematicContactContent()) !== JSON.stringify(draft);
  const locked = busy || !!pending;
  const unsaved = dirty || !!pending;
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setPending(null); setLoadedClubId(null); setMessage(""); setFailed(false); setStatus("");
    setConflict(false); setSaveFailed(false); setValidation(""); setShowErrors(false); setBusy(false);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicContactEditor(), createClient().auth.getUser()]).then(([loaded, user]) => {
      if (!active) return;
      if (!user.data.user) throw new Error("Sign in again to edit Contact.");
      const key = `onzio:cinematic-contact:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      let stored: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) stored = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(loaded);
      setDraft(stored?.content ?? loaded.content ?? starterCinematicContactContent());
      setPending(stored?.pending ?? null);
      setLoadedClubId(club.id);
      if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Contact draft has been restored.");
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load Contact."); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
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

  const clean = () => { setMessage(""); setFailed(false); setValidation(""); setSaveFailed(false); };
  /** Edits a copy of the draft, as the editor always has. */
  const update = (edit: (value: CinematicContactContent) => void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; });
    clean();
  };

  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy) return false;
    const parsed = cinematicContactSaveSchema.safeParse(buildContactSaveInput({ pending, operationId: crypto.randomUUID(), snapshot, draft }));
    if (!parsed.success) {
      // The page has always refused here. It now says which field, using the schema's own words.
      const first = firstContactErrorSection(contactFieldErrors(draft));
      setShowErrors(true); setSaveFailed(true); setValidation("Review the highlighted fields before saving.");
      if (first) dialog.openSection(first);
      return false;
    }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setMessage(""); setStatus("Saving Contact…");
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request })); } catch {}
    const result = await saveCinematicContactEditor(request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? starterCinematicContactContent()); setPending(null); setConflict(false);
      setShowErrors(false); setMessage(""); setStatus("Contact saved."); clearRecovery();
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }

  /** Discard asks first when there are unsaved edits. */
  function requestDiscard() {
    if (busy) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty) setConfirmReload(true);
    else void reload();
  }
  async function reload(keepDraft = false) {
    if (locked) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadCinematicContactEditor();
      if (generation !== epoch.current) return;
      if (keepDraft) {
        // The latest revision becomes the base and the edits stay.
        setSnapshot(loaded);
        setMessage("Latest saved version loaded. Your edits were kept.");
      } else {
        setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicContactContent()); setMessage(""); clearRecovery();
        setShowErrors(false);
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation("");
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload Contact."); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }

  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await save())) throw new Error("Contact was not saved."); },
  });
  const latestSave = useRef(save);
  latestSave.current = save;
  useUnsavedGuard(draft ? {
    dirty: unsaved, edited: PAGE, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || pending) throw new Error("A save is still being confirmed.");
      if (!snapshot) return;
      setDraft(snapshot.content ?? starterCinematicContactContent()); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); setShowErrors(false); clearRecovery();
    },
  } : undefined);

  const pageState = contactPageState({ base: saveAction.state, busy, pending: !!pending, conflict, saveFailed });
  const changed = useMemo(() => new Set(draft && snapshot ? changedContactSections(draft, snapshot.content) : []), [draft, snapshot]);
  const errors = useMemo(() => showErrors && draft ? contactFieldErrors(draft) : {}, [showErrors, draft]);
  const loading = !draft || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="This Contact editor is unavailable for this website design.">{null}</PageFrame>;

  const errorSections = new Set(Object.keys(errors).map(contactSectionOfPath));
  const sectionItems = draft ? CONTACT_SECTIONS.map(section => ({
    id: section.id, title: section.title, disabled: locked,
    summary: <>
      {contactSectionSummary(draft, section.id)}
      {changed.has(section.id) && <span className={styles.srOnly}> (unsaved changes)</span>}
      {errorSections.has(section.id) && <span className={styles.srOnly}> (needs attention)</span>}
    </>,
  })) : [];
  const api: ContactFieldsApi | null = draft ? { draft, locked, errors, update } : null;
  const starter = !!snapshot && snapshot.content === null;

  const notice = (message || validation || conflict || starter) ? <div className={styles.notice} data-contact-notice="">
    {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || conflict}>{message}
      {conflict && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className={`admin-press ${styles.keep}`} disabled={locked} onClick={() => void reload(true)}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
    {starter && !message && !conflict && <EditorNotice failed={false}>Nothing has been saved for Contact yet. These are the starter texts. Change any text, then Save to publish.</EditorNotice>}
  </div> : null;

  if (!draft && failed) return <PageFrame title={PAGE} breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel="Loading Contact…" minHeight={480}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><SectionCardsSkeleton count={CONTACT_SECTIONS.length} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref="/contact" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <SectionCards sections={sectionItems} label="Contact sections" onEdit={(id, event) => dialog.openSection(id as ContactSectionId, event)} />
        <p className={styles.fixed}>The five rows and their order are fixed by the Contact page design.</p>
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-contact-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${PAGE}`} returnFocusRef={dialog.returnFocusRef}
      sections={CONTACT_SECTIONS.map(section => ({ id: section.id, title: section.title, summary: draft && contactSectionSummary(draft, section.id) }))}
      activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as ContactSectionId)}
      renderSection={id => dialog.open ? <ContactSectionFields api={api} id={id as ContactSectionId} /> : null} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {PAGE} edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
