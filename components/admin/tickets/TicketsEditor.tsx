"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, PreviewCards, PreviewCardsSkeleton, ValidationMessage, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { createClient } from "@/lib/admin-client";
import { loadTicketsEditor, saveTicketsEditor } from "@/lib/tickets-editor";
import {
  emptyTicketsContent, hydrateTicketsContent, ticketsContentSchema, ticketsDraftFingerprint, ticketsDraftSchema, ticketsSaveSchema,
  type TicketArtworkSlot, type TicketVisibilityKey, type TicketsContent, type TicketsSaveRequest, type TicketsSnapshot,
} from "@/lib/tickets-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicTickets from "@/components/cinematic/CinematicTickets";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { PageVisibilityControl } from "@/components/admin/stadium/PageVisibilityControl";
import styles from "@/components/admin/ticket-pages/ticket-editors.module.css";
import "@/components/admin/homepage/homepage-editor.css";
import { TicketsSectionFields, type TicketsFieldsApi } from "./TicketsSectionFields";
import { ticketsPreviewStamps } from "./tickets-edit-targets";
import { DISCARD_CONFIRM } from "../editor-copy";
import {
  TICKETS_SECTIONS, TICKETS_SECTION_IMAGES, buildTicketsSaveInput, changedTicketsSections, editorPageState, setTicketsFlag,
  ticketsSectionOnly, ticketsSectionShown, ticketsSectionSlice, ticketsSectionSummary, type TicketsSectionId,
} from "./tickets-sections";

const recoverySchema = z.object({ content: ticketsDraftSchema, revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(), pending: ticketsSaveSchema.nullable(), retired: z.array(z.uuid()), media: z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() })) });
const PAGE = "Tickets";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Tickets and stadium" }];
const DESCRIPTION = "Edit ticket benefits, travel information and the purchase link. Save applies all changes together.";

type PreviewProps = { id: TicketsSectionId; content: TicketsContent; media: TicketsSnapshot["media"]; shared: CinematicHomepageContent | null; slice: string };
/** The real public Tickets page, fed the draft with every other card switched off. Re-renders only when its own slice changes. */
const SectionLive = memo(function SectionLive({ id, content, media, shared }: PreviewProps) {
  const page = useMemo(() => hydrateTicketsContent(ticketsSectionOnly(content, id), media, false), [content, id, media]);
  const urls = useMemo(() => TICKETS_SECTION_IMAGES[id].flatMap(slot => page.artwork[slot].url ? [page.artwork[slot].url as string] : []), [page, id]);
  return <SettledPreview urls={urls}><div className={styles.only} data-only={id}><CinematicShell contentOnly initialContent={shared}><CinematicTickets content={page} /></CinematicShell></div></SettledPreview>;
}, (a, b) => a.id === b.id && a.slice === b.slice && a.media === b.media && a.shared === b.shared);

export default function TicketsEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<TicketsSnapshot | null>(null), [draft, setDraft] = useState<TicketsContent | null>(null);
  const [media, setMedia] = useState<TicketsSnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]), [pending, setPending] = useState<TicketsSaveRequest | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<TicketArtworkSlot | null>(null);
  const [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<TicketsSectionId>();
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const dirty = !!draft && !!snapshot && ticketsDraftFingerprint(draft) !== ticketsDraftFingerprint(snapshot.content ?? emptyTicketsContent());
  const locked = busy || !!pending || !!uploading;
  const unsaved = dirty || !!pending || retired.length > 0;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setRetired([]);
    setMessage(""); setFailed(false); setStatus(""); setConflict(false); setSaveFailed(false); setValidation("");
    setBusy(false); setUploading(null); setShared(null);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadTicketsEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)]).then(([loaded, user, homepage]) => {
      if (!active) return;
      if (!user.data.user) throw new Error(`Sign in again to edit ${PAGE}.`);
      const key = `onzio:tickets:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      setShared(homepage); setLoadedClubId(club.id);
      let stored: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) stored = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(stored ? { ...loaded, revision: stored.revision, designRevision: stored.designRevision } : loaded);
      setDraft(stored?.content ?? loaded.content ?? emptyTicketsContent()); setMedia(stored?.media ?? loaded.media);
      setRetired(stored?.retired ?? []); setPending(stored?.pending ?? null);
      if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : `Your unsaved ${PAGE} draft has been restored.`);
    }).catch(error => { if (active) { setMessage(error.message); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);
  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || retired.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, retired }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* Keep the current draft even if browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, media, retired]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const clean = () => { setMessage(""); setFailed(false); setValidation(""); setSaveFailed(false); };
  /** Edits a copy of the draft, as the editor always has. */
  const update = (edit: (value: TicketsContent) => void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; });
    clean();
  };
  const setFlag = (key: TicketVisibilityKey, shown: boolean) => {
    if (locked) return;
    setDraft(current => current && setTicketsFlag(current, key, shown, snapshot?.content ?? null));
    clean();
  };
  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy || uploading) return false;
    const parsed = ticketsSaveSchema.safeParse(buildTicketsSaveInput({ pending, operationId: crypto.randomUUID(), snapshot, draft, retired }));
    if (!parsed.success) { setSaveFailed(true); setValidation("Review the fields before saving. The purchase link must be a full HTTPS URL."); return false; }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setMessage(""); setStatus(`Saving ${PAGE}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired })); } catch {}
    const result = await saveTicketsEditor(request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyTicketsContent()); setMedia(result.snapshot.media);
      setRetired([]); setPending(null); setConflict(false); clearRecovery();
      setMessage(result.snapshot.cleanupPending ? `${PAGE} saved. Image cleanup will retry automatically.` : ""); setStatus(`${PAGE} saved.`);
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }
  /** Discard asks first when there are unsaved edits (the same decision the native confirm made). */
  function requestDiscard() {
    if (busy || uploading) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty || retired.length) setConfirmReload(true);
    else void reload();
  }
  async function reload(keepDraft = false) {
    if (locked) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadTicketsEditor();
      ticketsContentSchema.parse(loaded.content ?? emptyTicketsContent());
      if (generation !== epoch.current) return;
      if (keepDraft) {
        // Latest revision becomes the base, the edits stay, and images added in this session stay available.
        const previous = new Set(snapshot?.media.map(image => image.id));
        setMedia([...loaded.media, ...media.filter(image => !previous.has(image.id) && !loaded.media.some(saved => saved.id === image.id))]);
        setMessage("Latest saved version loaded. Your edits were kept. Replace any images removed in the newer version before saving.");
        setSnapshot(loaded);
      } else {
        setSnapshot(loaded); setDraft(loaded.content ?? emptyTicketsContent()); setMedia(loaded.media); setRetired([]); setMessage(""); clearRecovery();
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation("");
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to reload ${PAGE}.`); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function upload(slot: TicketArtworkSlot, file: File): Promise<boolean> {
    if (!draft || locked) return false;
    const generation = epoch.current;
    setUploading(slot); setFailed(false); setStatus("Adding your image…");
    try {
      const result = await createClient().storage.from("homepage-artwork").upload("tickets/" + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return false;
      const oldId = draft.artwork[slot].assetId, id = result.data.assetId;
      if (oldId && media.some(item => item.id === oldId) && !snapshot?.media.some(item => item.id === oldId)) setRetired(current => [...current, oldId]);
      setMedia(current => [...current, { id, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => { if (!current) return current; const copy = structuredClone(current); copy.artwork[slot].assetId = id; if (slot === "banner") copy.bannerHeightFraction = 1; return copy; });
      setStatus(`Image ready. Save ${PAGE} to use it.`);
      return true;
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } return false; }
    finally { if (generation === epoch.current) setUploading(null); }
  }
  function removeImage(slot: TicketArtworkSlot) {
    if (!draft) return;
    const id = draft.artwork[slot].assetId;
    if (id) setRetired(current => [...current, id]);
    update(value => { value.artwork[slot].assetId = null; });
  }
  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await save())) throw new Error(`${PAGE} was not saved.`); },
  });
  const latestSave = useRef(save);
  latestSave.current = save;
  useUnsavedGuard(draft ? {
    dirty: unsaved, edited: PAGE, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || uploading || pending) throw new Error("A save is still being confirmed.");
      if (!snapshot) return;
      setDraft(snapshot.content ?? emptyTicketsContent()); setRetired([]); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); clearRecovery();
    },
  } : undefined);

  const deferred = useDeferredValue(draft);
  const pageState = editorPageState({ base: saveAction.state, busy, uploading: !!uploading, pending: !!pending, conflict, saveFailed });
  const changed = useMemo(() => new Set(draft && snapshot ? changedTicketsSections(draft, snapshot.content) : []), [draft, snapshot]);
  // Click-to-field stamps per section, rebuilt only when the (deferred) draft changes, so each card's stamp watcher restarts
  // on a draft change and not on every render of the page.
  const stampsBySection = useMemo(() => new Map(TICKETS_SECTIONS.map(section => [section.id, deferred ? ticketsPreviewStamps(deferred, section.id) : []])), [deferred]);
  const page = draft ? hydrateTicketsContent(draft, media, false) : null;
  const loading = !draft || !page || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="This page is unavailable for the current website design.">{null}</PageFrame>;

  const sectionItems = draft ? TICKETS_SECTIONS.map(section => {
    const shown = ticketsSectionShown(draft, section.id);
    return {
      id: section.id, title: section.title, changed: changed.has(section.id), summary: ticketsSectionSummary(draft, section.id), disabled: locked,
      ...(section.flag && shown !== null ? { visible: shown, onVisibleChange: (next: boolean) => setFlag(section.flag as TicketVisibilityKey, next) } : {}),
    };
  }) : [];
  const api: TicketsFieldsApi | null = draft && page ? { draft, page, locked, uploading, update, setFlag, upload, removeImage } : null;
  const previewOf = (id: string) => deferred && <SectionLive id={id as TicketsSectionId} content={deferred} media={media} shared={shared} slice={ticketsSectionSlice(deferred, id as TicketsSectionId)} />;

  const notice = (message || validation || conflict) ? <div className={styles.notice} data-tickets-notice="">
    {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || conflict}>{message}
      {conflict && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className="admin-press" disabled={locked} onClick={() => void reload(true)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
  </div> : null;

  if (!draft && failed) return <PageFrame title={PAGE} breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel={`Loading ${PAGE}…`} minHeight={480}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={TICKETS_SECTIONS.length} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref="/tickets" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={<><PageVisibilityControl pageKey="tickets" />{notice}</>}>
        <PreviewCards sections={sectionItems} label="Tickets sections" renderPreview={previewOf} previewScale={0.46}
          stamps={id => stampsBySection.get(id as TicketsSectionId) ?? []}
          onEdit={(id, event, target) => { dialog.openSection(id as TicketsSectionId, event); dialog.focusField(target); }} />
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-tickets-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${PAGE}`} mode="split" returnFocusRef={dialog.returnFocusRef}
      sections={TICKETS_SECTIONS.map(section => ({ id: section.id, title: section.title, summary: draft && (ticketsSectionShown(draft, section.id) === false ? "Hidden on the page" : ticketsSectionSummary(draft, section.id)) }))}
      focusRequest={dialog.focusRequest} activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as TicketsSectionId)}
      renderSection={id => dialog.open ? <TicketsSectionFields api={api} id={id as TicketsSectionId} /> : null}
      renderPreview={id => dialog.open ? <div className={styles.livePreview}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={`${PAGE} section`}>
          <div className={styles.only} data-only={id}><CinematicShell contentOnly initialContent={shared}><CinematicTickets content={hydrateTicketsContent(ticketsSectionOnly(api.draft, id as TicketsSectionId), media, false)} /></CinematicShell></div>
        </HomepagePreviewFrame></div> : null} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {PAGE} edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
