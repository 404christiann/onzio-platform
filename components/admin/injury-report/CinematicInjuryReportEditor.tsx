"use client";

import Link from "next/link";
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion, Shimmer } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, PreviewCards, PreviewCardsSkeleton, ValidationMessage, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { ItemPreviewCards, ItemPreviewCardsSkeleton, type ItemCardItem } from "@/components/admin/list-cards/ItemPreviewCards";
import { useMoveFocus } from "@/components/admin/list-cards/useMoveFocus";
import styles from "@/components/admin/list-cards/ListEditor.module.css";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { partnerPageState } from "@/components/admin/stadium/partner-page-state";
import CinematicInjuryReport from "@/components/cinematic/CinematicInjuryReport";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import {
  INJURY_REPORT_ROUTE, MAX_INJURY_ENTRIES, cinematicInjuryReportDraftSchema, cinematicInjuryReportSaveSchema, starterCinematicInjuryReportContent,
  type CinematicInjuryEntry, type CinematicInjuryReportContent, type CinematicInjuryReportSave,
} from "@/lib/cinematic-injury-report-content";
import {
  addInjuryEntry, availablePlayers, injuryReportSaveRequest, loadCinematicInjuryReportEditor, moveInjuryEntry, removeInjuryEntry,
  retiredFromRoster, saveCinematicInjuryReportEditor, unusedInjuryUploads, type CinematicInjuryReportSnapshot, type InjuryMedia,
} from "@/lib/cinematic-injury-report-editor";
import { fetchInjuryPreviewRoster, type InjuryAsset, type InjuryPlayerRow } from "@/lib/cinematic-injury-report-query";
import { supabase } from "@/lib/supabase";
import "@/components/admin/homepage/homepage-editor.css";
import { DISCARD_CONFIRM } from "../editor-copy";
import { InjuryDialogFields, type InjuryFieldsApi, type InjurySlot } from "./InjuryFields";
import {
  BLOCK_TITLES, changedBlocks, changedEntryIds, entryDialogId, injuryDirty, mediaUrl, mergeMedia, parseInjuryDialogId, playerLabel, reportFor, savedContent,
  type InjuryBlock, type InjuryDialogId,
} from "./injury-sections";
import preview from "./InjuryCardPreview.module.css";

const mediaSchema = z.object({ id: z.uuid(), storage_path: z.string(), width: z.number(), height: z.number(), kind: z.enum(["graphic", "photograph"]) });
const recoverySchema = z.object({
  content: cinematicInjuryReportDraftSchema,
  pending: cinematicInjuryReportSaveSchema.nullable(),
  uploads: z.array(z.uuid()),
  media: z.array(mediaSchema),
});
const PAGE = "Injury Report";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Partners" }];
const DESCRIPTION = "Edit the Injury Report page. Each injury card shows a Roster player's name, number, position and photo; edit those in Roster. Save applies all changes together.";
const BLOCKS: readonly InjuryBlock[] = ["presenter", "rehab"];
const UPLOADS: Record<InjurySlot, { bucket: string; folder: string; kind: InjuryMedia["kind"]; label: string }> = {
  logo: { bucket: "sponsors", folder: "injury-report-logo", kind: "graphic", label: "logo" },
  band: { bucket: "news", folder: "injury-report-band", kind: "photograph", label: "photo" },
};
const NO_ROSTER = { players: [] as InjuryPlayerRow[], assets: [] as InjuryAsset[] };

async function retireUploads(ids: string[]) {
  await Promise.all(ids.map(assetId => fetch("/api/admin/media/cleanup", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
  }).catch(() => undefined)));
}

type Roster = { players: InjuryPlayerRow[]; assets: InjuryAsset[] };
type BlockLiveProps = { block: InjuryBlock; content: CinematicInjuryReportContent; roster: Roster; media: InjuryMedia[]; shared: CinematicHomepageContent | null; slice: string };
/** The real public page, with only the part this card edits showing. Re-renders only when its own slice changes. */
const BlockLive = memo(function BlockLive({ block, content, roster, media, shared }: BlockLiveProps) {
  const report = useMemo(() => reportFor(content, [], roster, media), [content, roster, media]);
  const urls = [report.presenterLogo?.url, report.band?.url].filter((url): url is string => !!url);
  return <SettledPreview urls={urls}><div className={block === "presenter" ? preview.head : preview.rehab}>
    <CinematicShell contentOnly initialContent={shared}><CinematicInjuryReport report={report} /></CinematicShell></div></SettledPreview>;
}, (a, b) => a.block === b.block && a.slice === b.slice && a.shared === b.shared);

type EntryLiveProps = { content: CinematicInjuryReportContent; entry: CinematicInjuryEntry; roster: Roster; shared: CinematicHomepageContent | null; slice: string };
/** One injury drawn by the real public card. */
const EntryLive = memo(function EntryLive({ content, entry, roster, shared }: EntryLiveProps) {
  const report = useMemo(() => reportFor({ ...content, presenterLogoAssetId: null, bandAssetId: null, page: { ...content.page, quote: "" } }, [entry], roster, [], true), [content, entry, roster]);
  const photo = report.entries[0]?.player.photo?.url;
  return <SettledPreview urls={photo ? [photo] : []}><CinematicShell contentOnly initialContent={shared}><CinematicInjuryReport report={report} /></CinematicShell></SettledPreview>;
}, (a, b) => a.entry.id === b.entry.id && a.slice === b.slice && a.shared === b.shared);

const blockSlice = (block: InjuryBlock, content: CinematicInjuryReportContent, urls: { logo: string; band: string }) =>
  JSON.stringify(block === "presenter" ? [content.page.presenterName, content.presenterLogoAssetId, urls.logo] : [content.page, content.bandAssetId, urls.band]);

export default function CinematicInjuryReportEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicInjuryReportSnapshot | null>(null), [draft, setDraft] = useState<CinematicInjuryReportContent | null>(null);
  const [pending, setPending] = useState<CinematicInjuryReportSave | null>(null), [media, setMedia] = useState<InjuryMedia[]>([]), [uploads, setUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState<InjurySlot | null>(null), [roster, setRoster] = useState<Roster>(NO_ROSTER), [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null), [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null), addRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<InjuryDialogId>();
  const rememberMove = useMoveFocus(draft);
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const saved = savedContent(snapshot);
  const dirty = !!draft && !!snapshot && injuryDirty(draft, saved);
  const locked = busy || !!pending || !!uploading;
  const unsaved = dirty || !!pending || uploads.length > 0;
  const players = snapshot?.players ?? [];

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setUploads([]); setMessage(""); setFailed(false); setStatus("");
    setConflict(false); setSaveFailed(false); setValidation(""); setErrors({}); setBusy(false); setUploading(null); setShared(null); setRoster(NO_ROSTER);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicInjuryReportEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), fetchInjuryPreviewRoster(club.id, supabase)])
      .then(([loaded, user, homepage, rows]) => {
        if (!active) return;
        if (!user.data.user) throw new Error("Sign in again to edit the Injury Report.");
        const key = `onzio:cinematic-injury-report:v1:${location.origin}:${user.data.user.id}:${club.id}`;
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
        setDraft(stored?.content ?? loaded.content ?? starterCinematicInjuryReportContent());
        setPending(stored?.pending ?? null);
        setUploads(stored?.uploads ?? []);
        setMedia(mergeMedia(loaded.media, stored?.media ?? []));
        setShared(homepage); setRoster(rows); setLoadedClubId(club.id);
        if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Injury Report draft has been restored.");
      }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load the Injury Report."); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || uploads.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending, uploads, media }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* The in-memory draft remains usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, uploads, media]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const former = useMemo(() => new Set(draft && snapshot ? retiredFromRoster(draft, players) : []), [draft, snapshot, players]);
  const settle = () => { setMessage(""); setFailed(false); setValidation(""); setErrors({}); setSaveFailed(false); };
  const update = (change: (value: CinematicInjuryReportContent) => CinematicInjuryReportContent | void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const next = structuredClone(current); return change(next) ?? next; });
    settle();
  };
  const byMedia = useMemo(() => new Map(media.map(item => [item.id, item])), [media]);
  const mediaUrls = useMemo(() => ({
    logo: mediaUrl(draft?.presenterLogoAssetId ? byMedia.get(draft.presenterLogoAssetId) : undefined),
    band: mediaUrl(draft?.bandAssetId ? byMedia.get(draft.bandAssetId) : undefined),
  }), [draft?.presenterLogoAssetId, draft?.bandAssetId, byMedia]);

  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy || uploading) return false;
    let request = pending;
    if (!request) {
      if (former.size) { setSaveFailed(true); setValidation("Remove the entries for players who are no longer on the Roster before saving."); return false; }
      const result = injuryReportSaveRequest(draft, snapshot, crypto.randomUUID());
      if (!result.ok) { setErrors(result.errors); setSaveFailed(true); setValidation("Review the highlighted fields before saving."); return false; }
      request = result.request;
    }
    const generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setErrors({}); setMessage(""); setStatus("Saving the Injury Report…");
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request, uploads, media })); } catch {}
    const result = await saveCinematicInjuryReportEditor(request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      const next = savedContent(result.snapshot);
      await retireUploads(unusedInjuryUploads(uploads, next));
      setSnapshot(result.snapshot); setDraft(next); setPending(null); setUploads([]); setConflict(false);
      setMedia(mergeMedia(result.snapshot.media));
      setMessage(""); setStatus("Injury Report saved."); clearRecovery();
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }

  /** Discard asks first when there are unsaved edits. */
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
      const loaded = await loadCinematicInjuryReportEditor();
      cinematicInjuryReportDraftSchema.parse(savedContent(loaded));
      if (generation !== epoch.current) return;
      if (keepDraft && draft) {
        // The latest revision becomes the base and the edits stay. Images added in this session stay available.
        const inUse = new Set([draft.presenterLogoAssetId, draft.bandAssetId]);
        setMedia(mergeMedia(loaded.media, media.filter(item => uploads.includes(item.id) || inUse.has(item.id))));
        setSnapshot(loaded);
        setMessage("Latest saved version loaded. Your edits were kept. Replace any image removed in the newer version before saving.");
      } else {
        await retireUploads(unusedInjuryUploads(uploads, savedContent(loaded)));
        if (generation !== epoch.current) return;
        setSnapshot(loaded); setDraft(savedContent(loaded)); setMedia(loaded.media); setUploads([]); setMessage(""); clearRecovery();
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation(""); setErrors({});
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload the Injury Report."); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }

  async function upload(slot: InjurySlot, file: File): Promise<boolean> {
    if (!draft || locked) return false;
    const generation = epoch.current, config = UPLOADS[slot];
    setUploading(slot); setFailed(false); setStatus(`Adding the ${config.label}…`);
    try {
      const result = await createClient().storage.from(config.bucket).upload(`${config.folder}/${crypto.randomUUID()}`, file);
      if (result.error || !result.data?.assetId) throw new Error(result.error?.message ?? `The ${config.label} upload failed.`);
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return false;
      const item: InjuryMedia = { id: result.data.assetId, storage_path: result.data.path, ...dimensions, kind: config.kind };
      setMedia(current => mergeMedia([item], current));
      setUploads(current => [...current, item.id]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => {
        if (!current) return current;
        const next = structuredClone(current);
        if (slot === "logo") next.presenterLogoAssetId = item.id; else next.bandAssetId = item.id;
        return next;
      });
      setStatus(`${slot === "logo" ? "Logo" : "Photo"} added. Save to publish it.`);
      return true;
    } catch (error) {
      if (generation === epoch.current) { setMessage(error instanceof Error ? error.message : `The ${config.label} upload failed.`); setFailed(true); }
      return false;
    } finally { if (generation === epoch.current) setUploading(null); }
  }

  const move = (index: number, delta: -1 | 1, inDialog: boolean) => {
    if (!draft || locked) return;
    const entry = draft.entries[index];
    if (!entry || index + delta < 0 || index + delta >= draft.entries.length) return;
    rememberMove(entry.id, delta, inDialog);
    update(content => moveInjuryEntry(content, index, delta));
    setStatus(`${playerLabel(entry, players, index)} is now number ${index + delta + 1}.`);
  };
  const remove = (index: number) => {
    if (!draft || locked) return;
    const entry = draft.entries[index];
    if (!entry) return;
    update(content => removeInjuryEntry(content, index));
    dialog.close();
    setStatus(`${playerLabel(entry, players, index)} removed. Save to publish.`);
    setTimeout(() => addRef.current?.focus(), 0);
  };
  const noRoomReason = !draft ? "" : draft.entries.length >= MAX_INJURY_ENTRIES ? `The page lists up to ${MAX_INJURY_ENTRIES} injuries. Remove one to add another.`
    : players.length === 0 ? "Add players in Roster first." : availablePlayers(players, draft, "").length === 0 ? "Every active Roster player already has an entry." : "";
  const addNew = (event: MouseEvent<HTMLButtonElement>) => {
    if (!draft || locked || noRoomReason) return;
    const next = addInjuryEntry(draft, players);
    const added = next.entries[next.entries.length - 1];
    if (!added || next === draft) return;
    setDraft(next); settle();
    dialog.openSection(entryDialogId(added.id), event);
  };

  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await save())) throw new Error("The Injury Report was not saved."); },
  });
  const latestSave = useRef(save);
  latestSave.current = save;
  useUnsavedGuard(draft ? {
    dirty: unsaved, edited: PAGE, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || uploading || pending) throw new Error("A save is still being confirmed.");
      if (!snapshot) return;
      void retireUploads(unusedInjuryUploads(uploads, saved));
      setDraft(saved); setUploads([]); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); setErrors({}); clearRecovery();
    },
  } : undefined);

  const deferred = useDeferredValue(draft);
  const pageState = partnerPageState({ base: saveAction.state, busy, uploading: !!uploading, pending: !!pending, conflict, saveFailed });
  const changedBlockSet = useMemo(() => new Set(draft && snapshot ? changedBlocks(draft, saved) : []), [draft, snapshot, saved]);
  const changedEntries = useMemo(() => (draft && snapshot ? changedEntryIds(draft, saved) : new Set<string>()), [draft, snapshot, saved]);
  const loading = !draft || !snapshot || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="The Injury Report is part of the cinematic website design and is unavailable for this design.">{null}</PageFrame>;

  const blockItems = draft ? BLOCKS.map(block => ({ id: block as string, title: BLOCK_TITLES[block], changed: changedBlockSet.has(block), disabled: locked })) : [];
  const entryItems: ItemCardItem[] = draft ? draft.entries.map((entry, index) => ({
    id: entryDialogId(entry.id), label: playerLabel(entry, players, index), changed: changedEntries.has(entry.id),
    flags: [
      ...(former.has(entry.id) ? [{ text: "Left the Roster", tone: "needed" as const }] : []),
      ...(!entry.injury.trim() ? [{ text: "Injury needed", tone: "needed" as const }] : []),
      ...(!entry.timeline.trim() ? [{ text: "Timeline needed", tone: "needed" as const }] : []),
    ],
  })) : [];
  const api: InjuryFieldsApi | null = draft ? {
    draft, players, former, locked, uploading, mediaUrls, errors, update, upload, move: (index, delta) => move(index, delta, true), remove,
  } : null;
  const blockPreview = (id: string) => {
    const target = parseInjuryDialogId(id);
    return deferred && target?.kind === "block" ? <BlockLive block={target.block} content={deferred} roster={roster} media={media} shared={shared} slice={blockSlice(target.block, deferred, mediaUrls)} /> : null;
  };
  const entryPreview = (id: string) => {
    const target = parseInjuryDialogId(id);
    const entry = deferred && target?.kind === "entry" ? deferred.entries.find(row => row.id === target.id) : undefined;
    if (!deferred || !entry) return null;
    const row = roster.players.find(player => player.id === entry.playerId);
    return <EntryLive content={deferred} entry={entry} roster={roster} shared={shared} slice={JSON.stringify([entry, row, former.has(entry.id)])} />;
  };
  const dialogSections = draft ? [
    ...BLOCKS.map(block => ({ id: block as string, title: BLOCK_TITLES[block], summary: block === "presenter" ? draft.page.presenterName.trim() || "Name needed" : draft.page.rehabHeading.trim() || "Heading needed" })),
    ...draft.entries.map((entry, index) => ({ id: entryDialogId(entry.id), title: playerLabel(entry, players, index), summary: former.has(entry.id) ? "Left the Roster" : entry.injury.trim() || "Injury needed" })),
  ] : [];

  const notice = (message || validation || conflict) ? <div className={styles.notice} data-injury-notice="">
    {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || conflict}>{message}
      {conflict && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className={`admin-press ${styles.keep}`} disabled={locked} onClick={() => void reload(true)}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
  </div> : null;

  if (!draft && failed) return <PageFrame title={PAGE} breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel="Loading the Injury Report…" minHeight={520}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={2} />
        <div className={preview.skeletonHead}><Shimmer className={preview.skeletonTitle} /></div><ItemPreviewCardsSkeleton count={4} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref={INJURY_REPORT_ROUTE} description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <PreviewCards sections={blockItems} label="Injury Report page parts" renderPreview={blockPreview} previewScale={0.4}
          onEdit={(id, event) => dialog.openSection(id as InjuryDialogId, event)} />
        {draft && <section className={styles.listSection} aria-labelledby="injuries-list-heading">
          <div className={styles.listHead}>
            <h2 id="injuries-list-heading">Injuries</h2>
            <span className={styles.count}>{draft.entries.length} of {MAX_INJURY_ENTRIES}</span>
          </div>
          <p className={styles.note}>Each card is an injury as it appears on the page, in this order. Open one to edit it beside a live preview. Pick a player from the <Link href="/admin/roster">Roster</Link>; each player can appear once.</p>
          {draft.entries.length === 0 && <p className={styles.empty}>No injuries. The page shows “No current injuries”.</p>}
          <ItemPreviewCards items={entryItems} noun="injury" label="Injuries" disabled={locked} previewScale={0.44} previewClassName={preview.single}
            renderPreview={entryPreview}
            onEdit={(id, event) => dialog.openSection(id as InjuryDialogId, event)}
            onMove={(id, delta) => { const index = draft.entries.findIndex(entry => entryDialogId(entry.id) === id); if (index >= 0) move(index, delta, false); }}
            add={{ label: "Add injury", count: `${draft.entries.length} of ${MAX_INJURY_ENTRIES}`, disabled: !!noRoomReason, onAdd: addNew, hint: noRoomReason || undefined }}
            addRef={addRef} />
        </section>}
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-injury-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title="Edit Injury Report" mode="split" returnFocusRef={dialog.returnFocusRef}
      sections={dialogSections} activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as InjuryDialogId)}
      renderSection={id => dialog.open ? <InjuryDialogFields api={api} id={id as InjuryDialogId} /> : null}
      previewHint="How this looks on the page"
      renderPreview={id => {
        if (!dialog.open) return null;
        const target = parseInjuryDialogId(id);
        if (!target) return null;
        const entry = target.kind === "entry" ? api.draft.entries.find(row => row.id === target.id) : undefined;
        const report = reportFor(api.draft, target.kind === "entry" ? (entry ? [entry] : []) : [], roster, media, true);
        return <div className={styles.livePreview} data-tall={target.kind === "block" && target.block === "rehab" ? "" : undefined}>
          <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={target.kind === "entry" ? "Injury on the page" : "Injury Report page"}>
            <CinematicShell contentOnly initialContent={shared}><CinematicInjuryReport report={report} /></CinematicShell>
          </HomepagePreviewFrame></div>;
      }} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved Injury Report edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
