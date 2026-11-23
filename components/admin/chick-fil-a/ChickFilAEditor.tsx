"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { loadVisitorPageEditor, saveVisitorPageEditor, type VisitorPageSaveRequest } from "@/lib/visitor-page-editor";
import {
  chickFilAContentSchema, chickFilARecoverySchema, chickFilASaveSchema, emptyChickFilAContent, hydrateChickFilAContent,
  type ChickFilAArtworkSlot, type ChickFilAContent, type ChickFilASnapshot,
} from "@/lib/chick-fil-a-content";
import { loadTicketsEditor } from "@/lib/tickets-editor";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { TicketsContent } from "@/lib/tickets-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import "@/components/admin/homepage/homepage-editor.css";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { partnerPageState } from "@/components/admin/stadium/partner-page-state";
import styles from "@/components/admin/stadium/PartnerPageParts.module.css";
import { ChickFilASectionFields } from "./ChickFilASectionFields";
import { chickFilAPreviewStamps } from "./chick-fil-a-edit-targets";
import { DISCARD_CONFIRM } from "../editor-copy";
import {
  CHICK_FIL_A_CARDS, buildChickFilASaveInput, changedChickFilACards, chickFilACardOnly, chickFilACardSummary, chickFilADirty,
  chickFilAFlag, chickFilAImageRules, chickFilAPreviewImages, chickFilAPreviewSlice, type ChickFilACardId,
} from "./chick-fil-a-sections";

type Purchase = Pick<TicketsContent, "purchaseUrl" | "missingPurchaseLabel">;
const blankPurchase: Purchase = { purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon" };
const PAGE = "Chick-fil-A";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Tickets and stadium" }];
const DESCRIPTION = "Edit the meal pass, details, three steps and images. Save applies all changes together.";

type PreviewProps = {
  id: ChickFilACardId; content: ChickFilAContent; media: ChickFilASnapshot["media"]; shared: CinematicHomepageContent | null; purchase: Purchase; slice: string;
};
/** The real public page component, fed the draft with only this card's section switched on. Re-renders only when its own slice changes. */
const SectionLive = memo(function SectionLive({ id, content, media, shared, purchase }: PreviewProps) {
  const page = useMemo(() => hydrateChickFilAContent(chickFilACardOnly(content, id), media, false), [content, id, media]);
  const urls = useMemo(() => chickFilAPreviewImages(id).flatMap(slot => page.artwork[slot].url ? [page.artwork[slot].url as string] : []), [page, id]);
  return <SettledPreview urls={urls}><CinematicShell contentOnly initialContent={shared}><CinematicChickFilA content={page} purchase={purchase} /></CinematicShell></SettledPreview>;
}, (a, b) => a.id === b.id && a.slice === b.slice && a.media === b.media && a.shared === b.shared && a.purchase === b.purchase);

export default function ChickFilAEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<ChickFilASnapshot | null>(null), [draft, setDraft] = useState<ChickFilAContent | null>(null);
  const [media, setMedia] = useState<ChickFilASnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]);
  const [pending, setPending] = useState<VisitorPageSaveRequest<ChickFilAContent> | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<ChickFilAArtworkSlot | null>(null);
  const [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [purchase, setPurchase] = useState<Purchase>(blankPurchase);
  const [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), generation = useRef(0), currentClubId = useRef(club.id), keepRef = useRef<HTMLButtonElement>(null);
  currentClubId.current = club.id;
  const dialog = useEditorDialog<ChickFilACardId>();
  const dirty = !!draft && !!snapshot && chickFilADirty(draft, snapshot.content);
  const locked = busy || !!pending || !!uploading;
  const unsaved = dirty || !!pending || retired.length > 0;
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch { /* Current in-memory draft remains available. */ } };

  useEffect(() => {
    const epoch = ++generation.current;
    let active = true;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setRetired([]);
    setMessage(""); setFailed(false); setStatus(""); setConflict(false); setSaveFailed(false); setValidation("");
    setBusy(false); setUploading(null); setShared(null); setPurchase(blankPurchase);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<ChickFilAContent>("chick-fil-a"), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), loadTicketsEditor()])
      .then(([loaded, user, homepage, tickets]) => {
        if (!active || generation.current !== epoch) return;
        if (!user.data.user) throw new Error(`Sign in again to edit ${PAGE}.`);
        const savedContent = chickFilAContentSchema.parse(loaded.content ?? emptyChickFilAContent());
        const key = `onzio:chick-fil-a:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        setShared(homepage); setPurchase(tickets.content ? { purchaseUrl: tickets.content.purchaseUrl, missingPurchaseLabel: tickets.content.missingPurchaseLabel } : blankPurchase);
        let restored: ReturnType<typeof chickFilARecoverySchema.parse> | null = null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) { const parsed = chickFilARecoverySchema.safeParse(JSON.parse(raw)); if (parsed.success) restored = parsed.data; else localStorage.removeItem(key); }
        } catch { /* Broken or unavailable browser storage cannot block saved content. */ }
        setSnapshot(restored ? { ...loaded, revision: restored.revision, designRevision: restored.designRevision } : loaded);
        setDraft(restored?.content ?? savedContent); setMedia(restored?.media ?? loaded.media); setRetired(restored?.retired ?? []); setPending(restored?.pending ?? null); setLoadedClubId(club.id);
        if (restored) setMessage(restored.pending ? "An earlier save needs confirmation. Retry the same save." : `Your unsaved ${PAGE} draft has been restored.`);
      }).catch(error => { if (active && generation.current === epoch) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to load ${PAGE}.`); } });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);
  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current || loadedClubId !== club.id) return;
    try { if (dirty || pending || retired.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, retired })); else localStorage.removeItem(recoveryKey.current); }
    catch { /* Keep the draft in memory if browser storage is unavailable. */ }
  }, [draft, snapshot, dirty, pending, media, retired, loadedClubId, club.id]);
  useEffect(() => { if (!dirty && !pending) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, pending]);

  const owns = (epoch: number, clubId: string) => generation.current === epoch && currentClubId.current === clubId;
  const update = (edit: (content: ChickFilAContent) => void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; });
    setMessage(""); setFailed(false); setValidation(""); setSaveFailed(false);
  };
  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || uploading || busy || loadedClubId !== club.id) return false;
    const epoch = generation.current, clubId = club.id;
    const parsed = chickFilASaveSchema.safeParse(buildChickFilASaveInput({ pending, operationId: crypto.randomUUID(), snapshot, draft, retired }));
    if (!parsed.success) { setSaveFailed(true); setValidation("Review the page fields before saving."); return false; }
    const request = parsed.data;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setMessage(""); setStatus(`Saving ${PAGE}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired })); } catch { }
    let committed = false;
    try {
      const outcome = await saveVisitorPageEditor("chick-fil-a", request);
      if (!owns(epoch, clubId)) return false;
      if (outcome.status === "committed") {
        setSnapshot(outcome.snapshot); setDraft(outcome.snapshot.content ?? emptyChickFilAContent()); setMedia(outcome.snapshot.media); setRetired([]); setPending(null); setConflict(false); clearRecovery();
        setMessage(outcome.snapshot.cleanupPending ? `${PAGE} saved. Image cleanup will retry automatically.` : ""); setStatus(`${PAGE} saved.`);
        committed = true;
      } else if (outcome.status === "uncertain") { setPending(outcome.request); setFailed(true); setMessage(outcome.message); }
      else { setPending(null); setFailed(true); setSaveFailed(outcome.status !== "conflict"); setConflict(outcome.status === "conflict"); setMessage(outcome.message); }
    } catch { if (owns(epoch, clubId)) { setFailed(true); setMessage("Save could not be confirmed. Retry the same save. Your draft is locked until then."); } }
    finally { if (owns(epoch, clubId)) setBusy(false); }
    return committed;
  }
  /** Discard asks first when there are unsaved edits. */
  function requestDiscard() {
    if (busy || uploading) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty || retired.length) setConfirmReload(true);
    else void reload();
  }
  async function reload(keepDraft = false) {
    if (locked || loadedClubId !== club.id) return;
    const epoch = generation.current, clubId = club.id;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<ChickFilAContent>("chick-fil-a");
      chickFilAContentSchema.parse(loaded.content ?? emptyChickFilAContent());
      if (!owns(epoch, clubId)) return;
      if (keepDraft) {
        const previous = new Set(snapshot?.media.map(image => image.id));
        setMedia([...loaded.media, ...media.filter(image => !previous.has(image.id) && !loaded.media.some(saved => saved.id === image.id))]);
        setMessage("Latest saved version loaded. Your edits were kept. Replace any images removed in the newer version before saving.");
      } else { setDraft(loaded.content ?? emptyChickFilAContent()); setMedia(loaded.media); setRetired([]); setMessage(""); clearRecovery(); }
      setSnapshot(loaded); setConflict(false); setFailed(false); setSaveFailed(false); setValidation("");
    } catch (error) { if (owns(epoch, clubId)) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to reload ${PAGE}.`); } }
    finally { if (owns(epoch, clubId)) setBusy(false); }
  }
  async function upload(slot: ChickFilAArtworkSlot, file: File): Promise<boolean> {
    if (!draft || locked || loadedClubId !== club.id) return false;
    const epoch = generation.current, clubId = club.id;
    setUploading(slot); setFailed(false); setStatus("Adding your image…");
    try {
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
      const result = await createClient().storage.from(chickFilAImageRules(slot).bucket).upload("chick-fil-a/" + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      if (!owns(epoch, clubId)) return false;
      const oldId = draft.artwork[slot].assetId;
      if (oldId && media.some(image => image.id === oldId) && !snapshot?.media.some(image => image.id === oldId)) setRetired(current => [...new Set([...current, oldId])]);
      setMedia(current => [...current, { id: result.data.assetId, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => { if (!current) return current; const copy = structuredClone(current); copy.artwork[slot].assetId = result.data.assetId; return copy; });
      setStatus(`Image ready. Save ${PAGE} to use it.`);
      return true;
    } catch (error) { if (owns(epoch, clubId)) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } return false; }
    finally { if (owns(epoch, clubId)) setUploading(null); }
  }
  function removeImage(slot: ChickFilAArtworkSlot) {
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
      setDraft(snapshot.content ?? emptyChickFilAContent()); setRetired([]); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); clearRecovery();
    },
  } : undefined);

  const deferred = useDeferredValue(draft);
  const pageState = partnerPageState({ base: saveAction.state, busy, uploading: !!uploading, pending: !!pending, conflict, saveFailed });
  const changed = useMemo(() => new Set(draft && snapshot ? changedChickFilACards(draft, snapshot.content) : []), [draft, snapshot]);
  // Click-to-field stamps per card. They name nodes by their place in the page (no row follows the draft here), so they are
  // built once: a new array would restart that card's stamp watcher, and the watcher already re-stamps when the preview changes.
  const stampsByCard = useMemo(() => new Map(CHICK_FIL_A_CARDS.map(card => [card.id, chickFilAPreviewStamps(card.id)])), []);
  const page = draft ? hydrateChickFilAContent(draft, media, false) : null;
  const loading = !draft || !page || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="This page is unavailable for the current website design.">{null}</PageFrame>;

  const cardItems = draft ? CHICK_FIL_A_CARDS.map(card => {
    const flag = chickFilAFlag(card.id);
    return {
      id: card.id, title: card.title, changed: changed.has(card.id), summary: chickFilACardSummary(draft, card.id), disabled: locked,
      ...(flag ? { visible: draft.sections[flag], onVisibleChange: (visible: boolean) => update(content => { content.sections[flag] = visible; }) } : {}),
    };
  }) : [];
  const api = draft && page ? { draft, page, locked, uploading, update, upload, removeImage } : null;
  const previewOf = (id: string) => deferred && <SectionLive id={id as ChickFilACardId} content={deferred} media={media} shared={shared} purchase={purchase} slice={chickFilAPreviewSlice(deferred, id as ChickFilACardId)} />;

  const notice = (message || validation || conflict) ? <div className={styles.notice} data-chick-fil-a-notice="">
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
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={CHICK_FIL_A_CARDS.length} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref="/stadium/chick-fil-a" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <PreviewCards sections={cardItems} label="Chick-fil-A sections" renderPreview={previewOf} previewScale={0.46}
          stamps={id => stampsByCard.get(id as ChickFilACardId) ?? []}
          onEdit={(id, event, target) => { dialog.openSection(id as ChickFilACardId, event); dialog.focusField(target); }} />
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-chick-fil-a-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${PAGE}`} mode="split" returnFocusRef={dialog.returnFocusRef}
      sections={CHICK_FIL_A_CARDS.map(card => {
        const flag = chickFilAFlag(card.id);
        return { id: card.id, title: card.title, summary: draft && (flag && !draft.sections[flag] ? "Hidden on the page" : chickFilACardSummary(draft, card.id)) };
      })}
      focusRequest={dialog.focusRequest} activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as ChickFilACardId)}
      renderSection={id => dialog.open ? <ChickFilASectionFields api={api} id={id as ChickFilACardId} /> : null}
      renderPreview={id => dialog.open ? <div className={styles.livePreview}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={`${PAGE} section`}>
          <CinematicShell contentOnly initialContent={shared}><CinematicChickFilA content={hydrateChickFilAContent(chickFilACardOnly(api.draft, id as ChickFilACardId), media, false)} purchase={purchase} /></CinematicShell>
        </HomepagePreviewFrame></div> : null} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {PAGE} edits and load the saved page?
    </AdminConfirmDialog>
  </>;
}
