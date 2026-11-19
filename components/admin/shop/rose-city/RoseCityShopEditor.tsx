"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { IconAdd, IconShop } from "@/components/admin/icons";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorDialog, PageFrame, ValidationMessage, derivePageSaveState, useEditorDialog, type EditorDialogSection, type PageSaveFailure } from "@/components/admin/ui/editor-kit";
import { useClubContext } from "@/components/ClubContextProvider";
import { createClient } from "@/lib/admin-client";
import type { CinematicShopPresentation } from "@/lib/cinematic-shop-content";
import { submitPageSave } from "@/lib/page-editor-save";
import { shopSaveRequestSchemaFor, type ShopPhoto, type ShopSection, type ShopSnapshot, type ShopSurface, type ShopVariant } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, rebaseShopDraft, shopDraftDirty, toShopSaveRequest, type ShopPageDraft } from "@/lib/shop-editor/model";
import { SHOP_OFF_BANNER } from "@/lib/store-visibility";
import { useShopPresentation } from "../ShopPageEditor";
import { KIT_NAMES, KitPicker, RoseCityShopFields, type ShopSectionId } from "./RoseCityShopFields";
import { HomeFeaturePreview, KIT_PART_CSS, SHARED_LEFT_CSS, SHARED_RIGHT_CSS, ShopPagePreview, kitContentFromDraft, useShopSponsorLogos } from "./ShopPreviewParts";
import { ShopScaledFrame } from "./ShopScaledFrame";
import { editionsForKit, nextKitToAdd, visibleKits } from "./shop-fields-model";
import styles from "./RoseCityShopEditor.module.css";

/** Natural size the public page is laid out at inside each preview box. */
export const KIT_PREVIEW = { width: 390, height: 1440 } as const;
export const SHARED_PREVIEW = { width: 1100, height: 1100 } as const;

const KIT_ORDER = ["home", "away", "third"] as const satisfies readonly ShopVariant[];
const SURFACE_LABELS: Record<ShopSurface, string> = { shop: "Shop page", home: "Homepage shop feature" };
type PendingRequest = ReturnType<typeof toShopSaveRequest>;
type ByS<T> = Partial<Record<ShopSurface, T>>;

const SECTION_TITLES: Record<ShopSectionId, string> = {
  editions: "Jersey options", kitPhotos: "Kit photos", kitText: "Kit text", photoRow: "Photo row", purchase: "Purchase details",
  details: "Jersey details", care: "Care line", sizes: "Size chart", map: "Route map", partners: "Partner strip", labels: "Page labels and layout",
};
const KIT_SECTIONS: readonly ShopSectionId[] = ["kitPhotos", "kitText", "photoRow"];
/** What a click on a part of the page opens. */
const TARGET_SECTION: Record<string, ShopSectionId> = {
  photos: "kitPhotos", copy: "kitText", cta: "kitText", photoRows: "photoRow", editions: "editions", purchase: "purchase", details: "details",
  attributes: "care", sizeChart: "sizes", map: "map", sponsors: "partners",
};

function markVariant(draft: ShopPageDraft, variant: ShopVariant): ShopPageDraft {
  return { ...draft, changedVariants: draft.changedVariants.includes(variant) ? draft.changedVariants : [...draft.changedVariants, variant] };
}
function markRow(draft: ShopPageDraft, variant: ShopVariant): ShopPageDraft {
  return { ...draft, changedRows: draft.changedRows.includes(variant) ? draft.changedRows : [...draft.changedRows, variant] };
}
const orderPhotos = (photos: ShopPhoto[]): ShopPhoto[] => photos.map((photo, order) => ({ ...photo, order }));

const CLEANUP = (assetId: string) => fetch("/api/admin/media/cleanup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) }).catch(() => undefined);

export default function RoseCityShopEditor() {
  const club = useClubContext();
  // The key resets every draft when the signed-in club changes.
  return <ShopEditor key={club.id} />;
}

function ShopEditor() {
  const presentation = useShopPresentation();
  const { club, hasHomeFeature, maxBulletPoints } = presentation;
  const storeOff = !club.storeEnabled;

  const [surfaceChoice, setSurfaceChoice] = useState<ShopSurface>("shop");
  const surface: ShopSurface = hasHomeFeature ? surfaceChoice : "shop";
  const [snapshots, setSnapshots] = useState<ByS<ShopSnapshot>>({});
  const [drafts, setDrafts] = useState<ByS<ShopPageDraft>>({});
  const [pendingSaves, setPendingSaves] = useState<ByS<PendingRequest>>({});
  const [conflicts, setConflicts] = useState<ByS<ShopSnapshot>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeKit, setActiveKit] = useState<ShopVariant>("home");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [replaceLatest, setReplaceLatest] = useState(false);
  const dialog = useEditorDialog<ShopSectionId>();
  const noticeRef = useRef<HTMLDivElement>(null);
  const saveInFlight = useRef(false);
  const uploadingRef = useRef(false);
  const latest = useRef({ snapshots, drafts, pendingSaves, conflicts });
  latest.current = { snapshots, drafts, pendingSaves, conflicts };
  uploadingRef.current = uploading;

  const snapshot = snapshots[surface];
  const draft = drafts[surface];
  const dirty = shopDraftDirty(draft);
  const pending = pendingSaves[surface];
  const conflict = conflicts[surface];
  const anyDirty = shopDraftDirty(drafts.home) || shopDraftDirty(drafts.shop);
  const anyPending = Boolean(pendingSaves.home || pendingSaves.shop);
  const locked = saving || Boolean(pending);
  const kitsOnPage: ShopVariant[] = draft && surface === "shop"
    ? visibleKits({ editionCount: draft.presentation.editions.length, kits: { home: { exists: draft.variants.home.exists, photoCount: draft.variants.home.photos.length }, away: { exists: draft.variants.away.exists, photoCount: draft.variants.away.photos.length }, third: { exists: draft.variants.third.exists, photoCount: draft.variants.third.photos.length } } }, KIT_ORDER)
    : ["home"];

  // Load the surface once.
  useEffect(() => {
    if (snapshots[surface]) return;
    const controller = new AbortController();
    setLoadError(null);
    void fetch(`/api/admin/shop?surface=${surface}`, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "Could not load this Shop page.");
        const loaded = result as ShopSnapshot;
        setSnapshots((current) => ({ ...current, [surface]: loaded }));
        setDrafts((current) => current[surface] ? current : { ...current, [surface]: draftFromShopSnapshot(loaded) });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load this Shop page."); });
    return () => controller.abort();
  }, [surface, snapshots]);

  useEffect(() => {
    if (!anyDirty && !anyPending) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [anyDirty, anyPending]);

  /* ---------------- edits (the same draft model and helpers the editor always used) ---------------- */

  function editDraft(update: (page: ShopPageDraft) => ShopPageDraft) {
    if (saveInFlight.current || pendingSaves[surface]) return;
    setDrafts((current) => {
      const page = current[surface];
      return page ? { ...current, [surface]: update(page) } : current;
    });
    setSaveError(null); setInfo(null);
  }
  const setSectionField = <K extends keyof ShopSection>(variant: ShopVariant, field: K, value: ShopSection[K]) => editDraft((page) => {
    const kit = page.variants[variant];
    return markVariant({ ...page, variants: { ...page.variants, [variant]: { ...kit, exists: true, section: { ...kit.section, [field]: value } } } }, variant);
  });
  const setKitPhotos = (variant: ShopVariant, photos: ShopPhoto[]) => editDraft((page) => markVariant({ ...page, variants: { ...page.variants, [variant]: { ...page.variants[variant], exists: true, photos: orderPhotos(photos) } } }, variant));
  const setRowPhotos = (variant: ShopVariant, photos: ShopPhoto[]) => editDraft((page) => markRow({ ...page, photoRows: { ...page.photoRows, [variant]: orderPhotos(photos) } }, variant));
  const updatePurchase = (field: keyof ShopPageDraft["purchase"], value: string | ShopPageDraft["purchase"]["cards"]) => editDraft((page) => ({ ...page, purchase: { ...page.purchase, [field]: value }, purchaseChanged: true }));
  const updatePresentation = <K extends keyof CinematicShopPresentation>(field: K, value: CinematicShopPresentation[K]) => editDraft((page) => ({ ...page, presentation: { ...page.presentation, [field]: value }, presentationChanged: true }));

  async function uploadPhotos(variant: ShopVariant, files: FileList | null, strip: boolean) {
    if (!files?.length || !draft || saveInFlight.current || pendingSaves[surface]) return;
    const current = strip ? draft.photoRows[variant] : draft.variants[variant].photos;
    const allowed = Array.from(files).slice(0, Math.max(0, 6 - current.length));
    if (!allowed.length) return;
    setUploading(true); setSaveError(null);
    const uploaded: ShopPhoto[] = [];
    try {
      const client = createClient();
      for (const file of allowed) {
        const path = `${strip ? "photo-strip" : "kit"}/${surface}-${variant}/${crypto.randomUUID()}-${file.name}`;
        const { data, error } = await client.storage.from("shop").upload(path, file);
        if (error || !data) throw new Error(error?.message ?? "Upload failed.");
        const { data: urlResult, error: urlError } = client.storage.from("shop").getPublicUrl(path);
        if (urlError || !urlResult.publicUrl) throw new Error(urlError?.message ?? "Could not prepare the photo.");
        uploaded.push({ rowId: null, assetId: data.assetId, url: urlResult.publicUrl, order: current.length + uploaded.length });
        // Keep each completed upload in the draft if a later file fails.
        if (strip) setRowPhotos(variant, [...current, ...uploaded]); else setKitPhotos(variant, [...current, ...uploaded]);
      }
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Upload failed."); } finally { setUploading(false); }
  }

  async function removePhoto(variant: ShopVariant, photo: ShopPhoto, strip: boolean) {
    if (saveInFlight.current || pendingSaves[surface]) return;
    const current = strip ? draft?.photoRows[variant] : draft?.variants[variant].photos;
    if (!current) return;
    const next = current.filter((item) => item !== photo);
    if (strip) setRowPhotos(variant, next); else setKitPhotos(variant, next);
    // A staged upload with no page reference can be retired immediately.
    if (photo.rowId === null && photo.assetId) await CLEANUP(photo.assetId);
  }

  async function cleanupUnsavedMap(assetId: string | null) {
    if (!assetId || assetId === snapshot?.presentation?.mapAssetId) return;
    await CLEANUP(assetId);
  }
  async function uploadMap(files: FileList | null) {
    if (!files?.[0] || !draft || uploading || saveInFlight.current || pendingSaves[surface]) return;
    const file = files[0], previous = draft.presentation.mapAssetId;
    setUploading(true); setSaveError(null);
    try {
      const client = createClient(), path = `map/${crypto.randomUUID()}-${file.name}`;
      const result = await client.storage.from("shop-artwork").upload(path, file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Could not upload the map.");
      const publicResult = client.storage.from("shop-artwork").getPublicUrl(path);
      if (publicResult.error || !publicResult.data.publicUrl) throw new Error("Could not prepare the map.");
      let dimensions: { mapWidth?: number; mapHeight?: number } = {};
      try { const bitmap = await createImageBitmap(file); dimensions = { mapWidth: bitmap.width, mapHeight: bitmap.height }; bitmap.close(); } catch { /* The finalized asset supplies authoritative dimensions after Save. */ }
      editDraft(page => ({ ...page, presentation: { ...page.presentation, ...dimensions, mapAssetId: result.data!.assetId, mapUrl: publicResult.data.publicUrl, mapVisible: true }, presentationChanged: true }));
      await cleanupUnsavedMap(previous);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not upload the map."); } finally { setUploading(false); }
  }
  async function removeMap() {
    if (!draft || uploading || saveInFlight.current || pendingSaves[surface]) return;
    const assetId = draft.presentation.mapAssetId;
    editDraft(page => ({ ...page, presentation: { ...page.presentation, mapAssetId: null, mapUrl: "", mapVisible: false }, presentationChanged: true }));
    await cleanupUnsavedMap(assetId);
  }
  async function cleanupUnsavedDetail(assetId: string | null) {
    const saved = snapshot?.presentation;
    if (!assetId || saved?.mapAssetId === assetId || saved?.details?.some(detail => detail.assetId === assetId)) return;
    await CLEANUP(assetId);
  }
  async function uploadDetail(index: number, files: FileList | null) {
    if (!files?.[0] || !draft || !draft.presentation.details[index] || uploading || saveInFlight.current || pendingSaves[surface]) return;
    const file = files[0], previous = draft.presentation.details[index].assetId;
    setUploading(true); setSaveError(null);
    try {
      const client = createClient(), path = `details/${crypto.randomUUID()}-${file.name}`;
      const result = await client.storage.from("shop").upload(path, file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Could not upload the photo.");
      const publicResult = client.storage.from("shop").getPublicUrl(path);
      if (publicResult.error || !publicResult.data.publicUrl) throw new Error("Could not prepare the photo.");
      const assetId = result.data.assetId, url = publicResult.data.publicUrl;
      editDraft(page => ({ ...page, presentation: { ...page.presentation, details: page.presentation.details.map((detail, i) => i === index ? { ...detail, assetId, url, width: undefined, height: undefined } : detail) }, presentationChanged: true }));
      await cleanupUnsavedDetail(previous);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not upload the photo."); } finally { setUploading(false); }
  }
  async function removeDetail(index: number) {
    if (!draft || uploading || saveInFlight.current || pendingSaves[surface]) return;
    const assetId = draft.presentation.details[index]?.assetId ?? null;
    editDraft(page => ({ ...page, presentation: { ...page.presentation, details: page.presentation.details.map((detail, i) => i === index ? { ...detail, assetId: null, url: "", width: undefined, height: undefined } : detail) }, presentationChanged: true }));
    await cleanupUnsavedDetail(assetId);
  }

  /* ---------------- save (the exact request, receipt, retry and conflict flow the editor always used) ---------------- */

  async function saveSurface(target: ShopSurface): Promise<boolean> {
    const { snapshots: shots, drafts: pages, pendingSaves: pendings, conflicts: conflictsNow } = latest.current;
    const targetSnapshot = shots[target], targetDraft = pages[target], targetPending = pendings[target];
    if (!targetDraft || !targetSnapshot || (!shopDraftDirty(targetDraft) && !targetPending) || saveInFlight.current || uploadingRef.current || conflictsNow[target]) return false;
    const request = targetPending ?? toShopSaveRequest(targetSnapshot, targetDraft, crypto.randomUUID());
    const parsed = shopSaveRequestSchemaFor(maxBulletPoints).safeParse(request);
    if (!parsed.success) { setSaveError(parsed.error.issues[0]?.message ?? "Check the fields on this page."); return false; }
    saveInFlight.current = true;
    setSaving(true); setSaveError(null); setPendingSaves((current) => ({ ...current, [target]: request }));
    try {
      const result = await submitPageSave<ShopSnapshot>(() => fetch("/api/admin/shop", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(targetPending ? { "X-Editor-Recovery": "1" } : {}) }, body: JSON.stringify(request) }), `/api/admin/shop?surface=${target}&operationId=${request.operationId}`);
      if (result.kind === "committed") {
        setSnapshots((current) => ({ ...current, [target]: result.snapshot }));
        setDrafts((current) => ({ ...current, [target]: draftFromShopSnapshot(result.snapshot) }));
        setPendingSaves((current) => ({ ...current, [target]: undefined }));
        return true;
      }
      if (result.kind === "unconfirmed") { setSaveError(result.message); return false; }
      setPendingSaves((current) => ({ ...current, [target]: undefined }));
      setSaveError(result.message);
      if (result.status === 409 && result.code === "CONTENT_CHANGED") {
        dialog.close();
        try {
          const response = await fetch(`/api/admin/shop?surface=${target}`, { credentials: "same-origin", cache: "no-store" });
          const fresh = await response.json();
          if (!response.ok) throw new Error("Could not load the latest Shop page.");
          setConflicts((current) => ({ ...current, [target]: fresh as ShopSnapshot }));
        } catch { setSaveError("The Shop page changed. Your draft is still here. Try Save again to load the latest version."); }
      }
      return false;
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  const saveAction = useSaveState({
    isDirty: dirty || Boolean(pending),
    onSave: async () => { if (!(await saveSurface(surface))) throw new Error("The Shop page was not saved."); },
  });
  const saveFromPage = () => { void saveAction.save().catch(() => undefined); };
  const failure: PageSaveFailure | null = conflict ? "conflict" : pending ? "retry" : saveError && dirty ? "error" : null;
  const saveState = derivePageSaveState(saving ? "saving" : saveAction.state, failure);

  function resolveConflict(keepDraft: boolean) {
    if (!conflict) return;
    if (!keepDraft && !replaceLatest) { setReplaceLatest(true); return; }
    setReplaceLatest(false);
    setSnapshots((current) => ({ ...current, [surface]: conflict }));
    setDrafts((current) => ({ ...current, [surface]: keepDraft && current[surface] ? rebaseShopDraft(current[surface]!, conflict) : draftFromShopSnapshot(conflict) }));
    setConflicts((current) => ({ ...current, [surface]: undefined }));
    setSaveError(null);
    setInfo(keepDraft ? "Your draft is ready to save over the reviewed page." : null);
  }

  /** Put one surface back to what is saved and retire photos uploaded for it that no page uses. */
  async function discardSurface(target: ShopSurface) {
    const { snapshots: shots, drafts: pages } = latest.current;
    const targetSnapshot = shots[target], targetDraft = pages[target];
    if (!targetSnapshot || !targetDraft) return;
    const kept = new Set<string>();
    targetSnapshot.photos.concat(targetSnapshot.photoRows).forEach((photo) => photo.assetId && kept.add(photo.assetId));
    if (targetSnapshot.presentation?.mapAssetId) kept.add(targetSnapshot.presentation.mapAssetId);
    targetSnapshot.presentation?.details?.forEach((detail) => detail.assetId && kept.add(detail.assetId));
    const staged = new Set<string>();
    Object.values(targetDraft.variants).forEach((kit) => kit.photos.forEach((photo) => photo.rowId === null && photo.assetId && !kept.has(photo.assetId) && staged.add(photo.assetId)));
    Object.values(targetDraft.photoRows).forEach((row) => row.forEach((photo) => photo.rowId === null && photo.assetId && !kept.has(photo.assetId) && staged.add(photo.assetId)));
    const mapId = targetDraft.presentation.mapAssetId;
    if (mapId && !kept.has(mapId)) staged.add(mapId);
    targetDraft.presentation.details.forEach((detail) => detail.assetId && !kept.has(detail.assetId) && staged.add(detail.assetId));
    setDrafts((current) => ({ ...current, [target]: draftFromShopSnapshot(targetSnapshot) }));
    setPendingSaves((current) => ({ ...current, [target]: undefined }));
    setConflicts((current) => ({ ...current, [target]: undefined }));
    setSaveError(null);
    for (const assetId of staged) await CLEANUP(assetId);
  }

  const saveEverything = useCallback(async () => {
    let clean = true;
    for (const target of ["shop", "home"] as const) {
      const { drafts: pages, pendingSaves: pendings } = latest.current;
      if (shopDraftDirty(pages[target]) || pendings[target]) clean = (await saveSurface(target)) && clean;
    }
    return clean;
    // saveSurface reads everything it needs from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveEverythingRef = useRef(saveEverything);
  saveEverythingRef.current = saveEverything;
  const requestSwitch = useUnsavedGuard({
    dirty: anyDirty || anyPending || saving || uploading,
    edited: "your Shop edits",
    onSave: () => saveEverythingRef.current(),
    onDiscard: async () => { await discardSurface("shop"); await discardSurface("home"); },
  });

  function switchSurface(next: ShopSurface, opener: HTMLElement) {
    if (next === surface || saving || uploading) return;
    requestSwitch({ kind: "switch", label: SURFACE_LABELS[next], opener, continue: () => { dialog.close(); setSurfaceChoice(next); setActiveKit("home"); } });
  }

  /* ---------------- the page ---------------- */

  const kits = useMemo(() => draft ? kitContentFromDraft(draft, surface) : null, [draft, surface]);
  const sponsors = useShopSponsorLogos(club.id);
  const sections: EditorDialogSection[] = (surface === "shop" ? (Object.keys(SECTION_TITLES) as ShopSectionId[]) : (["kitPhotos", "kitText"] as ShopSectionId[]))
    .map((id) => ({ id, title: SECTION_TITLES[id], summary: sectionSummary(id, draft, activeKit) }));

  function openSection(id: ShopSectionId, kit: ShopVariant | null, event?: MouseEvent<HTMLElement>) {
    if (kit) setActiveKit(kit);
    dialog.openSection(id, event);
  }
  function selectFromPreview(target: string, kit: ShopVariant | null) {
    const id = TARGET_SECTION[target];
    if (id) openSection(id, KIT_SECTIONS.includes(id) ? kit : null);
  }

  const nextKit = nextKitToAdd(KIT_ORDER, kitsOnPage);
  function addKit() {
    if (!draft || !nextKit) return;
    // Option i is kit i, so pad blank options up to this kit's own and no further.
    updatePresentation("editions", editionsForKit(draft.presentation.editions, KIT_ORDER.indexOf(nextKit), () => ({ label: "", price: "", line: "", link: "" })));
    setActiveKit(nextKit);
  }

  const description = surface === "shop"
    ? "Each kit side by side. Click a kit’s photo, words or photo row to edit it. Everything below is shared by all kits."
    : "The homepage shop feature shows the Home kit only. It saves on its own.";
  const loading = !draft || !snapshot || !kits;
  const noticeBlocks = <div ref={noticeRef} tabIndex={-1} className={styles.notices} data-shop-notices="">
    {storeOff && <ValidationMessage><span className="inline-flex items-center gap-2"><IconShop size={16} aria-hidden="true" />{SHOP_OFF_BANNER}</span></ValidationMessage>}
    {(saveError || loadError) && !conflict && <ValidationMessage live="assertive">{saveError ?? loadError}</ValidationMessage>}
    {info && !conflict && !saveError && <ValidationMessage live="polite">{info}</ValidationMessage>}
    {pending && <ValidationMessage live="polite" title="The last save is not confirmed">Retry the exact save before saving newer changes. Use Retry same save at the top of the page.</ValidationMessage>}
    {conflict && <div role="region" aria-label="Review latest Shop page" className={styles.conflict} data-shop-conflict="">
      <ValidationMessage live="assertive" title="Another editor saved this page">
        Your draft is still here. Latest kit: {conflict.sections.find((section) => section.kit_variant === activeKit)?.title || "Untitled"}.
      </ValidationMessage>
      <div className={styles.conflictActions}>
        <button type="button" className={`admin-press ${styles.secondary}`} onClick={() => resolveConflict(true)}>Load latest and keep my edits</button>
        <button type="button" className={`admin-press ${styles.secondary}`} onClick={() => resolveConflict(false)}>Reload saved page</button>
      </div>
    </div>}
  </div>;

  return <>
    <PageFrame
      title="Shop"
      breadcrumb={[{ label: "Website", href: "/admin/homepage" }, { label: "Pages", href: "/admin/website-pages" }]}
      openPageHref={surface === "shop" ? "/shop" : "/"}
      state={loading ? "clean" : saveState}
      onSave={saveFromPage}
      onRetry={saveFromPage}
      onConflict={() => noticeRef.current?.querySelector<HTMLElement>("button")?.focus()}
      onDiscard={() => setConfirmDiscard(true)}
      notice={noticeBlocks}
    >
      <div className={styles.body} aria-busy={loading || undefined}>
        {hasHomeFeature && <div className={styles.toolbar}>
          <div className={styles.switch} role="group" aria-label="What to edit">
            {(["shop", "home"] as const).map((value) => <button key={value} type="button" className={`admin-press ${styles.switchButton}`} aria-pressed={surface === value} disabled={saving || loading && value !== surface} onClick={(event) => switchSurface(value, event.currentTarget)}>
              {SURFACE_LABELS[value]}
              {shopDraftDirty(drafts[value]) && <span className={styles.dot} title="Unsaved edits"><span className="sr-only"> (unsaved edits)</span></span>}
            </button>)}
          </div>
          <p className={styles.hint}>{description}</p>
        </div>}
        {loading ? <ShopBodySkeleton surface={surface} /> : <>
          <ul className={styles.kitCols} data-surface={surface} aria-label="Kits" data-shop-kit-columns="">
            {kitsOnPage.map((kitId, index) => {
              const edition = draft.presentation.editions[index];
              const needsPhoto = draft.changedVariants.includes(kitId) && draft.variants[kitId].photos.length === 0;
              return <li key={kitId} className={styles.kit} data-kit={kitId}>
                <div className={styles.kitHead}>
                  <h2>{KIT_NAMES[kitId]}</h2>
                  {surface === "shop" && <button type="button" className={`admin-press ${styles.optionButton}`} aria-label={`Edit jersey options, ${KIT_NAMES[kitId].toLowerCase()}`} onClick={(event) => openSection("editions", null, event)}>
                    {edition ? [edition.label || "Untitled", edition.price].filter(Boolean).join(" · ") : "No jersey option yet"}
                  </button>}
                </div>
                <div className={styles.previewBox}>
                  <ShopScaledFrame naturalWidth={KIT_PREVIEW.width} naturalHeight={KIT_PREVIEW.height} label={`${KIT_NAMES[kitId]} preview`} css={surface === "shop" ? KIT_PART_CSS : ""} onSelect={(target) => selectFromPreview(target, kitId)}>
                    {presentation.renderPreview(kits, surface, () => undefined, surface === "shop"
                      ? <ShopPagePreview draft={draft} kits={kits} kit={kitId} sponsors={sponsors} />
                      : <HomeFeaturePreview kits={kits} maxBulletPoints={maxBulletPoints} />)}
                  </ShopScaledFrame>
                </div>
                {needsPhoto && <ValidationMessage live="polite">Add at least one photo before saving this kit.</ValidationMessage>}
                <div className={styles.kitActions} role="group" aria-label={`Edit the ${KIT_NAMES[kitId].toLowerCase()}`}>
                  <button type="button" className={`admin-press ${styles.chip}`} data-kit-edit="" aria-label="Edit kit text" onClick={(event) => openSection("kitText", kitId, event)}>Kit text</button>
                  <button type="button" className={`admin-press ${styles.chip}`} data-kit-edit="" aria-label="Edit kit photos" onClick={(event) => openSection("kitPhotos", kitId, event)}>Kit photos</button>
                  {surface === "shop" && <button type="button" className={`admin-press ${styles.chip}`} data-kit-edit="" aria-label="Edit photo row" onClick={(event) => openSection("photoRow", kitId, event)}>Photo row</button>}
                </div>
              </li>;
            })}
            {surface === "shop" && nextKit && <li className={styles.addColumn}>
              <button type="button" className={`admin-press ${styles.addKit}`} onClick={addKit} disabled={locked}>
                <IconAdd size={20} aria-hidden="true" />
                <b>Add {KIT_NAMES[nextKit].toLowerCase()}</b>
                <small>A jersey option with its own photos, words and photo row</small>
              </button>
            </li>}
          </ul>

          {surface === "shop" && <section className={styles.shared} aria-labelledby="shop-shared-heading">
            <h2 id="shop-shared-heading" className={styles.sharedHeading}>Shared by all kits</h2>
            <div className={styles.sharedGrid}>
              <div className={styles.sharedBox}>
                <ShopScaledFrame naturalWidth={SHARED_PREVIEW.width} naturalHeight={SHARED_PREVIEW.height} label="Purchase and jersey details preview" css={SHARED_LEFT_CSS} onSelect={(target) => selectFromPreview(target, null)}>
                  {presentation.renderPreview(kits, surface, () => undefined, <ShopPagePreview draft={draft} kits={kits} kit={activeKit} sponsors={sponsors} />)}
                </ShopScaledFrame>
              </div>
              <div className={styles.sharedBox}>
                <ShopScaledFrame naturalWidth={SHARED_PREVIEW.width} naturalHeight={SHARED_PREVIEW.height} label="Size chart, route map and partner strip preview" css={SHARED_RIGHT_CSS} onSelect={(target) => selectFromPreview(target, null)}>
                  {presentation.renderPreview(kits, surface, () => undefined, <ShopPagePreview draft={draft} kits={kits} kit={activeKit} sponsors={sponsors} />)}
                </ShopScaledFrame>
              </div>
            </div>
            <div className={styles.sharedActions} role="group" aria-label="Edit shared sections">
              {(["purchase", "details", "care", "sizes", "map", "partners", "labels"] as const).map((id) => <button key={id} type="button" className={`admin-press ${styles.chip}`} data-kit-edit="" onClick={(event) => openSection(id, null, event)}>{SECTION_TITLES[id]}</button>)}
            </div>
          </section>}
        </>}
      </div>
    </PageFrame>

    <EditorDialog
      open={dialog.open}
      onClose={dialog.close}
      title={`Edit ${SURFACE_LABELS[surface]}`}
      sections={sections}
      activeId={dialog.activeId}
      onActiveChange={(id) => dialog.switchTo(id as ShopSectionId)}
      returnFocusRef={dialog.returnFocusRef}
      loading={loading}
      renderSection={(id) => draft ? <fieldset disabled={locked} className={styles.fieldset}>
        {KIT_SECTIONS.includes(id as ShopSectionId) && <KitPicker value={activeKit} kits={kitsOnPage} onChange={setActiveKit} />}
        <RoseCityShopFields
          id={id as ShopSectionId} surface={surface} kitId={activeKit} draft={draft} maxBulletPoints={maxBulletPoints} uploading={uploading}
          setSectionField={setSectionField} setKitPhotos={setKitPhotos} setRowPhotos={setRowPhotos} uploadPhotos={(variant, files, strip) => void uploadPhotos(variant, files, strip)}
          removePhoto={(variant, photo, strip) => void removePhoto(variant, photo, strip)} updatePurchase={updatePurchase} updatePresentation={updatePresentation}
          uploadMap={(files) => void uploadMap(files)} removeMap={() => void removeMap()} uploadDetail={(index, files) => void uploadDetail(index, files)} removeDetail={(index) => void removeDetail(index)}
        />
      </fieldset> : null}
    />

    <AdminConfirmDialog open={confirmDiscard} destructive title="Discard your Shop changes?" confirmLabel="Discard changes" onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); void discardSurface(surface); }}>
      The {SURFACE_LABELS[surface].toLowerCase()} goes back to what is saved. This cannot be undone.
    </AdminConfirmDialog>
    <AdminConfirmDialog open={replaceLatest} title="Use the latest saved page?" confirmLabel="Use latest saved page" onCancel={() => setReplaceLatest(false)} onConfirm={() => resolveConflict(false)}>Discard your Shop draft and use the latest saved page?</AdminConfirmDialog>
  </>;
}

function sectionSummary(id: ShopSectionId, draft: ShopPageDraft | undefined, kit: ShopVariant): string | undefined {
  if (!draft) return undefined;
  const p = draft.presentation;
  switch (id) {
    case "editions": return p.editions.map((e) => `${e.label || "Untitled"} ${e.price}`.trim()).join(" · ") || "No options yet";
    case "kitPhotos": return `${KIT_NAMES[kit]}: ${draft.variants[kit].photos.length} photos`;
    case "kitText": return `${KIT_NAMES[kit]}: ${draft.variants[kit].section.title || "no title yet"}`;
    case "photoRow": return `${KIT_NAMES[kit]}: ${draft.photoRows[kit].length} photos`;
    case "purchase": return `${draft.purchase.cards.length} detail cards`;
    case "details": return `${p.details.length} tiles`;
    case "care": return p.attributes.filter(Boolean).join(" · ") || "Nothing yet";
    case "sizes": return `${p.sizeChart.columns.length} sizes · ${p.sizeChart.rows.length} measurements`;
    case "map": return p.mapVisible ? p.mapHeading || "Shown" : "Hidden";
    case "partners": return p.sponsorsVisible ? p.sponsorsHeading || "Shown" : "Hidden";
    case "labels": return `Kit image ${p.leadScale}% wide`;
  }
}

/** The page's shape while it loads: the switch bar, three kit boxes and two shared boxes, in the loaded page's own boxes. */
function ShopBodySkeleton({ surface }: { surface: ShopSurface }) {
  const columns = surface === "shop" ? 3 : 1;
  return <div role="status" aria-label="Loading the Shop page" data-shop-skeleton="">
    <ul className={styles.kitCols} data-surface={surface} aria-hidden="true">
      {Array.from({ length: columns }, (_, index) => <li key={index} className={styles.kit}>
        <div className={styles.kitHead}><Shimmer className={styles.skelTitle} /><Shimmer className={styles.skelOption} /></div>
        <div className={styles.previewBox}><div style={{ aspectRatio: `${KIT_PREVIEW.width} / ${KIT_PREVIEW.height}` }}><Shimmer className={styles.skelFill} /></div></div>
        <div className={styles.kitActions}><Shimmer className={styles.skelChip} /><Shimmer className={styles.skelChip} /><Shimmer className={styles.skelChip} /></div>
      </li>)}
    </ul>
    {surface === "shop" && <section className={styles.shared} aria-hidden="true">
      <Shimmer className={styles.skelSharedHeading} />
      <div className={styles.sharedGrid}>
        {[0, 1].map((index) => <div key={index} className={styles.sharedBox}><div style={{ aspectRatio: `${SHARED_PREVIEW.width} / ${SHARED_PREVIEW.height}` }}><Shimmer className={styles.skelFill} /></div></div>)}
      </div>
      <div className={styles.sharedActions}>{Array.from({ length: 7 }, (_, index) => <Shimmer key={index} className={styles.skelChip} />)}</div>
    </section>}
  </div>;
}
