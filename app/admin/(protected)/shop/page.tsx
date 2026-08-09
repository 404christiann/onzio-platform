"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import ScaledShopKitPreview from "@/components/admin/ScaledShopKitPreview";
import ScaledShopPhotoStripPreview from "@/components/admin/ScaledShopPhotoStripPreview";
import ScaledShopPurchaseDetailsPreview from "@/components/admin/ScaledShopPurchaseDetailsPreview";
import type {
  DBShopCarouselPhoto,
  DBShopKitPhoto,
  DBShopKitSection,
  DBShopPurchaseDetails,
  ShopPurchaseDetailCard,
  ShopKitSurface,
  ShopKitVariant,
} from "@/lib/db-types";
import {
  fetchShopCarouselPhotos,
  fetchShopKitContent,
  fetchShopPurchaseDetails,
} from "@/lib/queries";
import {
  canAddKitPhoto,
  cleanKitBulletPoints,
  DEFAULT_KIT_BULLET_POINTS,
  DEFAULT_KIT_STORE_NOTE,
  diffShopKitPhotos,
  MAX_KIT_BULLET_POINTS,
  MAX_KIT_PHOTOS,
  shopKitSectionId,
  type DraftKitPhoto,
} from "@/lib/shop-kit";
import {
  canAddPhotoStripPhoto,
  diffPhotoStripPhotos,
  MAX_PHOTO_STRIP_PHOTOS,
  type DraftPhotoStripPhoto,
} from "@/lib/shop-photo-strip";
import {
  DEFAULT_SHOP_PURCHASE_DETAILS,
  MAX_PURCHASE_DETAIL_CARDS,
  normalizePurchaseDetailCards,
  normalizeShopPurchaseDetails,
} from "@/lib/shop-purchase-details";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { createClient } from "@/lib/admin-client";

type SectionFields = {
  eyebrow: string;
  title: string;
  description: string;
  bullet_points: DraftBulletPoint[];
  store_note: string;
  cta_label: string;
  cta_link: string;
};

type TextSectionField = Exclude<keyof SectionFields, "bullet_points">;

type DraftBulletPoint = {
  id: string;
  text: string;
};

let bulletPointId = 0;

function createDraftBulletPoints(points: readonly string[]): DraftBulletPoint[] {
  return points.map((text) => ({
    id: `bullet-point-${bulletPointId++}`,
    text,
  }));
}

const EMPTY_FIELDS: SectionFields = {
  eyebrow: "",
  title: "",
  description: "",
  bullet_points: createDraftBulletPoints(DEFAULT_KIT_BULLET_POINTS),
  store_note: DEFAULT_KIT_STORE_NOTE,
  cta_label: "",
  cta_link: "",
};

function sectionToFields(section: DBShopKitSection): SectionFields {
  return {
    eyebrow: section.eyebrow,
    title: section.title,
    description: section.description,
    bullet_points: createDraftBulletPoints(section.bullet_points),
    store_note: section.store_note,
    cta_label: section.cta_label,
    cta_link: section.cta_link,
  };
}

async function uploadPhoto(file: File, bucket: string, folder: string): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

type AdminTab = "content" | "kit" | "photoStrip" | "purchase";
type PurchaseTextField = Exclude<
  keyof DBShopPurchaseDetails,
  "id" | "cards" | "updated_at"
>;
type PurchaseCardTextField = keyof ShopPurchaseDetailCard;

const KIT_VARIANTS: Array<{ id: ShopKitVariant; label: string }> = [
  { id: "home", label: "Home Kit" },
  { id: "third", label: "Third Kit" },
  { id: "away", label: "Away Kit" },
];

export default function AdminShopPage() {
  const clubId = useClubId();
  const club = useClubContext();
  // /shop renders AcademyShopPage for academy@1, which has no photo strip and
  // no purchase-details cards. Both tabs edited content that could never appear
  // on this club's shop page. Rose City (clubhouse@1) uses ClubhouseShopPage,
  // which does render both, so its editor is unchanged.
  const hidesClubhouseShopSections =
    club.presentationTemplateKey === "academy@1";
  // AcademyShopPage only ever reads the "home" kit variant — it fetches
  // fetchShopKitVariants's home/third/away triple and discards third and away
  // entirely, so neither is displayed anywhere on an academy@1 site. Third and
  // away are both real Rose City products — ClubhouseShopPage and
  // ClubhouseHomePage render all three — so this is hidden for academy@1
  // rather than removed from ShopKitVariant or the shop_kit_* CHECK
  // constraints.
  const kitVariants = hidesClubhouseShopSections
    ? KIT_VARIANTS.filter((variant) => variant.id === "home")
    : KIT_VARIANTS;
  const [selectedSurface, setSelectedSurface] = useState<ShopKitSurface>("home");
  const [selectedKitVariant, setSelectedKitVariant] =
    useState<ShopKitVariant>("home");
  // Never leave the editor pointed at a variant its own selector no longer
  // offers — that would be an unreachable, unswitchable tab.
  const activeKitVariant: ShopKitVariant =
    selectedSurface === "home"
      ? "home"
      : kitVariants.some((variant) => variant.id === selectedKitVariant)
        ? selectedKitVariant
        : "home";
  const [activeTab, setActiveTab] = useState<AdminTab>("content");
  const [fields, setFields] = useState<SectionFields>(EMPTY_FIELDS);
  const [draftPhotos, setDraftPhotos] = useState<DraftKitPhoto[]>([]);
  const [originalPhotos, setOriginalPhotos] = useState<DBShopKitPhoto[]>([]);
  const [draftPhotoStripPhotos, setDraftPhotoStripPhotos] = useState<DraftPhotoStripPhoto[]>([]);
  const [originalPhotoStripPhotos, setOriginalPhotoStripPhotos] = useState<DBShopCarouselPhoto[]>([]);
  const [purchaseDetails, setPurchaseDetails] =
    useState<DBShopPurchaseDetails>(DEFAULT_SHOP_PURCHASE_DETAILS);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoStripFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchShopKitContent(selectedSurface, activeKitVariant, clubId),
      fetchShopCarouselPhotos(activeKitVariant, clubId),
      fetchShopPurchaseDetails(clubId),
    ])
      .then(([{ section, photos }, photoStripPhotos, fetchedPurchaseDetails]) => {
        setFields(
          section
            ? sectionToFields(section)
            : {
                ...EMPTY_FIELDS,
                bullet_points: createDraftBulletPoints(DEFAULT_KIT_BULLET_POINTS),
              },
        );
        setOriginalPhotos(photos);
        setDraftPhotos(photos.map((photo) => ({ id: photo.id, url: photo.url })));
        setOriginalPhotoStripPhotos(photoStripPhotos);
        setDraftPhotoStripPhotos(
          photoStripPhotos.map((photo) => ({ id: photo.id, url: photo.url })),
        );
        setPurchaseDetails(fetchedPurchaseDetails);
        setDirty(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load shop content");
      })
      .finally(() => setLoading(false));
  }, [activeKitVariant, clubId, selectedSurface]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function setField(field: TextSectionField, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    markDirty();
  }

  function setBulletPoint(index: number, value: string) {
    setFields((current) => ({
      ...current,
      bullet_points: current.bullet_points.map((point, pointIndex) =>
        pointIndex === index ? { ...point, text: value } : point,
      ),
    }));
    markDirty();
  }

  function setPurchaseField(field: PurchaseTextField, value: string) {
    setPurchaseDetails((current) => ({ ...current, [field]: value }));
    markDirty();
  }

  function setPurchaseCardField(
    index: number,
    field: PurchaseCardTextField,
    value: string,
  ) {
    setPurchaseDetails((current) => ({
      ...current,
      cards: current.cards.map((card, cardIndex) =>
        cardIndex === index ? { ...card, [field]: value } : card,
      ),
    }));
    markDirty();
  }

  function addBulletPoint() {
    setFields((current) => {
      if (current.bullet_points.length >= MAX_KIT_BULLET_POINTS) return current;
      return {
        ...current,
        bullet_points: [
          ...current.bullet_points,
          ...createDraftBulletPoints([""]),
        ],
      };
    });
    markDirty();
  }

  function removeBulletPoint(index: number) {
    setFields((current) => ({
      ...current,
      bullet_points: current.bullet_points.filter(
        (_, pointIndex) => pointIndex !== index,
      ),
    }));
    markDirty();
  }

  function moveBulletPoint(index: number, delta: -1 | 1) {
    setFields((current) => {
      const destination = index + delta;
      if (destination < 0 || destination >= current.bullet_points.length) {
        return current;
      }
      const bulletPoints = [...current.bullet_points];
      [bulletPoints[index], bulletPoints[destination]] = [
        bulletPoints[destination],
        bulletPoints[index],
      ];
      return { ...current, bullet_points: bulletPoints };
    });
    markDirty();
  }

  function movePhoto(index: number, delta: -1 | 1) {
    setDraftPhotos((current) => {
      const next = [...current];
      const destination = index + delta;
      if (destination < 0 || destination >= next.length) return current;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    markDirty();
  }

  function movePhotoStripPhoto(index: number, delta: -1 | 1) {
    setDraftPhotoStripPhotos((current) => {
      const next = [...current];
      const destination = index + delta;
      if (destination < 0 || destination >= next.length) return current;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    markDirty();
  }

  async function removeKitPhoto(index: number) {
    const photo = draftPhotos[index];
    setDraftPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    markDirty();

    if (photo?.id === null) {
      try {
        await deleteStorageUrls("shop", [photo.url], ["kit/"]);
      } catch (deleteError: unknown) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to remove uploaded file");
      }
    }
  }

  async function removePhotoStripPhoto(index: number) {
    const photo = draftPhotoStripPhotos[index];
    setDraftPhotoStripPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    markDirty();

    if (photo?.id === null) {
      try {
        await deleteStorageUrls("shop", [photo.url], ["photo-strip/"]);
      } catch (deleteError: unknown) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to remove uploaded file");
      }
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = Math.max(0, MAX_KIT_PHOTOS - draftPhotos.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) return;

    setUploading(true);
    setError(null);
    markDirty();
    try {
      const uploaded: DraftKitPhoto[] = [];
      for (const file of selected) {
        uploaded.push({
          id: null,
          url: await uploadPhoto(
            file,
            "shop",
            `kit/${selectedSurface}-${activeKitVariant}`,
          ),
        });
      }
      setDraftPhotos((current) =>
        [...current, ...uploaded].slice(0, MAX_KIT_PHOTOS),
      );
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handlePhotoStripUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTO_STRIP_PHOTOS - draftPhotoStripPhotos.length;
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) return;

    setUploading(true);
    setError(null);
    markDirty();
    try {
      const uploaded: DraftPhotoStripPhoto[] = [];
      for (const file of selected) {
        uploaded.push({
          id: null,
          url: await uploadPhoto(file, "shop", `photo-strip/${activeKitVariant}`),
        });
      }
      setDraftPhotoStripPhotos((current) =>
        [...current, ...uploaded].slice(0, MAX_PHOTO_STRIP_PHOTOS),
      );
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (photoStripFileRef.current) photoStripFileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (draftPhotos.length === 0) return;

    const cleanedBulletPoints = cleanKitBulletPoints(
      fields.bullet_points.map((point) => point.text),
    );
    if (cleanedBulletPoints.length === 0) {
      setError("Add at least one product bullet point before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      // Upsert, not update. A kit variant the club has never saved before (the
      // Away kit on a club that only ever filled in Home) has no
      // `shop_kit_section` row, so an UPDATE matched zero rows and silently
      // discarded the content while the photos saved. The
      // (club_id, surface, kit_variant) unique constraint backs the conflict
      // target, which /api/admin/data already prefixes with the verified
      // `club_id`. No `club_id` here either: that route rejects any
      // client-supplied tenant filter or payload key with
      // UNTRUSTED_TENANT_INPUT and injects the real club itself.
      const { error: sectionError } = await supabase
        .from("shop_kit_section")
        .upsert(
          [
            {
              ...fields,
              bullet_points: cleanedBulletPoints,
              surface: selectedSurface,
              kit_variant: activeKitVariant,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "surface,kit_variant" },
        );
      if (sectionError) throw new Error(sectionError.message);

      const { toDelete, toInsert, toUpdate } = diffShopKitPhotos(
        originalPhotos,
        draftPhotos,
      );

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("shop_kit_photos")
          .delete()
          .in("id", toDelete);
        if (deleteError) throw new Error(deleteError.message);
      }
      await deleteStorageUrls("shop", [
        ...originalPhotos
          .filter((photo) => toDelete.includes(photo.id))
          .map((photo) => photo.url),
      ], ["kit/"]);

      for (const update of toUpdate) {
        const { error: updateError } = await supabase
          .from("shop_kit_photos")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
        if (updateError) throw new Error(updateError.message);
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("shop_kit_photos")
          .insert(toInsert.map((photo) => ({
            ...photo,
            surface: selectedSurface,
            kit_variant: activeKitVariant,
          })));
        if (insertError) throw new Error(insertError.message);
      }

      const photoStripDiff = diffPhotoStripPhotos(
        originalPhotoStripPhotos,
        draftPhotoStripPhotos,
      );

      if (photoStripDiff.toDelete.length > 0) {
        const { error: carouselDeleteError } = await supabase
          .from("shop_carousel_photos")
          .delete()
          .in("id", photoStripDiff.toDelete);
        if (carouselDeleteError) throw new Error(carouselDeleteError.message);
      }
      await deleteStorageUrls("shop", [
        ...originalPhotoStripPhotos
          .filter((photo) => photoStripDiff.toDelete.includes(photo.id))
          .map((photo) => photo.url),
      ], ["photo-strip/"]);

      for (const update of photoStripDiff.toUpdate) {
        const { error: carouselUpdateError } = await supabase
          .from("shop_carousel_photos")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
        if (carouselUpdateError) throw new Error(carouselUpdateError.message);
      }

      if (photoStripDiff.toInsert.length > 0) {
        const { error: carouselInsertError } = await supabase
          .from("shop_carousel_photos")
          .insert(photoStripDiff.toInsert.map((photo) => ({
            ...photo,
            kit_variant: activeKitVariant,
          })));
        if (carouselInsertError) throw new Error(carouselInsertError.message);
      }

      const cleanedPurchaseDetails = normalizeShopPurchaseDetails({
        ...purchaseDetails,
        id: 1,
        cards: normalizePurchaseDetailCards(purchaseDetails.cards),
        updated_at: new Date().toISOString(),
      });
      const { error: purchaseDetailsError } = await supabase
        .from("shop_purchase_details")
        .upsert([cleanedPurchaseDetails]);
      if (purchaseDetailsError) throw new Error(purchaseDetailsError.message);

      const [fresh, freshPhotoStrip, freshPurchaseDetails] = await Promise.all([
        fetchShopKitContent(selectedSurface, activeKitVariant, clubId),
        fetchShopCarouselPhotos(activeKitVariant, clubId),
        fetchShopPurchaseDetails(clubId),
      ]);
      if (fresh.section) setFields(sectionToFields(fresh.section));
      setOriginalPhotos(fresh.photos);
      setDraftPhotos(
        fresh.photos.map((photo) => ({ id: photo.id, url: photo.url })),
      );
      setOriginalPhotoStripPhotos(freshPhotoStrip);
      setDraftPhotoStripPhotos(
        freshPhotoStrip.map((photo) => ({ id: photo.id, url: photo.url })),
      );
      setPurchaseDetails(freshPurchaseDetails);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const previewSection: DBShopKitSection = {
    id: shopKitSectionId(selectedSurface, activeKitVariant),
    surface: selectedSurface,
    kit_variant: activeKitVariant,
    ...fields,
    bullet_points: cleanKitBulletPoints(
      fields.bullet_points.map((point) => point.text),
    ),
    updated_at: "",
  };
  const previewPhotos: DBShopKitPhoto[] = draftPhotos.map((photo, index) => ({
    id: photo.id ?? `draft-${index}`,
    surface: selectedSurface,
    kit_variant: activeKitVariant,
    url: photo.url,
    sort_order: index,
    created_at: "",
  }));
  const previewPhotoStripPhotos: DBShopCarouselPhoto[] = draftPhotoStripPhotos.map(
    (photo, index) => ({
      id: photo.id ?? `draft-${index}`,
      kit_variant: activeKitVariant,
      url: photo.url,
      sort_order: index,
      created_at: "",
    }),
  );
  const previewPurchaseDetails = normalizeShopPurchaseDetails({
    ...purchaseDetails,
    id: 1,
    cards: normalizePurchaseDetailCards(purchaseDetails.cards),
    updated_at: "",
  });
  const hasBulletPoint =
    cleanKitBulletPoints(fields.bullet_points.map((point) => point.text)).length >
    0;
  const saveDisabled =
    saving || uploading || draftPhotos.length === 0 || !hasBulletPoint;
  const activeEditorLabel =
    selectedSurface === "home"
      ? "Home Page Kit"
      : `${activeKitVariant === "home" ? "Home" : "Away"} Shop Kit`;
  const previewLabel =
    activeTab === "purchase" ? "Purchase Details" : activeEditorLabel;

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <div className="mb-4 sm:mb-6">
        <h1
          className="font-display font-black uppercase leading-none text-white"
          style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)" }}
        >
          Shop
        </h1>
        <p
          className="font-body mt-1"
          style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}
        >
          Manage independent kit content and photos for each public page.
        </p>
      </div>

      {loading ? (
        <p
          className="font-display text-sm uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Loading…
        </p>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <section
            className="min-w-0 self-start rounded-xl p-4 sm:p-5"
            style={{
              backgroundColor: "#141414",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="mb-4 grid grid-cols-2 gap-1 rounded-lg p-1"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
              aria-label="Kit placement"
            >
              {(
                [
                  { id: "home" as const, label: "Home Page" },
                  { id: "shop" as const, label: "Shop Page" },
                ]
              ).map((surface) => {
                const isSelected = selectedSurface === surface.id;
                return (
                  <button
                    key={surface.id}
                    type="button"
                    disabled={saving || uploading}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (surface.id === selectedSurface) return;
                      if (
                        dirty &&
                        !window.confirm("Discard unsaved changes before switching pages?")
                      ) {
                        return;
                      }
                      setSelectedSurface(surface.id);
                      if (surface.id === "home") {
                        setSelectedKitVariant("home");
                      }
                      if (
                        surface.id === "home" &&
                        (activeTab === "photoStrip" || activeTab === "purchase")
                      ) {
                        setActiveTab("content");
                      }
                      setSaved(false);
                    }}
                    className="font-display rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors"
                    style={{
                      backgroundColor: isSelected ? "#FFFFFF" : "transparent",
                      color: isSelected ? "#141414" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {surface.label}
                  </button>
                );
              })}
            </div>

            {/* With only "home" left in kitVariants for academy@1, a
                single-tab switcher would be dead UI, so it's hidden entirely —
                same pattern as the Sponsors and About Club Logo tab hides. */}
            {selectedSurface === "shop" && kitVariants.length > 1 && (
              <div
                className="mb-4 grid grid-cols-2 gap-1 rounded-lg p-1"
                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                aria-label="Kit type"
              >
                {kitVariants.map((variant) => {
                  const isSelected = selectedKitVariant === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={saving || uploading}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (variant.id === selectedKitVariant) return;
                        if (
                          dirty &&
                          !window.confirm("Discard unsaved changes before switching kits?")
                        ) {
                          return;
                        }
                        setSelectedKitVariant(variant.id);
                        setSaved(false);
                      }}
                      className="font-display rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors"
                      style={{
                        backgroundColor: isSelected ? "#E7001B" : "transparent",
                        color: isSelected ? "white" : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {variant.label}
                    </button>
                  );
                })}
              </div>
            )}

            <p
              className="font-body mb-4 text-xs leading-relaxed"
              style={{ color: "rgba(255,255,255,0.32)" }}
            >
              Editing the {selectedSurface === "home" ? "home page kit" : `${activeKitVariant} shop kit`}.
              {hidesClubhouseShopSections
                ? " Content and Kit Photos are saved independently."
                : " Content, Kit Photos, and Shop Page Photo Row are saved independently."}
            </p>

            <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              {(
                [
                  { id: "content" as const, label: "Content", count: null },
                  {
                    id: "kit" as const,
                    label: "Kit Photos",
                    count: `${draftPhotos.length}/${MAX_KIT_PHOTOS}`,
                  },
                  {
                    id: "photoStrip" as const,
                    label: "Photo Row",
                    count: `${draftPhotoStripPhotos.length}/${MAX_PHOTO_STRIP_PHOTOS}`,
                  },
                  {
                    id: "purchase" as const,
                    label: "Purchase",
                    count: null,
                  },
                ].filter(
                  (tab) =>
                    (tab.id !== "photoStrip" && tab.id !== "purchase") ||
                    (selectedSurface === "shop" && !hidesClubhouseShopSections),
                )
              ).map((tab) => {
                const hasIssue =
                  (tab.id === "content" && !hasBulletPoint) ||
                  (tab.id === "kit" && draftPhotos.length === 0);
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="font-display flex-1 rounded-md px-2 py-2.5 text-[0.65rem] uppercase tracking-widest transition-colors sm:text-xs"
                    style={{
                      backgroundColor: isActive ? "#E7001B" : "transparent",
                      color: isActive ? "white" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {tab.label}
                    {tab.count && (
                      <span style={{ opacity: 0.75 }}> {tab.count}</span>
                    )}
                    {hasIssue && (
                      <span
                        aria-hidden="true"
                        style={{ color: isActive ? "white" : "#E7001B" }}
                      >
                        {" "}
                        •
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeTab === "content" && (
            <div className="space-y-3">
              <Field
                label="Small Heading Above the Title"
                help='Example: "2026 Kit · Available Now"'
              >
                <input
                  type="text"
                  placeholder="2026 Kit · Available Now"
                  value={fields.eyebrow}
                  onChange={(event) => setField("eyebrow", event.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field
                label="Main Product Title"
                help="Press Enter where you want the title to start a new line."
              >
                <textarea
                  placeholder={"Thorn\nEdition\n2026"}
                  value={fields.title}
                  onChange={(event) => setField("title", event.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>

              <Field
                label="Product Description"
                help="A short description shown below the main title."
              >
                <textarea
                  placeholder="Describe the jersey, its design, and what makes it special."
                  value={fields.description}
                  onChange={(event) => setField("description", event.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>

              <Field
                label="Product Bullet Points"
                help={`Short lines shown next to the red dots. Add up to ${MAX_KIT_BULLET_POINTS}.`}
              >
                <div className="space-y-2">
                  {fields.bullet_points.map((point, index) => (
                    <div
                      key={point.id}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
                    >
                      <input
                        type="text"
                        value={point.text}
                        maxLength={80}
                        placeholder={`Bullet point ${index + 1}`}
                        aria-label={`Product bullet point ${index + 1}`}
                        onChange={(event) =>
                          setBulletPoint(index, event.target.value)
                        }
                        style={inputStyle}
                      />
                      <div className="flex gap-1">
                        <BulletActionButton
                          label={`Move bullet point ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => moveBulletPoint(index, -1)}
                        >
                          ↑
                        </BulletActionButton>
                        <BulletActionButton
                          label={`Move bullet point ${index + 1} down`}
                          disabled={index === fields.bullet_points.length - 1}
                          onClick={() => moveBulletPoint(index, 1)}
                        >
                          ↓
                        </BulletActionButton>
                        <BulletActionButton
                          label={`Remove bullet point ${index + 1}`}
                          onClick={() => removeBulletPoint(index)}
                          danger
                        >
                          ×
                        </BulletActionButton>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addBulletPoint}
                    disabled={
                      fields.bullet_points.length >= MAX_KIT_BULLET_POINTS
                    }
                    className="font-display flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-xs uppercase tracking-widest transition-colors"
                    style={{
                      borderColor: "rgba(255,255,255,0.14)",
                      color: "rgba(255,255,255,0.5)",
                      opacity:
                        fields.bullet_points.length >= MAX_KIT_BULLET_POINTS
                          ? 0.4
                          : 1,
                      cursor:
                        fields.bullet_points.length >= MAX_KIT_BULLET_POINTS
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <span aria-hidden="true">+</span>
                    Add Bullet Point ({fields.bullet_points.length}/
                    {MAX_KIT_BULLET_POINTS})
                  </button>
                </div>
                {!hasBulletPoint && (
                  <p
                    className="font-body mt-2 text-xs"
                    style={{ color: "#E7001B" }}
                  >
                    Add at least one bullet point.
                  </p>
                )}
              </Field>

              <Field
                label="Store Information"
                help="Use Enter to place the store name and address on separate lines."
              >
                <textarea
                  placeholder={DEFAULT_KIT_STORE_NOTE}
                  value={fields.store_note}
                  maxLength={180}
                  onChange={(event) =>
                    setField("store_note", event.target.value)
                  }
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field
                  label="Purchase Button Text"
                  help='Example: "Buy Now →"'
                >
                  <input
                    type="text"
                    placeholder="Buy Now →"
                    value={fields.cta_label}
                    onChange={(event) => setField("cta_label", event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field
                  label="Purchase Page Link"
                  help={
                    selectedSurface === "home"
                      ? "Not used here — the homepage button always sends fans to the Team Store page. Set the real purchase link on the Shop Page surface instead."
                      : "Paste the full web address where supporters can buy the kit."
                  }
                >
                  <input
                    type="url"
                    placeholder="https://..."
                    value={fields.cta_link}
                    onChange={(event) => setField("cta_link", event.target.value)}
                    disabled={selectedSurface === "home"}
                    style={
                      selectedSurface === "home"
                        ? { ...inputStyle, opacity: 0.4, cursor: "not-allowed" }
                        : inputStyle
                    }
                  />
                </Field>
              </div>
            </div>
            )}

            {activeTab === "purchase" && selectedSurface === "shop" && (
            <div className="space-y-4">
              <Field
                label="Purchase Section Heading"
                help='Example: "Purchase Details"'
              >
                <input
                  type="text"
                  value={previewPurchaseDetails.heading}
                  onChange={(event) => setPurchaseField("heading", event.target.value)}
                  style={inputStyle}
                />
              </Field>

              <div className="space-y-3">
                {previewPurchaseDetails.cards
                  .slice(0, MAX_PURCHASE_DETAIL_CARDS)
                  .map((card, index) => (
                    <div
                      key={`purchase-card-${index}`}
                      className="rounded-lg p-3"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <p
                        className="font-display mb-3 text-xs uppercase tracking-widest"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        Detail Card {index + 1}
                      </p>
                      <div className="space-y-3">
                        <Field label="Red Label">
                          <input
                            type="text"
                            value={card.label}
                            onChange={(event) =>
                              setPurchaseCardField(index, "label", event.target.value)
                            }
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Card Title">
                          <input
                            type="text"
                            value={card.title}
                            onChange={(event) =>
                              setPurchaseCardField(index, "title", event.target.value)
                            }
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Card Body">
                          <textarea
                            value={card.body}
                            onChange={(event) =>
                              setPurchaseCardField(index, "body", event.target.value)
                            }
                            rows={3}
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Footer Label">
                  <input
                    type="text"
                    value={previewPurchaseDetails.cta_eyebrow}
                    onChange={(event) =>
                      setPurchaseField("cta_eyebrow", event.target.value)
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Footer Text">
                  <textarea
                    value={previewPurchaseDetails.cta_text}
                    onChange={(event) =>
                      setPurchaseField("cta_text", event.target.value)
                    }
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </Field>
                <Field label="Button Text">
                  <input
                    type="text"
                    value={previewPurchaseDetails.cta_label}
                    onChange={(event) =>
                      setPurchaseField("cta_label", event.target.value)
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Button Link">
                  <input
                    type="url"
                    value={previewPurchaseDetails.cta_link}
                    onChange={(event) =>
                      setPurchaseField("cta_link", event.target.value)
                    }
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>
            )}

            {activeTab === "kit" && (
            <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p
                  className="font-display text-xs uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  Kit Photos
                </p>
                <p
                  className="font-body mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.22)" }}
                >
                  Drag-free ordering with arrow controls.
                </p>
              </div>
              <span
                className="font-display text-xs uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {draftPhotos.length}/{MAX_KIT_PHOTOS}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 min-[420px]:flex min-[420px]:flex-wrap">
              {draftPhotos.map((photo, index) => (
                <div key={photo.id ?? photo.url} className="min-w-0 min-[420px]:w-[76px]">
                  <div
                    className="group relative aspect-square w-full overflow-hidden rounded-lg min-[420px]:h-[72px]"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Image
                      src={photo.url}
                      alt={`Kit photo ${index + 1}`}
                      fill
                      sizes="72px"
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void removeKitPhoto(index)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full opacity-100 transition-opacity sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      style={{ backgroundColor: "#E7001B" }}
                      aria-label={`Remove kit photo ${index + 1}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <OrderButton
                      label={`Move kit photo ${index + 1} left`}
                      disabled={index === 0}
                      onClick={() => movePhoto(index, -1)}
                    >
                      ←
                    </OrderButton>
                    <OrderButton
                      label={`Move kit photo ${index + 1} right`}
                      disabled={index === draftPhotos.length - 1}
                      onClick={() => movePhoto(index, 1)}
                    >
                      →
                    </OrderButton>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !canAddKitPhoto(draftPhotos.length)}
                className="flex aspect-square w-full flex-col items-center justify-center rounded-lg transition-colors min-[420px]:h-[72px] min-[420px]:w-[76px]"
                style={{
                  border: "1px dashed rgba(255,255,255,0.15)",
                  backgroundColor: uploading
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                  color: "rgba(255,255,255,0.3)",
                  cursor:
                    uploading || !canAddKitPhoto(draftPhotos.length)
                      ? "not-allowed"
                      : "pointer",
                  opacity: canAddKitPhoto(draftPhotos.length) ? 1 : 0.4,
                }}
                aria-label="Add kit photos"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span
                  className="font-display mt-1 uppercase"
                  style={{ fontSize: "0.55rem", letterSpacing: "0.08em" }}
                >
                  {uploading ? "Uploading" : "Add"}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => handleUpload(event.target.files)}
              />
            </div>

            {!canAddKitPhoto(draftPhotos.length) && (
              <p
                className="font-body mt-2 text-xs"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {MAX_KIT_PHOTOS} photo max.
              </p>
            )}
            {draftPhotos.length === 0 && (
              <p className="font-body mt-2 text-xs" style={{ color: "#E7001B" }}>
                At least 1 photo is required.
              </p>
            )}
            </div>
            )}

            {activeTab === "photoStrip" && (
            <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p
                  className="font-display text-xs uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {activeKitVariant === "home" ? "Home Kit" : "Away Kit"} Photo Row
                </p>
                <p
                  className="font-body mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.22)" }}
                >
                  Static photo row shown below the selected shop kit. Leave empty to hide it.
                </p>
              </div>
              <span
                className="font-display text-xs uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {draftPhotoStripPhotos.length}/{MAX_PHOTO_STRIP_PHOTOS}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 min-[420px]:flex min-[420px]:flex-wrap">
              {draftPhotoStripPhotos.map((photo, index) => (
                <div key={photo.id ?? photo.url} className="min-w-0 min-[420px]:w-[76px]">
                  <div
                    className="group relative aspect-square w-full overflow-hidden rounded-lg min-[420px]:h-[72px]"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Image
                      src={photo.url}
                      alt={`Photo row image ${index + 1}`}
                      fill
                      sizes="72px"
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void removePhotoStripPhoto(index)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full opacity-100 transition-opacity sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      style={{ backgroundColor: "#E7001B" }}
                      aria-label={`Remove photo row image ${index + 1}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <OrderButton
                      label={`Move photo row image ${index + 1} left`}
                      disabled={index === 0}
                      onClick={() => movePhotoStripPhoto(index, -1)}
                    >
                      ←
                    </OrderButton>
                    <OrderButton
                      label={`Move photo row image ${index + 1} right`}
                      disabled={index === draftPhotoStripPhotos.length - 1}
                      onClick={() => movePhotoStripPhoto(index, 1)}
                    >
                      →
                    </OrderButton>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => photoStripFileRef.current?.click()}
                disabled={uploading || !canAddPhotoStripPhoto(draftPhotoStripPhotos.length)}
                className="flex aspect-square w-full flex-col items-center justify-center rounded-lg transition-colors min-[420px]:h-[72px] min-[420px]:w-[76px]"
                style={{
                  border: "1px dashed rgba(255,255,255,0.15)",
                  backgroundColor: uploading
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                  color: "rgba(255,255,255,0.3)",
                  cursor:
                    uploading || !canAddPhotoStripPhoto(draftPhotoStripPhotos.length)
                      ? "not-allowed"
                      : "pointer",
                  opacity: canAddPhotoStripPhoto(draftPhotoStripPhotos.length) ? 1 : 0.4,
                }}
                aria-label="Add photo row images"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span
                  className="font-display mt-1 uppercase"
                  style={{ fontSize: "0.55rem", letterSpacing: "0.08em" }}
                >
                  {uploading ? "Uploading" : "Add"}
                </span>
              </button>
              <input
                ref={photoStripFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => handlePhotoStripUpload(event.target.files)}
              />
            </div>

            {!canAddPhotoStripPhoto(draftPhotoStripPhotos.length) && (
              <p
                className="font-body mt-2 text-xs"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {MAX_PHOTO_STRIP_PHOTOS} photo max.
              </p>
            )}
            </div>
            )}

            <div
              className="mt-4 border-t pt-4"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              {error && (
                <p className="font-body mb-3 text-sm" style={{ color: "#E7001B" }}>
                  Error: {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saveDisabled}
                className="font-display w-full rounded-lg px-6 py-3 font-black uppercase tracking-widest text-white transition-opacity"
                style={{
                  backgroundColor: "#E7001B",
                  fontSize: "1rem",
                  opacity: saveDisabled ? 0.5 : 1,
                  cursor: saveDisabled ? "not-allowed" : "pointer",
                }}
              >
                {saving
                  ? "Saving…"
                  : uploading
                    ? "Uploading…"
                    : `Save ${activeEditorLabel}`}
              </button>
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p
                  className="font-display font-bold uppercase tracking-widest text-white"
                  style={{ fontSize: "0.9rem" }}
                >
                  {previewLabel} Preview
                </p>
                <p
                  className="font-body mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Desktop website view, scaled to fit.
                </p>
              </div>
              <span
                className="font-display rounded-full px-3 py-1 text-xs uppercase tracking-widest"
                style={{
                  color: "rgba(255,255,255,0.4)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                Draft
              </span>
            </div>

            <div
              className="overflow-hidden rounded-lg"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {activeTab === "purchase" ? (
                <ScaledShopPurchaseDetailsPreview details={previewPurchaseDetails} />
              ) : previewPhotos.length > 0 ? (
                <ScaledShopKitPreview
                  section={previewSection}
                  photos={previewPhotos}
                />
              ) : (
                <div
                  className="flex min-h-72 items-center justify-center p-8 text-center"
                  style={{ backgroundColor: "#141414" }}
                >
                  <p
                    className="font-body text-sm"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Add at least one kit photo to preview the public section.
                  </p>
                </div>
              )}
            </div>

            {selectedSurface === "shop" &&
              activeTab !== "purchase" &&
              !hidesClubhouseShopSections && (
            <>
            <div className="mb-3 mt-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p
                  className="font-display font-bold uppercase tracking-widest text-white"
                  style={{ fontSize: "0.9rem" }}
                >
                  Shop Page Photo Row Preview
                </p>
                <p
                  className="font-body mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Desktop website view, scaled to fit.
                </p>
              </div>
            </div>

            <div
              className="overflow-hidden rounded-lg"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {previewPhotoStripPhotos.length > 0 ? (
                <ScaledShopPhotoStripPreview photos={previewPhotoStripPhotos} />
              ) : (
                <div
                  className="flex min-h-40 items-center justify-center p-8 text-center"
                  style={{ backgroundColor: "#141414" }}
                >
                  <p
                    className="font-body text-sm"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Empty — the photo row stays hidden on the shop page until you add a photo.
                  </p>
                </div>
              )}
            </div>
            </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="font-display mb-1 block text-xs uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {label}
      </label>
      {children}
      {help && (
        <p
          className="font-body mt-1.5 text-xs leading-relaxed"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          {help}
        </p>
      )}
    </div>
  );
}

function BulletActionButton({
  label,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-8 items-center justify-center rounded-lg text-base"
      style={{
        backgroundColor: danger
          ? "rgba(231,0,27,0.12)"
          : "rgba(255,255,255,0.05)",
        color: disabled
          ? "rgba(255,255,255,0.12)"
          : danger
            ? "#E7001B"
            : "rgba(255,255,255,0.55)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function OrderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 flex-1 items-center justify-center rounded sm:h-6"
      style={{
        backgroundColor: "rgba(255,255,255,0.05)",
        color: disabled ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.5)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#0e0e0e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "9px 12px",
  color: "white",
  fontSize: "1rem",
  fontFamily: "inherit",
  outline: "none",
  colorScheme: "dark",
};
