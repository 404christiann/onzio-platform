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
import { loadVisitorPageEditor, saveVisitorPageEditor } from "@/lib/visitor-page-editor";
import { loadTicketsEditor } from "@/lib/tickets-editor";
import { emptyTicketsContent } from "@/lib/tickets-content";
import {
  emptyStadiumContent, hydrateStadiumContent, resetStadiumMapFraming, stadiumDraftSchema, stadiumSaveSchema,
  type StadiumArtworkSlot, type StadiumContent, type StadiumSaveRequest, type StadiumSnapshot,
} from "@/lib/stadium-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicStadium, { type StadiumTicketing } from "@/components/cinematic/CinematicStadium";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import "@/components/admin/homepage/homepage-editor.css";
import { SettledPreview } from "./SettledPreview";
import { FoothillSectionFields } from "./FoothillSectionFields";
import {
  FOOTHILL_FLAGS, FOOTHILL_PREVIEW_IMAGES, FOOTHILL_SECTIONS, buildFoothillSaveInput, changedFoothillSections, foothillDirty,
  foothillPreviewSlice, foothillSectionOnly, foothillSectionSummary, type FoothillSectionId,
} from "./foothill-sections";
import { partnerPageState } from "./partner-page-state";
import styles from "./PartnerPageParts.module.css";

const recoverySchema = z.object({
  content: stadiumDraftSchema, revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(),
  pending: stadiumSaveSchema.nullable(), retired: z.array(z.uuid()),
  media: z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() }).strict()),
}).strict();
const PAGE = "Foothill Transit";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Tickets and stadium" }];
const DESCRIPTION = "Edit the Foothill Transit bus route page, travel information and artwork. Save applies all changes together.";

type PreviewProps = {
  id: FoothillSectionId; content: StadiumContent; media: StadiumSnapshot["media"]; shared: CinematicHomepageContent | null; ticketing: StadiumTicketing; slice: string;
};
/** The real public page component, fed the draft with only this card's sections switched on. Re-renders only when its own slice changes. */
const SectionLive = memo(function SectionLive({ id, content, media, shared, ticketing }: PreviewProps) {
  const page = useMemo(() => hydrateStadiumContent(foothillSectionOnly(content, id), media), [content, id, media]);
  const urls = useMemo(() => FOOTHILL_PREVIEW_IMAGES[id].flatMap(slot => page.artwork[slot].url ? [page.artwork[slot].url as string] : []), [page, id]);
  return <SettledPreview urls={urls}><CinematicShell contentOnly initialContent={shared}><CinematicStadium content={page} ticketing={ticketing} /></CinematicShell></SettledPreview>;
}, (a, b) => a.id === b.id && a.slice === b.slice && a.media === b.media && a.shared === b.shared && a.ticketing === b.ticketing);

export default function StadiumEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<StadiumSnapshot | null>(null), [draft, setDraft] = useState<StadiumContent | null>(null);
  const [media, setMedia] = useState<StadiumSnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]), [pending, setPending] = useState<StadiumSaveRequest | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<StadiumArtworkSlot | null>(null);
  const [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [ticketing, setTicketing] = useState<StadiumTicketing>(emptyTicketsContent());
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<FoothillSectionId>();
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const dirty = !!draft && !!snapshot && foothillDirty(draft, snapshot.content);
  const locked = busy || !!pending || !!uploading;
  const unsaved = dirty || !!pending || retired.length > 0;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setRetired([]);
    setMessage(""); setFailed(false); setStatus(""); setConflict(false); setSaveFailed(false); setValidation("");
    setBusy(false); setUploading(null); setShared(null); setTicketing(emptyTicketsContent());
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<StadiumContent>("stadium"), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), loadTicketsEditor()])
      .then(([loaded, user, homepage, tickets]) => {
        if (!active) return;
        if (!user.data.user) throw new Error(`Sign in again to edit ${PAGE}.`);
        const key = `onzio:stadium:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        setShared(homepage); setTicketing(tickets.content ?? emptyTicketsContent()); setLoadedClubId(club.id);
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
        setDraft(stored?.content ?? loaded.content ?? emptyStadiumContent()); setMedia(stored?.media ?? loaded.media);
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
    } catch { /* The in-memory draft remains usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, media, retired]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const settle = () => { setMessage(""); setFailed(false); setValidation(""); setSaveFailed(false); };
  const replace = (next: StadiumContent) => { if (locked) return; setDraft(next); settle(); };
  const update = (edit: (value: StadiumContent) => void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; });
    settle();
  };
  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy || uploading) return false;
    const parsed = stadiumSaveSchema.safeParse(buildFoothillSaveInput({ pending, operationId: crypto.randomUUID(), snapshot, draft, retired }));
    if (!parsed.success) { setSaveFailed(true); setValidation("Review the fields and map crop before saving."); return false; }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setMessage(""); setStatus(`Saving ${PAGE}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired })); } catch {}
    const result = await saveVisitorPageEditor<StadiumContent>("stadium", request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyStadiumContent()); setMedia(result.snapshot.media);
      setRetired([]); setPending(null); setConflict(false); clearRecovery();
      setMessage(result.snapshot.cleanupPending ? `${PAGE} saved. Image cleanup will retry automatically.` : ""); setStatus(`${PAGE} saved.`);
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }
  /** Discard asks first when there are unsaved edits. */
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
      const loaded = await loadVisitorPageEditor<StadiumContent>("stadium");
      stadiumDraftSchema.parse(loaded.content ?? emptyStadiumContent());
      if (generation !== epoch.current) return;
      if (keepDraft) {
        // Latest revision becomes the base, the edits stay, and images added in this session stay available.
        const previous = new Set(snapshot?.media.map(image => image.id));
        setMedia([...loaded.media, ...media.filter(image => !previous.has(image.id) && !loaded.media.some(saved => saved.id === image.id))]);
        setMessage("Latest saved version loaded. Your edits were kept. Replace any images removed in the newer version before saving.");
        setSnapshot(loaded);
      } else {
        setSnapshot(loaded); setDraft(loaded.content ?? emptyStadiumContent()); setMedia(loaded.media); setRetired([]); setMessage(""); clearRecovery();
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation("");
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to reload ${PAGE}.`); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function upload(slot: StadiumArtworkSlot, file: File): Promise<boolean> {
    if (!draft || locked) return false;
    const generation = epoch.current;
    setUploading(slot); setFailed(false); setStatus("Adding your image…");
    try {
      const client = createClient(), bucket = client.storage.from("homepage-artwork");
      const result = await bucket.upload("stadium/" + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return false;
      const oldId = draft.artwork[slot].assetId;
      if (oldId && media.some(asset => asset.id === oldId) && !snapshot?.media.some(asset => asset.id === oldId)) setRetired(current => [...new Set([...current, oldId])]);
      setMedia(current => [...current, { id: result.data.assetId, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => {
        if (!current) return current;
        const copy = slot === "map" ? resetStadiumMapFraming(structuredClone(current)) : structuredClone(current);
        copy.artwork[slot].assetId = result.data.assetId;
        return copy;
      });
      setStatus(`Image ready. Save ${PAGE} to use it.`);
      return true;
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } return false; }
    finally { if (generation === epoch.current) setUploading(null); }
  }
  function removeImage(slot: StadiumArtworkSlot) {
    if (!draft || locked) return;
    const id = draft.artwork[slot].assetId;
    if (id) setRetired(current => [...new Set([...current, id])]);
    update(content => { content.artwork[slot].assetId = null; });
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
      setDraft(snapshot.content ?? emptyStadiumContent()); setRetired([]); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); clearRecovery();
    },
  } : undefined);

  const deferred = useDeferredValue(draft);
  const pageState = partnerPageState({ base: saveAction.state, busy, uploading: !!uploading, pending: !!pending, conflict, saveFailed });
  const changed = useMemo(() => new Set(draft && snapshot ? changedFoothillSections(draft, snapshot.content) : []), [draft, snapshot]);
  const page = draft ? hydrateStadiumContent(draft, media) : null;
  const loading = !draft || !page || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="This page is unavailable for the current website design.">{null}</PageFrame>;

  const sectionItems = draft ? FOOTHILL_SECTIONS.map(section => {
    const flag = FOOTHILL_FLAGS[section.id];
    return {
      id: section.id, title: section.title, changed: changed.has(section.id), summary: foothillSectionSummary(draft, section.id), disabled: locked,
      ...(flag ? { visible: draft[flag], onVisibleChange: (visible: boolean) => update(content => { content[flag] = visible; }) } : {}),
    };
  }) : [];
  const api = draft && page ? { draft, page, locked, uploading, update, replace, upload, removeImage } : null;
  const previewOf = (id: string) => deferred && <SectionLive id={id as FoothillSectionId} content={deferred} media={media} shared={shared} ticketing={ticketing} slice={foothillPreviewSlice(deferred, id as FoothillSectionId)} />;

  const notice = (message || validation || conflict) ? <div className={styles.notice} data-foothill-notice="">
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
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={FOOTHILL_SECTIONS.length} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref="/stadium/foothill-transit" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <PreviewCards sections={sectionItems} label="Foothill Transit sections" renderPreview={previewOf} previewScale={0.46}
          onEdit={(id, event) => dialog.openSection(id as FoothillSectionId, event)} />
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-foothill-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${PAGE}`} mode="split" returnFocusRef={dialog.returnFocusRef}
      sections={FOOTHILL_SECTIONS.map(section => {
        const flag = FOOTHILL_FLAGS[section.id];
        return { id: section.id, title: section.title, summary: draft && (flag && !draft[flag] ? "Hidden on the page" : foothillSectionSummary(draft, section.id)) };
      })}
      activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as FoothillSectionId)}
      renderSection={id => dialog.open ? <FoothillSectionFields api={api} id={id as FoothillSectionId} /> : null}
      renderPreview={id => dialog.open ? <div className={styles.livePreview}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={`${PAGE} section`}>
          <CinematicShell contentOnly initialContent={shared}><CinematicStadium content={hydrateStadiumContent(foothillSectionOnly(api.draft, id as FoothillSectionId), media)} ticketing={ticketing} /></CinematicShell>
        </HomepagePreviewFrame></div> : null} />}
    <AdminConfirmDialog open={confirmReload} title="Discard your edits?" confirmLabel="Discard and reload" destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {PAGE} edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
