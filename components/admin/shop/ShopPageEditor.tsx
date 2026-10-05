"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AcademyHomeShopFeature from "@/components/AcademyHomeShopFeature";
import AcademyShopPage from "@/components/AcademyShopPage";
import ClubhouseShopPage from "@/components/ClubhouseShopPage";
import EditorialShopPage from "@/components/editorial/EditorialShopPage";
import EditorialShell from "@/components/editorial/EditorialShell";
import TemplateFontScope from "@/components/TemplateFontScope";
import ShopKitSectionContainer from "@/components/ShopKitSectionContainer";
import ShopPhotoStrip from "@/components/ShopPhotoStrip";
import ShopPurchaseDetailsSection from "@/components/ShopPurchaseDetailsSection";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import FileUpload from "@/components/admin/FileUpload";
import ResilientImage from "@/components/ResilientImage";
import ShopPreviewFrame from "./ShopPreviewFrame";
import PageEditorInspector from "@/components/admin/PageEditorInspector";
import { submitPageSave } from "@/lib/page-editor-save";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
import type { ShopKitContent } from "@/lib/queries";
import { hasShopPurchaseDetails } from "@/lib/shop-purchase-details";
import { shopSaveRequestSchema, type ShopPhoto, type ShopSection, type ShopSnapshot, type ShopSurface, type ShopVariant } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, rebaseShopDraft, publicKit, publicPhotoRow, publicPurchase, SHOP_VARIANTS, shopDraftDirty, toShopSaveRequest, type ShopPageDraft } from "@/lib/shop-editor/model";
import "@/styles/editorial.css";

const KIT_LABELS: Record<ShopVariant, string> = { home: "Home kit", third: "Third kit", away: "Away kit" };
type Target = "copy" | "photos" | "cta" | "photoRows" | "purchase" | "fixed" | "kit";

function allKitContent(draft: ShopPageDraft, surface: ShopSurface): Record<ShopVariant, ShopKitContent> {
  return Object.fromEntries(SHOP_VARIANTS.map((variant) => {
    const kit = draft.variants[variant];
    const content = publicKit(kit.section, kit.photos, surface, variant);
    return [variant, { section: kit.exists || kit.photos.length > 0 ? content.section : null, photos: content.photos }];
  })) as Record<ShopVariant, ShopKitContent>;
}

function markVariant(draft: ShopPageDraft, variant: ShopVariant): ShopPageDraft {
  return { ...draft, changedVariants: draft.changedVariants.includes(variant) ? draft.changedVariants : [...draft.changedVariants, variant] };
}

function markRow(draft: ShopPageDraft, variant: ShopVariant): ShopPageDraft {
  return { ...draft, changedRows: draft.changedRows.includes(variant) ? draft.changedRows : [...draft.changedRows, variant] };
}

function orderPhotos(photos: ShopPhoto[]): ShopPhoto[] {
  return photos.map((photo, order) => ({ ...photo, order }));
}

export default function ShopPageEditor() {
  const club = useClubContext();
  const template = club.presentationTemplateKey;
  const isAcademy = template === "academy@1";
  const isClubhouse = template === "clubhouse@1";
  const isEditorial = template === "editorial@1";
  const storeUnavailable = isEditorial && !club.storeEnabled;
  const sharedWithHomepage = isClubhouse || isEditorial;
  const generic = !isAcademy && !isClubhouse && !isEditorial;
  const hasHomeFeature = !sharedWithHomepage;
  const variants: ShopVariant[] = isAcademy ? ["home"] : sharedWithHomepage ? SHOP_VARIANTS : ["home", "away"];

  const [surfaceChoice, setSurfaceChoice] = useState<ShopSurface>("shop");
  const surface: ShopSurface = hasHomeFeature ? surfaceChoice : "shop";
  const [snapshots, setSnapshots] = useState<Partial<Record<ShopSurface, ShopSnapshot>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ShopSurface, ShopPageDraft>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ShopVariant>("home");
  const [target, setTarget] = useState<Target | null>(null);
  const [phone, setPhone] = useState(false);
  const saveInFlight = useRef(false);
  const [conflicts, setConflicts] = useState<Partial<Record<ShopSurface, ShopSnapshot>>>({});
  const [pendingSaves, setPendingSaves] = useState<Partial<Record<ShopSurface, ReturnType<typeof toShopSaveRequest>>>>({});

  useEffect(() => {
    // Match the physical viewport after hydration. The server and first client
    // render agree, and later manual Desktop/Phone choices remain untouched.
    setPhone(window.matchMedia("(max-width: 639px)").matches);
  }, []);

  const snapshot = snapshots[surface];
  const draft = drafts[surface];
  const currentVariant: ShopVariant = surface === "home" || !variants.includes(selectedVariant) ? "home" : selectedVariant;
  const currentKit = draft?.variants[currentVariant];
  const dirty = shopDraftDirty(draft);
  const locked = saving || Boolean(pendingSaves[surface]);
  const conflict = conflicts[surface];
  const anyDirty = shopDraftDirty(drafts.home) || shopDraftDirty(drafts.shop);

  useEffect(() => {
    if (!anyDirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [anyDirty]);

  useEffect(() => {
    setSnapshots({}); setDrafts({}); setPendingSaves({}); setConflicts({}); setTarget(null); setLoadError(null); setSaveError(null);
  }, [club.id]);

  useEffect(() => {
    if (storeUnavailable) return;
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
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load this Shop page.");
      });
    return () => controller.abort();
  }, [surface, snapshots, storeUnavailable]);

  function editDraft(update: (draft: ShopPageDraft) => ShopPageDraft) {
    if (saveInFlight.current || pendingSaves[surface]) return;
    setDrafts((current) => {
      const page = current[surface];
      return page ? { ...current, [surface]: update(page) } : current;
    });
    setSaved(false);
    setSaveError(null);
  }

  function setSectionField<K extends keyof ShopSection>(field: K, value: ShopSection[K]) {
    editDraft((page) => {
      const kit = page.variants[currentVariant];
      return markVariant({ ...page, variants: { ...page.variants, [currentVariant]: {
        ...kit, exists: true, section: { ...kit.section, [field]: value },
      } } }, currentVariant);
    });
  }

  function setKitPhotos(photos: ShopPhoto[]) {
    editDraft((page) => markVariant({ ...page, variants: { ...page.variants, [currentVariant]: {
      ...page.variants[currentVariant], exists: true, photos: orderPhotos(photos),
    } } }, currentVariant));
  }

  function setRowPhotos(photos: ShopPhoto[]) {
    editDraft((page) => markRow({ ...page, photoRows: { ...page.photoRows, [currentVariant]: orderPhotos(photos) } }, currentVariant));
  }

  async function uploadPhotos(files: FileList | null, strip: boolean) {
    if (!files?.length || !draft || saveInFlight.current || pendingSaves[surface]) return;
    const current = strip ? draft.photoRows[currentVariant] : draft.variants[currentVariant].photos;
    const allowed = Array.from(files).slice(0, Math.max(0, 6 - current.length));
    if (!allowed.length) return;
    setUploading(true); setSaveError(null);
    const uploaded: ShopPhoto[] = [];
    try {
      const client = createClient();
      for (const file of allowed) {
        const path = `${strip ? "photo-strip" : "kit"}/${surface}-${currentVariant}/${crypto.randomUUID()}-${file.name}`;
        const { data, error } = await client.storage.from("shop").upload(path, file);
        if (error || !data) throw new Error(error?.message ?? "Upload failed.");
        const { data: urlResult, error: urlError } = client.storage.from("shop").getPublicUrl(path);
        if (urlError || !urlResult.publicUrl) throw new Error(urlError?.message ?? "Could not prepare the photo.");
        uploaded.push({ rowId: null, assetId: data.assetId, url: urlResult.publicUrl, order: current.length + uploaded.length });
        // Keep each completed upload in the draft if a later file fails.
        if (strip) setRowPhotos([...current, ...uploaded]);
        else setKitPhotos([...current, ...uploaded]);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Upload failed.");
    } finally { setUploading(false); }
  }

  async function removePhoto(photo: ShopPhoto, strip: boolean) {
    if (saveInFlight.current || pendingSaves[surface]) return;
    const current = strip ? draft?.photoRows[currentVariant] : draft?.variants[currentVariant].photos;
    if (!current) return;
    const next = current.filter((item) => item !== photo);
    if (strip) setRowPhotos(next); else setKitPhotos(next);
    if (photo.rowId === null && photo.assetId) {
      // A staged upload with no page reference can be retired immediately.
      await fetch("/api/admin/media/cleanup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: photo.assetId }) }).catch(() => undefined);
    }
  }

  function updatePurchase(field: keyof ShopPageDraft["purchase"], value: string | ShopPageDraft["purchase"]["cards"]) {
    editDraft((page) => ({ ...page, purchase: { ...page.purchase, [field]: value }, purchaseChanged: true }));
  }

  async function savePage() {
    if (!draft || !snapshot || (!dirty && !pendingSaves[surface]) || saveInFlight.current || uploading || conflict) return;
    const request = pendingSaves[surface] ?? toShopSaveRequest(snapshot, draft, crypto.randomUUID());
    const parsed = shopSaveRequestSchema.safeParse(request);
    if (!parsed.success) { setSaveError(parsed.error.issues[0]?.message ?? "Check the fields on this page."); return; }
    saveInFlight.current = true;
    setSaving(true); setSaveError(null); setSaved(false); setPendingSaves((current) => ({ ...current, [surface]: request }));
    try {
      const result = await submitPageSave<ShopSnapshot>(() => fetch("/api/admin/shop", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }), `/api/admin/shop?surface=${surface}&operationId=${request.operationId}`);
      if (result.kind === "committed") {
        setSnapshots((current) => ({ ...current, [surface]: result.snapshot }));
        setDrafts((current) => ({ ...current, [surface]: draftFromShopSnapshot(result.snapshot) }));
        setPendingSaves((current) => ({ ...current, [surface]: undefined })); setSaved(true);
      } else if (result.kind === "unconfirmed") setSaveError(result.message);
      else {
        setPendingSaves((current) => ({ ...current, [surface]: undefined }));
        setSaveError(result.message);
        if (result.status === 409 && result.code === "CONTENT_CHANGED") {
          setTarget(null);
          try {
            const response = await fetch(`/api/admin/shop?surface=${surface}`, { credentials: "same-origin", cache: "no-store" });
            const latest = await response.json();
            if (!response.ok) throw new Error("Could not load the latest Shop page.");
            setConflicts((current) => ({ ...current, [surface]: latest as ShopSnapshot }));
          } catch { setSaveError("The Shop page changed. Your draft is still here. Try Save again to load the latest version."); }
        }
      }
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  function resolveConflict(keepDraft: boolean) {
    if (!conflict) return;
    if (!keepDraft && !window.confirm("Discard your Shop draft and use the latest saved page?")) return;
    setSnapshots((current) => ({ ...current, [surface]: conflict }));
    setDrafts((current) => ({ ...current, [surface]: keepDraft && current[surface] ? rebaseShopDraft(current[surface], conflict) : draftFromShopSnapshot(conflict) }));
    setConflicts((current) => ({ ...current, [surface]: undefined }));
    setSaveError(keepDraft ? "Your draft is ready to save over the reviewed page." : null);
  }

  const content = useMemo(() => draft ? allKitContent(draft, surface) : null, [draft, surface]);
  const showExtras = generic && surface === "shop";

  if (storeUnavailable) {
    return <AdminPage className="min-w-0">
      <AdminPageHeader eyebrow="Public website" title="Shop" description="This Shop page is not currently visible on your website." />
      <AdminPanel className="mt-5 p-6 text-sm text-muted-foreground">
        Onzio manages store availability for this website design. Once the store is enabled, its public page can be edited here.
      </AdminPanel>
    </AdminPage>;
  }

  return (
    <AdminPage className="min-w-0">
      <AdminPageHeader eyebrow="Public website" title="Shop" description="Choose a public page, then tap what you want to edit." />
      <div className="mt-5 space-y-4">
        <AdminPanel className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="Public page">
            <button type="button" aria-current={surface === "shop" ? "page" : undefined} disabled={saving} onClick={() => { setSurfaceChoice("shop"); setTarget(null); }} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${surface === "shop" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>Shop page {shopDraftDirty(drafts.shop) ? "•" : ""}</button>
            {hasHomeFeature && <button type="button" aria-current={surface === "home" ? "page" : undefined} disabled={saving} onClick={() => { setSurfaceChoice("home"); setTarget(null); setSelectedVariant("home"); }} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${surface === "home" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>Homepage shop feature {shopDraftDirty(drafts.home) ? "•" : ""}</button>}
          </div>
          <button type="button" disabled={(!dirty && !pendingSaves[surface]) || saving || uploading || !snapshot || Boolean(conflict)} onClick={() => void savePage()} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : uploading ? "Uploading…" : pendingSaves[surface] ? "Confirm save" : "Save page"}</button>
        </AdminPanel>
        {sharedWithHomepage && <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Kit changes on this Shop page also update the homepage store teaser.</p>}
        {saved && <p role="status" className="text-sm font-medium text-green-700">This page was saved.</p>}
        {(saveError || loadError) && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError ?? loadError}</p>}
        {conflict && <div role="region" aria-label="Review latest Shop page" className="rounded-lg border border-border bg-card p-4 text-sm"><p>Another editor saved this page. Your draft is still here. Latest kit: {conflict.sections.find((section) => section.kit_variant === currentVariant)?.title || "Untitled"}.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => resolveConflict(true)}>Keep my draft</button><button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => resolveConflict(false)}>Use latest saved page</button></div></div>}
        {!draft || !snapshot || !content ? <AdminPanel className="p-8 text-center text-sm text-muted-foreground">Loading the public page…</AdminPanel> : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{surface === "shop" ? "Shop page" : "Homepage shop feature"}</p>
                  <p className="text-xs text-muted-foreground">{surface === "shop" ? "/shop" : "/"} · Changes appear publicly after Save</p>
                </div>
                <div className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Preview size">
                  <button type="button" aria-pressed={!phone} onClick={() => setPhone(false)} className={`min-h-10 rounded-md px-3 text-xs font-semibold ${!phone ? "bg-background shadow-sm" : ""}`}>Desktop</button>
                  <button type="button" aria-pressed={phone} onClick={() => setPhone(true)} className={`min-h-10 rounded-md px-3 text-xs font-semibold ${phone ? "bg-background shadow-sm" : ""}`}>Phone</button>
                </div>
              </div>
              {surface === "shop" && variants.length > 1 && <div className="flex flex-wrap items-center gap-2" aria-label="Edit kit">
                <span className="text-xs font-medium text-muted-foreground">Kit</span>
                {variants.map((variant) => <button key={variant} type="button" aria-pressed={currentVariant === variant} onClick={() => { setSelectedVariant(variant); setTarget("copy"); }} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold ${currentVariant === variant ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{KIT_LABELS[variant]}{draft.changedVariants.includes(variant) ? " •" : ""}</button>)}
              </div>}
              <div className="flex flex-wrap gap-2" aria-label="Page editing tools">
                <ToolButton label="Edit kit text" onClick={() => setTarget("copy")} />
                <ToolButton label="Edit kit photos" onClick={() => setTarget("photos")} />
                {showExtras && <><ToolButton label="Edit photo row" onClick={() => setTarget("photoRows")} /><ToolButton label="Edit purchase details" onClick={() => setTarget("purchase")} /></>}
              </div>
              <ShopPreviewFrame host={`${club.primaryDomain}${surface === "shop" ? "/shop" : ""}`} phone={phone} onSelect={(selection) => setTarget(selection as Target)}>
                {isEditorial ? <EditorialShell editing>
                  <EditorialShopPage editorContent={content} selectedEditorVariant={currentVariant} onEditorSelectKit={(variant) => { setSelectedVariant(variant); setTarget("copy"); }} />
                  {!content[currentVariant].photos.length && <button type="button" data-shop-editor-target="photos" className="m-4 min-h-24 w-[calc(100%-2rem)] rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Add a kit photo to show this product.</button>}
                </EditorialShell> : <TemplateFontScope templateKey={template}>
                  {isAcademy ? surface === "shop" ? <AcademyShopPage editorContent={content.home} /> : <AcademyHomeShopFeature editorContent={content.home} /> : null}
                  {isClubhouse && <ClubhouseShopPage editorContent={content} onEditorSelectKit={setSelectedVariant} />}
                  {generic && <>
                    <div className={surface === "shop" ? "pt-24 sm:pt-28" : ""} style={{ backgroundColor: "var(--color-white)" }}>
                      <ShopKitSectionContainer surface={surface} headingTag={surface === "shop" ? "h1" : "h2"} fadeImageToWhite editorContent={content} selectedVariant={currentVariant} onVariantChange={(variant) => { setSelectedVariant(variant); setTarget("copy"); }} />
                      {showExtras && draft.photoRows[currentVariant].length > 0 && <ShopPhotoStrip photos={publicPhotoRow(draft.photoRows[currentVariant], currentVariant)} />}
                      {showExtras && hasShopPurchaseDetails(publicPurchase(draft.purchase)) && <ShopPurchaseDetailsSection details={publicPurchase(draft.purchase)} animate={false} />}
                    </div>
                  </>}
                  {!content[currentVariant].photos.length && <button type="button" data-shop-editor-target="photos" className="m-4 min-h-24 w-[calc(100%-2rem)] rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Add a kit photo to show this product.</button>}
                </TemplateFontScope>}
              </ShopPreviewFrame>
            </div>
            <PageEditorInspector open={Boolean(target)} onClose={() => setTarget(null)} label="Selected Shop section tools" breakpoint={1279} className={`min-w-0 ${target ? "rounded-t-2xl border border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl xl:sticky xl:top-24 xl:max-h-[calc(100svh-7rem)] xl:rounded-xl xl:p-4 xl:shadow-none" : "hidden xl:block"}`}>
              {target ? <>
                <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{target === "photos" ? "Kit photos" : target === "photoRows" ? "Shop photo row" : target === "purchase" ? "Purchase details" : target === "fixed" ? "Page copy" : target === "cta" ? "Button" : "Kit details"}</h2><p className="text-xs text-muted-foreground">{surface === "shop" ? "Shop page" : "Homepage shop feature"} · {KIT_LABELS[currentVariant]}</p></div><button type="button" onClick={() => setTarget(null)} className="min-h-11 rounded-lg border border-border px-3 text-sm">Done</button></div>
                <fieldset disabled={locked} className="min-w-0">
                {target === "fixed" ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">This copy belongs to the website design and is managed by Onzio.</p> : null}
                {(target === "copy" || target === "kit" || target === "cta") && currentKit && <>
                  {isClubhouse ? <p className="mb-3 text-xs text-muted-foreground">The Shop and homepage use this kit name and its first photo. Campaign copy, price, sizes, and checkout are managed by Onzio.</p> : isEditorial ? <p className="mb-3 text-xs text-muted-foreground">The Shop and homepage use this kit. The page introduction and button text are managed by Onzio.</p> : null}
                  {target !== "cta" && <div className="space-y-3">
                    {!isClubhouse && !isEditorial && <TextField label="Small heading" value={currentKit.section.eyebrow} onChange={(value) => setSectionField("eyebrow", value)} />}
                    <TextField label="Kit title" value={currentKit.section.title} onChange={(value) => setSectionField("title", value)} />
                    {!isClubhouse && <TextAreaField label="Description" value={currentKit.section.description} onChange={(value) => setSectionField("description", value)} />}
                    {!isClubhouse && !isEditorial && <>
                      <TextAreaField label="Bullet points, one per line" value={currentKit.section.bullet_points.join("\n")} onChange={(value) => setSectionField("bullet_points", value.split("\n").slice(0, 8))} />
                      <TextAreaField label="Store information" value={currentKit.section.store_note} onChange={(value) => setSectionField("store_note", value)} />
                    </>}
                  </div>}
                  {!isClubhouse && <div className="mt-4 space-y-3 border-t border-border pt-4">
                    {!isEditorial && <TextField label="Button text" value={currentKit.section.cta_label} onChange={(value) => setSectionField("cta_label", value)} />}
                    {surface === "home" ? <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">The homepage button opens this club’s Shop page.</p> : <TextField label="Purchase website" type="url" value={currentKit.section.cta_link} onChange={(value) => setSectionField("cta_link", value)} help="Use the full https:// address from your store or merchandise partner." />}
                  </div>}
                </>}
                {target === "photos" && currentKit && <PhotoEditor photos={currentKit.photos} label="kit" uploading={uploading} onUpload={(files) => void uploadPhotos(files, false)} onRemove={(photo) => void removePhoto(photo, false)} onChange={setKitPhotos} />}
                {target === "photoRows" && showExtras && <PhotoEditor photos={draft.photoRows[currentVariant]} label="photo row" uploading={uploading} onUpload={(files) => void uploadPhotos(files, true)} onRemove={(photo) => void removePhoto(photo, true)} onChange={setRowPhotos} />}
                {target === "purchase" && showExtras && <div className="space-y-3">
                  <TextField label="Section heading" value={draft.purchase.heading} onChange={(value) => updatePurchase("heading", value)} />
                  {draft.purchase.cards.map((card, index) => <div key={index} className="space-y-2 rounded-lg border border-border p-3"><p className="text-xs font-semibold">Detail card {index + 1}</p>{(["label", "title", "body"] as const).map((field) => <TextField key={field} label={field === "body" ? "Body" : field === "title" ? "Title" : "Label"} value={card[field]} onChange={(value) => updatePurchase("cards", draft.purchase.cards.map((item, i) => i === index ? { ...item, [field]: value } : item))} />)}<button type="button" className="min-h-11 text-xs font-semibold text-destructive" onClick={() => updatePurchase("cards", draft.purchase.cards.filter((_, i) => i !== index))}>Remove card</button></div>)}
                  {draft.purchase.cards.length < 4 && <ToolButton label="Add detail card" onClick={() => updatePurchase("cards", [...draft.purchase.cards, { label: "", title: "", body: "" }])} />}
                  <TextField label="Footer label" value={draft.purchase.cta_eyebrow} onChange={(value) => updatePurchase("cta_eyebrow", value)} />
                  <TextAreaField label="Footer text" value={draft.purchase.cta_text} onChange={(value) => updatePurchase("cta_text", value)} />
                  <TextField label="Button text" value={draft.purchase.cta_label} onChange={(value) => updatePurchase("cta_label", value)} />
                  <TextField label="Button link" type="url" value={draft.purchase.cta_link} onChange={(value) => updatePurchase("cta_link", value)} />
                </div>}
                </fieldset>
                {saveError && <p role="alert" className="mt-3 text-sm text-destructive">{saveError}</p>}
                <button type="button" disabled={(!dirty && !pendingSaves[surface]) || saving || uploading || Boolean(conflict)} onClick={() => void savePage()} className="mt-5 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : pendingSaves[surface] ? "Confirm save" : "Save page"}</button>
              </> : <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Tap a section in the public page to edit it.</div>}
            </PageEditorInspector>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

function ToolButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="min-h-11 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted">{label}</button>;
}

function TextField({ label, value, onChange, type = "text", help }: { label: string; value: string; onChange: (value: string) => void; type?: string; help?: string }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={`${ADMIN_INPUT_CLASS} mt-1 min-h-11 w-full text-base`} />{help && <span className="mt-1 block text-xs text-muted-foreground">{help}</span>}</label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className={`${ADMIN_INPUT_CLASS} mt-1 min-h-24 w-full text-base`} /></label>;
}

function PhotoEditor({ photos, label, uploading, onUpload, onRemove, onChange }: {
  photos: ShopPhoto[]; label: string; uploading: boolean;
  onUpload: (files: FileList | null) => void; onRemove: (photo: ShopPhoto) => void; onChange: (photos: ShopPhoto[]) => void;
}) {
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{photos.length}/6 photos. Use the arrows to set the order shown to visitors.</p>
    {photos.map((photo, index) => <div key={photo.rowId ?? photo.assetId ?? index} className="flex items-center gap-2 rounded-lg border border-border p-2">
      <ResilientImage src={photo.url} alt={`${label} ${index + 1}`} width={56} height={56} className="h-14 w-14 rounded-md object-cover" />
      <span className="flex-1 text-xs">Photo {index + 1}</span>
      <button type="button" aria-label={`Move ${label} photo ${index + 1} up`} disabled={uploading || index === 0} onClick={() => { const next = [...photos]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(orderPhotos(next)); }} className="min-h-11 min-w-11 rounded-md border border-border disabled:opacity-40">↑</button>
      <button type="button" aria-label={`Move ${label} photo ${index + 1} down`} disabled={uploading || index === photos.length - 1} onClick={() => { const next = [...photos]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(orderPhotos(next)); }} className="min-h-11 min-w-11 rounded-md border border-border disabled:opacity-40">↓</button>
      <button type="button" aria-label={`Remove ${label} photo ${index + 1}`} disabled={uploading} onClick={() => onRemove(photo)} className="min-h-11 min-w-11 rounded-md bg-destructive font-bold text-destructive-foreground disabled:opacity-40">×</button>
    </div>)}
    <FileUpload label={`Add ${label} photos`} accept="image/*" multiple onUpload={onUpload} uploading={uploading} disabled={photos.length >= 6} />
    {label === "kit" && photos.length === 0 && <p className="text-xs text-destructive">Add at least one photo before saving this kit.</p>}
  </div>;
}
