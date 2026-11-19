"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import CinematicShell from "@/components/cinematic/CinematicShell";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, PreviewCards, PreviewCardsSkeleton, ValidationMessage, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { loadVisitorPageEditor, saveVisitorPageEditor } from "@/lib/visitor-page-editor";
import {
  emptyTicketPageContent, ticketPageView, ticketPageDraftFingerprint, ticketPageSaveSchema, ticketPageSchemas,
  type TicketPageContent, type TicketPageKey, type TicketPageSaveRequest, type TicketPageSnapshot, type TicketPageView,
} from "@/lib/cinematic-ticket-pages-content";
import { setTicketPageImage, unusedTicketPageUploads } from "@/lib/cinematic-ticket-pages-editor";
import { editorPageState } from "@/components/admin/tickets/tickets-sections";
import {
  buildTicketPageSaveInput, changedTicketPageSections, setTicketPageShown, ticketPageSectionShown, ticketPageSectionSlice, type TicketPageSpec,
} from "./ticket-page-sections";
import styles from "./ticket-editors.module.css";
import "@/components/admin/homepage/homepage-editor.css";

export type TicketPageFieldsApi<K extends TicketPageKey> = {
  draft: TicketPageContent<K>;
  view: TicketPageView<K>;
  locked: boolean;
  uploading: string | null;
  change: (edit: (content: TicketPageContent<K>) => TicketPageContent<K>) => void;
  /** Switch a card's part on or off. Writes the flag only because the person toggled it. */
  setShown: (id: string, shown: boolean) => void;
  upload: (slot: string, file: File) => Promise<boolean>;
  removeImage: (slot: string) => void;
};

const mediaSchema = z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() }).strict());

type LiveProps<K extends TicketPageKey> = {
  spec: TicketPageSpec<K>; id: string; content: TicketPageContent<K>; media: TicketPageSnapshot<K>["media"]; shared: CinematicHomepageContent | null; slice: string;
  renderLive: (view: TicketPageView<K>) => ReactNode;
};
/** The real public page component, fed the draft with every other card switched off. Re-renders only when its own slice changes. */
function SectionLiveInner<K extends TicketPageKey>({ spec, id, content, media, shared, renderLive }: LiveProps<K>) {
  const view = useMemo(() => ticketPageView(spec.sectionOnly(content, id), media), [spec, content, id, media]);
  const urls = useMemo(() => spec.imagesOf(content, id).flatMap(slot => view.images[slot]?.url ? [view.images[slot].url as string] : []), [spec, content, id, view]);
  return <SettledPreview urls={urls}><div className={styles.only} data-only={id}><CinematicShell contentOnly initialContent={shared}>{renderLive(view)}</CinematicShell></div></SettledPreview>;
}
const SectionLive = memo(SectionLiveInner, (a, b) => a.id === b.id && a.slice === b.slice && a.media === b.media && a.shared === b.shared) as typeof SectionLiveInner;

/** Load, draft recovery, upload, atomic save and conflict handling for the two Tickets-menu pages (RC2027-TICKET-PAGES), on the editor kit. */
export default function TicketPageEditor<K extends TicketPageKey>({ spec, title, description, openPageHref, renderFields, renderLive }: {
  spec: TicketPageSpec<K>; title: string; description: string; openPageHref: string;
  renderFields: (api: TicketPageFieldsApi<K>, id: string) => ReactNode;
  renderLive: (view: TicketPageView<K>) => ReactNode;
}) {
  const pageKey = spec.key;
  const club = useClubContext();
  const crumbs = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Tickets and stadium" }];
  const saveSchema = ticketPageSaveSchema(pageKey);
  const recoverySchema = z.object({
    content: ticketPageSchemas[pageKey], revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(),
    pending: saveSchema.nullable(), uploads: z.array(z.uuid()), media: mediaSchema,
  }).strict();
  const [snapshot, setSnapshot] = useState<TicketPageSnapshot<K> | null>(null), [draft, setDraft] = useState<TicketPageContent<K> | null>(null);
  const [media, setMedia] = useState<TicketPageSnapshot<K>["media"]>([]), [uploads, setUploads] = useState<string[]>([]), [pending, setPending] = useState<TicketPageSaveRequest<K> | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<string>();
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const fingerprint = (content: TicketPageContent<K>) => { try { return ticketPageDraftFingerprint(pageKey, content); } catch { return JSON.stringify(content); } };
  const dirty = !!draft && !!snapshot && fingerprint(draft) !== fingerprint(snapshot.content ?? emptyTicketPageContent(pageKey));
  const locked = busy || !!pending || !!uploading;
  const unsaved = dirty || !!pending || uploads.length > 0;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setUploads([]);
    setMessage(""); setFailed(false); setStatus(""); setConflict(false); setSaveFailed(false); setValidation("");
    setBusy(false); setUploading(null); setShared(null);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<TicketPageContent<K>>(pageKey), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)])
      .then(([loaded, user, homepage]) => {
        if (!active) return;
        if (!user.data.user) throw new Error(`Sign in again to edit ${title}.`);
        const key = `onzio:${pageKey}:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        setShared(homepage); setLoadedClubId(club.id);
        type Stored = { content: TicketPageContent<K>; revision: string; designRevision: string; pending: TicketPageSaveRequest<K> | null; uploads: string[]; media: TicketPageSnapshot<K>["media"] };
        let stored = null as Stored | null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = recoverySchema.safeParse(JSON.parse(raw));
            if (parsed.success) stored = parsed.data as unknown as Stored;
            else localStorage.removeItem(key);
          }
        } catch {}
        setSnapshot(stored ? { ...loaded, revision: stored.revision, designRevision: stored.designRevision } : loaded);
        setDraft(stored?.content ?? loaded.content ?? emptyTicketPageContent(pageKey)); setMedia(stored?.media ?? loaded.media);
        setUploads(stored?.uploads ?? []); setPending(stored?.pending ?? null);
        if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : `Your unsaved ${title} draft has been restored.`);
      }).catch(error => { if (active) { setMessage(error.message); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
    // recoverySchema is rebuilt every render from pageKey, which never changes for one editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club.id, club.presentationTemplateKey, pageKey, title]);
  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || uploads.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, uploads }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* The in-memory draft remains usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, media, uploads]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const change = (edit: (value: TicketPageContent<K>) => TicketPageContent<K>) => {
    if (locked) return;
    setDraft(current => current && edit(current));
    setMessage(""); setFailed(false); setValidation(""); setSaveFailed(false);
  };
  const setShown = (id: string, shown: boolean) => change(content => setTicketPageShown(spec, content, id, shown, snapshot?.content ?? null));
  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy || uploading) return false;
    const parsed = saveSchema.safeParse(buildTicketPageSaveInput({ pending, operationId: crypto.randomUUID(), snapshot, draft, retiredMediaAssetIds: unusedTicketPageUploads(uploads, draft) }));
    if (!parsed.success) { setSaveFailed(true); setValidation("Review the fields before saving. Links must start with https://, mailto: or / (a page on this site)."); return false; }
    const request = parsed.data as TicketPageSaveRequest<K>, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setMessage(""); setStatus(`Saving ${title}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, uploads })); } catch {}
    const result = await saveVisitorPageEditor<TicketPageContent<K>>(pageKey, request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyTicketPageContent(pageKey)); setMedia(result.snapshot.media);
      setUploads([]); setPending(null); setConflict(false); clearRecovery();
      setMessage(result.snapshot.cleanupPending ? `${title} saved. Image cleanup will retry automatically.` : ""); setStatus(`${title} saved.`);
      return true;
    } else if (result.status === "uncertain") { setPending(result.request as TicketPageSaveRequest<K>); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }
  /** Discard asks first when there are unsaved edits (the same decision the native confirm made). */
  function requestDiscard() {
    if (busy || uploading) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty || uploads.length) setConfirmReload(true);
    else void reload();
  }
  async function reload(keepDraft = false) {
    if (locked) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<TicketPageContent<K>>(pageKey);
      ticketPageSchemas[pageKey].parse(loaded.content ?? emptyTicketPageContent(pageKey));
      if (generation !== epoch.current) return;
      if (keepDraft) {
        // Latest revision becomes the base, the edits stay, and images added in this session stay available.
        const previous = new Set(snapshot?.media.map(image => image.id));
        setMedia([...loaded.media, ...media.filter(image => !previous.has(image.id) && !loaded.media.some(saved => saved.id === image.id))]);
        setMessage("Latest saved version loaded. Your edits were kept. Replace any images removed in the newer version before saving.");
        setSnapshot(loaded);
      } else {
        setSnapshot(loaded); setDraft(loaded.content ?? emptyTicketPageContent(pageKey)); setMedia(loaded.media); setUploads([]); setMessage(""); clearRecovery();
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation("");
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to reload ${title}.`); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function upload(slot: string, file: File): Promise<boolean> {
    if (!draft || locked) return false;
    const generation = epoch.current;
    setUploading(slot); setFailed(false); setStatus("Adding your image…");
    try {
      const result = await createClient().storage.from("homepage-artwork").upload(`${pageKey}/` + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return false;
      const id = result.data.assetId;
      setMedia(current => [...current, { id, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      setUploads(current => [...current, id]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => current && setTicketPageImage(current, slot, id));
      setStatus(`Image ready. Save ${title} to use it.`);
      return true;
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } return false; }
    finally { if (generation === epoch.current) setUploading(null); }
  }
  const removeImage = (slot: string) => change(content => setTicketPageImage(content, slot, null));
  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await save())) throw new Error(`${title} was not saved.`); },
  });
  const latestSave = useRef(save);
  latestSave.current = save;
  useUnsavedGuard(draft ? {
    dirty: unsaved, edited: title, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || uploading || pending) throw new Error("A save is still being confirmed.");
      if (!snapshot) return;
      setDraft(snapshot.content ?? emptyTicketPageContent(pageKey)); setUploads([]); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); clearRecovery();
    },
  } : undefined);

  const deferred = useDeferredValue(draft);
  const pageState = editorPageState({ base: saveAction.state, busy, uploading: !!uploading, pending: !!pending, conflict, saveFailed });
  const changed = useMemo(() => new Set(draft && snapshot ? changedTicketPageSections(spec, draft, snapshot.content) : []), [spec, draft, snapshot]);
  const view = draft ? ticketPageView(draft, media) : null;
  const loading = !draft || !view || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={title} breadcrumb={crumbs} description="This page is unavailable for the current website design.">{null}</PageFrame>;

  const sectionItems = draft ? spec.sections.map(section => {
    const shown = ticketPageSectionShown(spec, draft, section.id);
    return {
      id: section.id, title: section.title, changed: changed.has(section.id), summary: spec.summary(draft, section.id), disabled: locked, switchLabel: section.switchLabel,
      ...(shown !== null ? { visible: shown, onVisibleChange: (next: boolean) => setShown(section.id, next) } : {}),
    };
  }) : [];
  const api: TicketPageFieldsApi<K> | null = draft && view ? { draft, view, locked, uploading, change, setShown, upload, removeImage } : null;
  const previewOf = (id: string) => deferred && <SectionLive spec={spec} id={id} content={deferred} media={media} shared={shared} slice={ticketPageSectionSlice(spec, deferred, id)} renderLive={renderLive} />;

  const notice = (message || validation || conflict) ? <div className={styles.notice} data-ticket-page-notice="">
    {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || conflict}>{message}
      {conflict && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className="admin-press" disabled={locked} onClick={() => void reload(true)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
  </div> : null;

  if (!draft && failed) return <PageFrame title={title} breadcrumb={crumbs} description={description}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel={`Loading ${title}…`} minHeight={480}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={spec.sections.length} /></div>}>
      <PageFrame title={title} breadcrumb={crumbs} openPageHref={openPageHref} description={description} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <PreviewCards sections={sectionItems} label={`${title} sections`} renderPreview={previewOf} previewScale={0.46}
          onEdit={(id, event) => dialog.openSection(id, event)} />
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-ticket-page-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${title}`} mode="split" returnFocusRef={dialog.returnFocusRef}
      sections={spec.sections.map(section => ({ id: section.id, title: section.title, summary: draft && (ticketPageSectionShown(spec, draft, section.id) === false ? "Hidden on the page" : spec.summary(draft, section.id)) }))}
      activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id)}
      renderSection={id => dialog.open ? renderFields(api, id) : null}
      renderPreview={id => dialog.open ? <div className={styles.livePreview}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={`${title} section`}>
          <div className={styles.only} data-only={id}><CinematicShell contentOnly initialContent={shared}>{renderLive(ticketPageView(spec.sectionOnly(api.draft, id), media))}</CinematicShell></div>
        </HomepagePreviewFrame></div> : null} />}
    <AdminConfirmDialog open={confirmReload} title="Discard your edits?" confirmLabel="Discard and reload" destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {title} edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
