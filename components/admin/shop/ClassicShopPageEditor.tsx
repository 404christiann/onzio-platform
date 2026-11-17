"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ShopKitSection from "@/components/ShopKitSection";
import ShopPhotoStrip from "@/components/ShopPhotoStrip";
import ShopPurchaseDetailsSection from "@/components/ShopPurchaseDetailsSection";
import { useClubContext } from "@/components/ClubContextProvider";
import { hasShopPurchaseDetails } from "@/lib/shop-purchase-details";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { useAdminTheme } from "@/components/admin/AdminThemeProvider";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminDialog, AdminDialogFooter, AdminDialogSection, AdminDialogFields } from "@/components/admin/ui/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";
import { AdminPhotoManager, type AdminPhoto } from "@/components/admin/ui/AdminPhotoManager";
import { PreviewToggle } from "@/components/admin/ui/PreviewToggle";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { Button } from "@/components/ui/button";
import ShopPreviewFrame from "./ShopPreviewFrame";
import { useShopPresentation } from "./ShopPageEditor";
import { submitPageSave } from "@/lib/page-editor-save";
import { createClient } from "@/lib/admin-client";
import { SHOP_OFF_BANNER } from "@/lib/store-visibility";
import { shopSaveRequestSchema, type ShopPhoto, type ShopSection, type ShopSnapshot, type ShopSurface, type ShopVariant, type ShopSaveRequest } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, rebaseShopDraft, publicKit, publicPhotoRow, publicPurchase, shopDraftDirty, toShopSaveRequest, type ShopPageDraft } from "@/lib/shop-editor/model";
import { confirmShopDraft, currentShopPhotos, kitNeedsPhoto, photoKey } from "./classic-shop-state";
import styles from "./ClassicShopPageEditor.module.css";

const KITS: ShopVariant[] = ["home", "away", "third"];
const LABELS: Record<ShopVariant, string> = { home: "Home kit", away: "Away kit", third: "Third kit" };
type Target = "copy" | "photos" | "cta" | "photoRows" | "purchase" | "fixed" | "kit";
type PendingSave = { request: ShopSaveRequest; draft: ShopPageDraft };
type Store = {
  snapshots: Partial<Record<ShopSurface, ShopSnapshot>>;
  drafts: Partial<Record<ShopSurface, ShopPageDraft>>;
  pending: Partial<Record<ShopSurface, PendingSave>>;
  conflicts: Partial<Record<ShopSurface, ShopSnapshot>>;
};
const emptyStore = (): Store => ({ snapshots: {}, drafts: {}, pending: {}, conflicts: {} });

export default function ClassicShopPageEditor() {
  const club = useClubContext();
  const [toastHost, setToastHost] = useState<HTMLElement | null>(null);
  return <AdminToastProvider portalTarget={toastHost}><ShopEditor key={club.id} setToastHost={setToastHost} /></AdminToastProvider>;
}

function ShopEditor({ setToastHost }: { setToastHost: (host: HTMLElement | null) => void }) {
  const { theme } = useAdminTheme();
  const presentation = useShopPresentation();
  const { club, shopPolicy: policy, generic, nameOnly } = presentation;
  const homeFeature = presentation.hasHomeFeature;
  const variants = generic ? KITS : KITS.filter((kit) => presentation.variants.includes(kit));
  const [surfaceChoice, setSurfaceChoice] = useState<ShopSurface>(policy?.initialSurface ?? "shop");
  const surface = homeFeature ? surfaceChoice : "shop";
  const [selected, setSelected] = useState<ShopVariant>("home");
  const variant = surface === "home" || !variants.includes(selected) ? "home" : selected;
  const [store, setStore] = useState<Store>(emptyStore);
  const current = useRef(store);
  const [target, setTarget] = useState<Target | null>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const editorSelection = useRef<Target>("copy");
  const [phone, setPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveBusy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replaceLatest, setReplaceLatest] = useState(false);
  const [work, setWork] = useState<Record<string, boolean>>({});
  const pendingWork = useRef<Record<string, boolean>>({});
  const pendingUndo = useRef<Record<string, boolean>>({});
  const undoWaiters = useRef(new Set<() => void>());
  const epoch = useRef(0);
  const pageToastHost = useRef<HTMLDivElement>(null);
  const [dialogToastHost, setDialogToastHost] = useState<HTMLDivElement | null>(null);
  const [photoDestination, setPhotoDestination] = useState<HTMLDivElement | null>(null);
  const active = useRef(true);
  const ownedUploads = useRef(new Map<string, ShopPhoto>());
  const cleanupInFlight = useRef(new Set<string>());
  const draft = store.drafts[surface];
  const kit = draft?.variants[variant];
  const conflict = store.conflicts[surface];
  const extras = generic && surface === "shop";
  const anyDirty = shopDraftDirty(store.drafts.home) || shopDraftDirty(store.drafts.shop);
  const anyPending = Boolean(store.pending.home || store.pending.shop);
  const working = Object.values(work).some(Boolean);

  function mutate(update: (store: Store) => Store) {
    const next = update(current.current);
    current.current = next;
    setStore(next);
  }
  function interact() { epoch.current++; }
  function openEditor(next: Target, opener?: HTMLElement) {
    editorSelection.current = next;
    editorOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setTarget(next);
  }
  function restoreEditorFocus() {
    if (editorOpener.current?.isConnected) return editorOpener.current;
    const frame = document.querySelector<HTMLIFrameElement>("iframe[title$='Shop page preview']");
    return frame?.contentDocument?.querySelector<HTMLElement>(`[data-shop-editor-target='${editorSelection.current}']`)
      ?? document.querySelector<HTMLButtonElement>("[data-admin-save-button]") ?? undefined;
  }
  function edit(pageSurface: ShopSurface, update: (draft: ShopPageDraft) => ShopPageDraft, clearError = true) {
    interact();
    mutate((state) => {
      const page = state.drafts[pageSurface];
      return page ? { ...state, drafts: { ...state.drafts, [pageSurface]: update(page) } } : state;
    });
    if (clearError) setError(null);
  }
  function sectionField<K extends keyof ShopSection>(field: K, value: ShopSection[K]) {
    edit(surface, (page) => ({ ...page,
      changedVariants: page.changedVariants.includes(variant) ? page.changedVariants : [...page.changedVariants, variant],
      variants: { ...page.variants, [variant]: { ...page.variants[variant], exists: true, section: { ...page.variants[variant].section, [field]: value } } },
    }));
  }
  function purchaseField(field: keyof ShopPageDraft["purchase"], value: string | ShopPageDraft["purchase"]["cards"]) {
    edit(surface, (page) => ({ ...page, purchase: { ...page.purchase, [field]: value }, purchaseChanged: true }));
  }
  function workChanged(key: string, pending: boolean) {
    pendingWork.current = { ...pendingWork.current, [key]: pending };
    setWork(pendingWork.current);
    if (pending) interact();
    else queueUploadCleanup();
  }
  function undoChanged(key: string, pending: boolean) {
    pendingUndo.current = { ...pendingUndo.current, [key]: pending };
    for (const resolve of undoWaiters.current) resolve();
    undoWaiters.current.clear();
    if (!pending) queueUploadCleanup();
  }
  function queueUploadCleanup() {
    queueMicrotask(() => { for (const photo of ownedUploads.current.values()) void cleanupPhoto(photo); });
  }

  useLayoutEffect(() => {
    active.current = true;
    const waiters = undoWaiters.current;
    return () => { active.current = false; for (const resolve of waiters) resolve(); waiters.clear(); };
  }, []);
  useEffect(() => { setPhone(window.matchMedia("(max-width: 639px)").matches); }, []);
  useLayoutEffect(() => {
    setToastHost(target ? dialogToastHost : pageToastHost.current);
  }, [target, dialogToastHost, setToastHost]);

  useEffect(() => {
    if (current.current.snapshots[surface]) return;
    const controller = new AbortController();
    setLoadError(null);
    void fetch(`/api/admin/shop?surface=${surface}`, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "Could not load this Shop page.");
        if (!controller.signal.aborted) mutate((state) => ({ ...state,
          snapshots: { ...state.snapshots, [surface]: result },
          drafts: state.drafts[surface] ? state.drafts : { ...state.drafts, [surface]: draftFromShopSnapshot(result) },
        }));
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : "Could not load this Shop page.");
      });
    return () => controller.abort();
  }, [surface]);

  async function cleanupPhoto(photo: ShopPhoto) {
    if (photo.rowId || !photo.assetId || !ownedUploads.current.has(photo.assetId) || cleanupInFlight.current.has(photo.assetId)) return;
    if (Object.values(pendingWork.current).some(Boolean) || Object.values(pendingUndo.current).some(Boolean)) return;
    const referenced = Object.values(current.current.drafts).some((page) => page && KITS.some((kitVariant) =>
      [...page.variants[kitVariant].photos, ...page.photoRows[kitVariant]].some((item) => item.assetId === photo.assetId)));
    const persisted = [...Object.values(current.current.snapshots), ...Object.values(current.current.conflicts)].some((snapshot) => snapshot
      && [...snapshot.photos, ...snapshot.photoRows].some((item) => item.assetId === photo.assetId));
    const submitted = Object.values(current.current.pending).some((transaction) => transaction && [
      ...KITS.flatMap((key) => [...transaction.draft.variants[key].photos, ...transaction.draft.photoRows[key]]),
      ...Object.values(transaction.request.variants).flatMap((kit) => kit?.photos ?? []),
      ...Object.values(transaction.request.photoRows ?? {}).flatMap((photos) => photos ?? []),
    ].some((item) => item.assetId === photo.assetId));
    if (referenced || persisted || submitted) return;
    cleanupInFlight.current.add(photo.assetId);
    try {
      const response = await fetch("/api/admin/media/cleanup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: photo.assetId }) }).catch(() => null);
      if (response?.ok) ownedUploads.current.delete(photo.assetId);
    } finally { cleanupInFlight.current.delete(photo.assetId); }
  }

  async function saveSurface(pageSurface: ShopSurface): Promise<boolean> {
    const page = current.current.drafts[pageSurface];
    const snapshot = current.current.snapshots[pageSurface];
    if (!page || !snapshot || current.current.conflicts[pageSurface]) return false;
    const pending = current.current.pending[pageSurface];
    if (!shopDraftDirty(page) && !pending) return true;
    const ownedVariants = pageSurface === "home" ? ["home"] as const : variants;
    const missing = ownedVariants.find((kitVariant) => kitNeedsPhoto(page, kitVariant));
    if (!pending && missing) {
      setSurfaceChoice(pageSurface); setSelected(missing);
      setError(`Add at least one photo to the ${LABELS[missing].toLowerCase()} before saving.`);
      return false;
    }
    const transaction = pending ?? { request: toShopSaveRequest(snapshot, page, crypto.randomUUID()), draft: structuredClone(page) };
    const parsed = shopSaveRequestSchema.safeParse(transaction.request);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the fields on this page."); return false; }
    mutate((state) => ({ ...state, pending: { ...state.pending, [pageSurface]: transaction } }));
    const result = await submitPageSave<ShopSnapshot>(() => fetch("/api/admin/shop", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(pending ? { "X-Editor-Recovery": "1" } : {}) },
      body: JSON.stringify(transaction.request),
    }), `/api/admin/shop?surface=${pageSurface}&operationId=${transaction.request.operationId}`);
    if (!active.current) return false;
    if (result.kind === "committed") {
      mutate((state) => ({ ...state,
        snapshots: { ...state.snapshots, [pageSurface]: result.snapshot },
        drafts: { ...state.drafts, [pageSurface]: confirmShopDraft(transaction.draft, state.drafts[pageSurface]!, result.snapshot) },
        pending: { ...state.pending, [pageSurface]: undefined },
      }));
      for (const photo of [...result.snapshot.photos, ...result.snapshot.photoRows]) {
        if (photo.assetId) ownedUploads.current.delete(photo.assetId);
      }
      for (const photo of ownedUploads.current.values()) void cleanupPhoto(photo);
      return true;
    }
    setSurfaceChoice(pageSurface);
    setError(result.message);
    if (result.kind === "unconfirmed") return false;
    mutate((state) => ({ ...state, pending: { ...state.pending, [pageSurface]: undefined } }));
    queueUploadCleanup();
    if (result.status === 409 && result.code === "CONTENT_CHANGED") {
      setTarget(null);
      try {
        const response = await fetch(`/api/admin/shop?surface=${pageSurface}`, { credentials: "same-origin", cache: "no-store" });
        const latest = await response.json();
        if (!response.ok) throw new Error();
        mutate((state) => ({ ...state, conflicts: { ...state.conflicts, [pageSurface]: latest } }));
      } catch { setError("The Shop page changed. Your draft is still here. Try Save again to load the latest version."); }
    }
    return false;
  }

  async function saveAll(): Promise<boolean> {
    if (saveBusy.current || Object.values(pendingWork.current).some(Boolean)) return false;
    saveBusy.current = true; setSaving(true); setError(null);
    try {
      while (active.current && Object.values(pendingUndo.current).some(Boolean)) {
        await new Promise<void>((resolve) => undoWaiters.current.add(resolve));
      }
      if (!active.current || Object.values(pendingWork.current).some(Boolean)) return false;
      const submittedEpoch = epoch.current;
      for (const pageSurface of ["shop", "home"] as const) {
        if ((shopDraftDirty(current.current.drafts[pageSurface]) || current.current.pending[pageSurface]) && !(await saveSurface(pageSurface))) return false;
      }
      const clean = submittedEpoch === epoch.current
        && !Object.values(pendingWork.current).some(Boolean)
        && !Object.values(current.current.drafts).some(shopDraftDirty)
        && !Object.values(current.current.pending).some(Boolean)
        && !Object.values(current.current.conflicts).some(Boolean);
      return clean;
    } finally { saveBusy.current = false; setSaving(false); }
  }

  const saveAction = useSaveState({
    isDirty: anyDirty || anyPending,
    onSave: async () => {
      if (!(await saveAll())) throw new Error("Shop changes are not all confirmed.");
    },
  });
  const saveFromPage = () => { void saveAction.save().catch(() => undefined); };

  const latestSave = useRef(saveAll);
  latestSave.current = saveAll;
  const saveForGuard = useCallback(() => latestSave.current(), []);
  useUnsavedGuard({
    dirty: anyDirty || anyPending || working || saving,
    edited: "your Shop kits and homepage shop feature",
    onSave: saveForGuard,
    onDiscard: async () => {
      if (saveBusy.current || Object.values(pendingWork.current).some(Boolean) || Object.values(current.current.pending).some(Boolean)) {
        throw new Error("Finish preparing photos and confirm the pending save before leaving.");
      }
      mutate((state) => ({ ...state, drafts: Object.fromEntries(Object.entries(state.snapshots).map(([key, snapshot]) => [key, draftFromShopSnapshot(snapshot)])), conflicts: {} }));
      for (const photo of ownedUploads.current.values()) await cleanupPhoto(photo);
    },
  });

  function resolveConflict(keep: boolean) {
    if (!conflict) return;
    mutate((state) => ({ ...state, snapshots: { ...state.snapshots, [surface]: conflict },
      drafts: { ...state.drafts, [surface]: keep ? rebaseShopDraft(state.drafts[surface]!, conflict) : draftFromShopSnapshot(conflict) },
      conflicts: { ...state.conflicts, [surface]: undefined },
    }));
    setReplaceLatest(false);
    setError(keep ? "Your draft is ready to save over the reviewed page." : null);
  }

  const content = useMemo(() => draft ? Object.fromEntries(KITS.map((key) => {
    const entry = draft.variants[key];
    const kitContent = publicKit(entry.section, entry.photos, surface, key);
    return [key, { section: entry.exists || entry.photos.length ? kitContent.section : null, photos: kitContent.photos }];
  })) as Record<ShopVariant, ReturnType<typeof publicKit>> : null, [draft, surface]);
  const selectedContent = content?.[variant];
  const title = target === "photos" ? "Kit photos" : target === "photoRows" ? "Shop photo row" : target === "purchase" ? "Purchase details" : target === "fixed" ? "Page copy" : "Kit text";
  const photoCollection = `${surface}-${variant}-${target === "photoRows" ? "strip" : "kit"}`;
  const shownPhotos = surface === "shop" ? policy?.shopPageShows?.photos : policy?.homeFeatureShows?.photos;

  return <AdminPage className={styles.page}>
    <AdminPageHeader eyebrow="Public website" title="Shop" description="Choose a kit, then tap what you want to edit."
      actions={<AdminSaveActions state={saving || working ? "saving" : saveAction.state} onSave={saveFromPage} stackOnMobile />} />
    {!club.storeEnabled && <p className={styles.banner}>{SHOP_OFF_BANNER} You can still prepare and save your kits here.</p>}
    {homeFeature && <div className={styles.surfaces} role="group" aria-label="Public page">
      <Button variant={surface === "shop" ? "default" : "outline"} aria-pressed={surface === "shop"} onClick={() => { setSurfaceChoice("shop"); setTarget(null); }}>Shop page{shopDraftDirty(store.drafts.shop) ? " •" : ""}</Button>
      <Button variant={surface === "home" ? "default" : "outline"} aria-pressed={surface === "home"} onClick={() => { setSurfaceChoice("home"); setTarget(null); }}>Homepage shop feature{shopDraftDirty(store.drafts.home) ? " •" : ""}</Button>
      {extras && <Button variant="outline" data-shop-photo-row-action="" onClick={(event) => openEditor("photoRows", event.currentTarget)}>Edit photo row</Button>}
    </div>}
    {presentation.sharedWithHomepage && <p className={styles.note}>Kit changes on this Shop page also update the homepage store teaser.</p>}
    {(error || loadError) && <p role="alert" className={styles.error}>{error ?? loadError}</p>}
    {anyPending && <p className={styles.note}>The last save is not confirmed. Retry the exact save before saving newer changes. <button type="button" disabled={saving || working || saveAction.state === "saving"} onClick={saveFromPage}>Retry exact save</button></p>}
    {conflict && <div role="region" aria-label="Review latest Shop page" className={styles.conflict}><p>Another editor saved this page. Your draft is still here. Latest kit: {conflict.sections.find((section) => section.kit_variant === variant)?.title || "Untitled"}.</p><div className={styles.surfaces}><Button variant="outline" onClick={() => resolveConflict(true)}>Keep my draft</Button><Button variant="outline" onClick={() => setReplaceLatest(true)}>Use latest saved page</Button></div></div>}
    {surface === "shop" && <AdminTabs tabsId="shop-kits" label="Edit kit" value={variant} onChange={(value) => { setSelected(value as ShopVariant); setTarget(null); }} items={variants.map((key) => ({ id: key, label: LABELS[key], badge: draft && kitNeedsPhoto(draft, key) ? "Needs a photo" : undefined }))} className={styles.tabs} />}
    <div id={`shop-kits-panel-${variant}`} role={surface === "shop" ? "tabpanel" : undefined} aria-labelledby={surface === "shop" ? `shop-kits-tab-${variant}` : undefined} className={styles.preview} aria-busy={!draft}>
      <div className={styles.previewHeader}><span>What visitors see</span><div className={styles.surfaces} role="group" aria-label="Kit editing tools">
        <Button variant="outline" className="min-h-11" disabled={!draft} onClick={(event) => openEditor("copy", event.currentTarget)}>Edit kit text</Button>
        <Button variant="outline" className="min-h-11" disabled={!draft} onClick={(event) => openEditor("photos", event.currentTarget)}>Edit kit photos</Button>
        <PreviewToggle value={phone ? "phone" : "desktop"} onChange={(value) => setPhone(value === "phone")} />
      </div></div>
      <div className={styles.canvas} data-shop-classic-canvas="">
        <ShopPreviewFrame classic loading={!draft} skeleton={<div className={"admin-theme admin-portal " + styles.loading} data-admin-theme={theme} role="status" aria-label="Loading Shop page"><Shimmer className="h-8 w-40" /><Shimmer className="mt-6 h-56 w-full" /><Shimmer className="mt-6 h-24 w-full" /></div>} host={`${club.primaryDomain}${surface === "shop" ? "/shop" : ""}`} phone={phone} onSelect={(value, opener) => openEditor(value as Target, opener)} invalidPhotos={draft ? kitNeedsPhoto(draft, variant) : false}>
          {!draft || !content || !selectedContent ? null : presentation.renderPreview(content, surface, setSelected, <div style={{ backgroundColor: "var(--color-white)" }}>
              {selectedContent.section ? <ShopKitSection section={selectedContent.section} photos={selectedContent.photos} headingTag={surface === "shop" ? "h1" : "h2"} animate={false} ctaHref={surface === "home" ? "/shop" : undefined} /> : <div data-shop-editor-target="copy" className="p-12 text-center text-slate-600">This kit is not set up yet. Add text and a photo to show it.</div>}
              {extras && draft.photoRows[variant].length > 0 && <ShopPhotoStrip photos={publicPhotoRow(draft.photoRows[variant], variant)} />}
              {extras && (hasShopPurchaseDetails(publicPurchase(draft.purchase)) ? <ShopPurchaseDetailsSection details={publicPurchase(draft.purchase)} animate={false} /> : <div data-shop-editor-target="purchase" className="p-8 text-center text-slate-600">No purchase details yet.</div>)}
            </div>, generic && !selectedContent.section ? <div data-shop-editor-target="photos" className="m-6 min-h-32 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">No photos yet.</div> : null)}
        </ShopPreviewFrame>
      </div>
    </div>
    {surface === "shop" && variants.filter((key) => key !== variant).map((key) => <div key={key} id={`shop-kits-panel-${key}`} role="tabpanel" aria-labelledby={`shop-kits-tab-${key}`} hidden />)}
    <div ref={pageToastHost} className={styles.pageToast} />
    <AdminDialog open={Boolean(target)} onClose={() => setTarget(null)} title={title} finalFocus={restoreEditorFocus} eyebrow={`${surface === "home" ? "Homepage shop feature" : "Shop page"} · ${LABELS[variant]}`} footer={<><div ref={setDialogToastHost} /><AdminDialogFooter primary={<Button type="button" data-primary="" onClick={() => setTarget(null)}>Done</Button>} /></>}>
      {target === "fixed" && <p className={styles.note}>This copy belongs to the website design and is managed by Onzio.</p>}
      {(target === "copy" || target === "kit" || target === "cta") && kit && <>
        {nameOnly && <p className={styles.note}>The Shop and homepage use this kit name and its first photo. Campaign copy, price, sizes, and checkout are managed by Onzio.</p>}
        {target !== "cta" && <AdminDialogSection title="Heading"><AdminDialogFields>
          {!nameOnly && <Field label="Small heading" value={kit.section.eyebrow} onChange={(value) => sectionField("eyebrow", value)} />}
          <Field label="Kit title" value={kit.section.title} onChange={(value) => sectionField("title", value)} />
          {!nameOnly && <Field area label="Description" value={kit.section.description} onChange={(value) => sectionField("description", value)} />}
        </AdminDialogFields></AdminDialogSection>}
        {!nameOnly && target !== "cta" && <AdminDialogSection title="Details"><AdminDialogFields>
          <Field area label="Bullet points, one per line" value={kit.section.bullet_points.join("\n")} onChange={(value) => sectionField("bullet_points", value.split("\n").slice(0, 8))} />
          <Field area label="Store information" value={kit.section.store_note} onChange={(value) => sectionField("store_note", value)} />
        </AdminDialogFields>{surface === "shop" && policy?.shopPageShows && <p className={styles.note}>Your Shop page shows the first {policy.shopPageShows.bullets} bullet points, split at the first colon into a label and value. Any more are saved but not shown.</p>}</AdminDialogSection>}
        {!nameOnly && <AdminDialogSection title="Button"><AdminDialogFields><Field label="Button text" value={kit.section.cta_label} onChange={(value) => sectionField("cta_label", value)} />
          {surface === "shop" && <Field label="Buy link" value={kit.section.cta_link} onChange={(value) => sectionField("cta_link", value)} />}
        </AdminDialogFields><p className={styles.note}>{surface === "home" ? "The button opens this club's Shop page." : "Use the full http or https address of your store, or an email address if supporters order by email."}</p></AdminDialogSection>}
      </>}
      {(target === "photos" || target === "photoRows") && <div ref={setPhotoDestination} />}
      {target === "photos" && shownPhotos && <p className={styles.note}>{surface === "shop" ? "Your Shop page" : "The homepage shop feature"} shows the first {shownPhotos} photos (front, then back). Any more are saved but not shown.</p>}
      {target === "photos" && draft && kitNeedsPhoto(draft, variant) && <p className={styles.photoWarning}>Add at least one photo before saving this kit.</p>}
      {target === "purchase" && extras && draft && <>
        <AdminDialogSection title="Section"><Field label="Section heading" value={draft.purchase.heading} onChange={(value) => purchaseField("heading", value)} /></AdminDialogSection>
        <AdminDialogSection title={`Detail cards · ${draft.purchase.cards.length} of 4`}>
          {draft.purchase.cards.map((card, index) => <div key={index} className={styles.card}><div className={styles.cardHeading}><span>Detail card {index + 1}</span><Button variant="ghost" aria-label={`Remove detail card ${index + 1}`} onClick={() => purchaseField("cards", draft.purchase.cards.filter((_, at) => at !== index))}>Remove</Button></div><AdminDialogFields>
            <Field label="Label" value={card.label} onChange={(value) => purchaseField("cards", draft.purchase.cards.map((item, at) => at === index ? { ...item, label: value } : item))} />
            <Field label="Title" value={card.title} onChange={(value) => purchaseField("cards", draft.purchase.cards.map((item, at) => at === index ? { ...item, title: value } : item))} />
            <Field area label="Text" value={card.body} onChange={(value) => purchaseField("cards", draft.purchase.cards.map((item, at) => at === index ? { ...item, body: value } : item))} />
          </AdminDialogFields></div>)}
          <Button variant="outline" disabled={draft.purchase.cards.length >= 4} onClick={() => purchaseField("cards", [...draft.purchase.cards, { label: "", title: "", body: "" }])}>Add detail card</Button>
        </AdminDialogSection>
        <AdminDialogSection title="Footer"><AdminDialogFields>
          <Field label="Footer label" value={draft.purchase.cta_eyebrow} onChange={(value) => purchaseField("cta_eyebrow", value)} />
          <Field area label="Footer text" value={draft.purchase.cta_text} onChange={(value) => purchaseField("cta_text", value)} />
          <Field label="Button text" value={draft.purchase.cta_label} onChange={(value) => purchaseField("cta_label", value)} />
          <Field label="Button link" value={draft.purchase.cta_link} onChange={(value) => purchaseField("cta_link", value)} />
        </AdminDialogFields></AdminDialogSection>
      </>}
    </AdminDialog>
    <AdminConfirmDialog open={replaceLatest} title="Use the latest saved page?" confirmLabel="Use latest saved page" onCancel={() => setReplaceLatest(false)} onConfirm={() => resolveConflict(false)}>Discard your Shop draft and use the latest saved page?</AdminConfirmDialog>
    {Object.entries(store.drafts).flatMap(([pageSurface, page]) => KITS.flatMap((kitVariant) => [false, true].map((strip) => {
      const key = `${pageSurface}-${kitVariant}-${strip ? "strip" : "kit"}`;
      return <PersistentPhotos key={key} collectionId={key} destination={target && photoCollection === key ? photoDestination : null} photos={strip ? page!.photoRows[kitVariant] : page!.variants[kitVariant].photos}
        onWork={(pending) => workChanged(key, pending)} onUndoWork={(pending) => undoChanged(key, pending)} onInteraction={interact}
        onAbandoned={(photos) => { for (const photo of photos) void cleanupPhoto(photo); }}
        onChange={(photos) => edit(pageSurface as ShopSurface, (latest) => {
          const receipt = current.current.snapshots[pageSurface as ShopSurface];
          const confirmed = (strip ? receipt?.photoRows : receipt?.photos)?.filter((photo) => photo.kit_variant === kitVariant) ?? [];
          const currentPhotos = currentShopPhotos(photos, confirmed);
          return strip ? { ...latest, photoRows: { ...latest.photoRows, [kitVariant]: currentPhotos }, changedRows: latest.changedRows.includes(kitVariant) ? latest.changedRows : [...latest.changedRows, kitVariant] }
            : { ...latest, variants: { ...latest.variants, [kitVariant]: { ...latest.variants[kitVariant], exists: true, photos: currentPhotos } }, changedVariants: latest.changedVariants.includes(kitVariant) ? latest.changedVariants : [...latest.changedVariants, kitVariant] };
        }, !pendingWork.current[key])}
        onUpload={async (files) => {
          setError(null);
          const uploaded: ShopPhoto[] = [];
          try {
            const storage = createClient().storage.from("shop");
            for (const file of files) {
              if (!active.current) break;
              const path = `${strip ? "photo-strip" : "kit"}/${pageSurface}-${kitVariant}/${crypto.randomUUID()}-${file.name}`;
              const { data, error: uploadError } = await storage.upload(path, file);
              if (uploadError || !data) throw new Error(uploadError?.message ?? "Upload failed.");
              const { data: url } = storage.getPublicUrl(path);
              const photo = { rowId: null, assetId: data.assetId, url: url.publicUrl, order: uploaded.length };
              ownedUploads.current.set(data.assetId, photo);
              uploaded.push(photo);
            }
          } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
          return uploaded;
        }} />;
    })))}
  </AdminPage>;
}

function Field({ label, value, onChange, area = false }: { label: string; value: string; onChange: (value: string) => void; area?: boolean }) {
  const id = useId();
  return <label htmlFor={id} className={styles.field}><span id={`${id}-label`}>{label}</span>{area ? <textarea id={id} aria-labelledby={`${id}-label`} rows={3} value={value} onChange={(event) => onChange(event.target.value)} /> : <input id={id} aria-labelledby={`${id}-label`} value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function PersistentPhotos({ collectionId, destination, photos, onChange, onUpload, onWork, onUndoWork, onInteraction, onAbandoned }: {
  collectionId: string; destination: HTMLElement | null; photos: ShopPhoto[];
  onChange: (photos: ShopPhoto[]) => void; onUpload: (files: File[]) => Promise<ShopPhoto[]>;
  onWork: (pending: boolean) => void; onUndoWork: (pending: boolean) => void; onInteraction: () => void;
  onAbandoned: (photos: ShopPhoto[]) => void;
}) {
  const parking = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const known = useRef(new Map<string, ShopPhoto>());
  for (const photo of photos) known.current.set(photoKey(photo), photo);
  useLayoutEffect(() => { const node = document.createElement("div"); node.className = styles.photoHost; setHost(node); return () => node.remove(); }, []);
  useLayoutEffect(() => { if (host) (destination ?? parking.current)?.appendChild(host); }, [host, destination]);
  const items: AdminPhoto[] = photos.map((photo) => ({ id: photoKey(photo), url: photo.url, description: "" }));
  return <><div ref={parking} hidden />{host && createPortal(<AdminPhotoManager label={collectionId.endsWith("strip") ? "Shop photo row" : "Kit photos"} collectionId={collectionId} variant="tiles" photos={items}
    allowedTypes={["image/jpeg", "image/png", "image/webp"]} maxBytes={15 * 1024 * 1024}
    onDirty={onInteraction} onPendingChange={onWork} onUndoPendingChange={onUndoWork} showDescriptions={false} removalMessage="Photo removed" reorderLabels="earlier-later"
    onChange={(next) => onChange(next.map((photo, order) => ({ ...known.current.get(photo.id)!, order })))}
    onAbandonedUpload={(added) => onAbandoned(added.map((photo) => known.current.get(photo.id)!))}
    onUpload={async (files) => { const added = await onUpload(files); for (const photo of added) known.current.set(photoKey(photo), photo); return added.map((photo) => ({ id: photoKey(photo), url: photo.url, description: "" })); }}
  />, host)}</>;
}
