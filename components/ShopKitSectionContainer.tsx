"use client";

import { useEffect, useState } from "react";
import ShopKitSection from "@/components/ShopKitSection";
import {
  fetchShopKitVariants,
  type ShopKitContent,
} from "@/lib/queries";
import type { ShopKitSurface, ShopKitVariant } from "@/lib/db-types";
import { useClubContext, useClubId } from "@/components/ClubContextProvider";
import { availableKitVariants, resolveKitVariant } from "@/lib/shop-kit";

const KIT_VARIANTS: Array<{ id: ShopKitVariant; label: string }> = [
  { id: "home", label: "Home" },
  { id: "away", label: "Away" },
];

export default function ShopKitSectionContainer({
  headingTag = "h2",
  fadeImageToWhite = false,
  surface,
  selectedVariant,
  onVariantChange,
  editorContent,
}: {
  headingTag?: "h1" | "h2";
  fadeImageToWhite?: boolean;
  surface: ShopKitSurface;
  selectedVariant?: ShopKitVariant;
  onVariantChange?: (variant: ShopKitVariant) => void;
  editorContent?: Record<ShopKitVariant, ShopKitContent>;
}) {
  const clubId = useClubId();
  const [contentByVariant, setContentByVariant] =
    useState<Record<ShopKitVariant, ShopKitContent> | null>(null);
  const [internalVariant, setInternalVariant] = useState<ShopKitVariant>("home");
  const activeVariant = selectedVariant ?? internalVariant;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (editorContent) return;
    setLoading(true);
    fetchShopKitVariants(surface, clubId)
      .then(setContentByVariant)
      .catch((error) => {
        console.error("ShopKitSection:", error);
      })
      .finally(() => setLoading(false));
  }, [clubId, surface, editorContent]);

  const { storeEnabled } = useClubContext();
  const kits = editorContent ?? contentByVariant;
  // Only kits with words and a photo are offered; an empty Away kit is never
  // stood in for by the Home shirt.
  const offeredVariants = kits
    ? availableKitVariants(kits).filter((variant) => KIT_VARIANTS.some((kit) => kit.id === variant))
    : [];
  const shownVariant = resolveKitVariant(activeVariant, offeredVariants);

  useEffect(() => {
    // Keep the page's photo row on the kit actually shown (public page only:
    // the admin preview must not move the editor off the kit being edited).
    if (editorContent || !shownVariant || shownVariant === activeVariant) return;
    setInternalVariant(shownVariant);
    onVariantChange?.(shownVariant);
  }, [activeVariant, editorContent, onVariantChange, shownVariant]);

  if (!storeEnabled && !editorContent) return null;

  if (loading && !editorContent) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ minHeight: "70vh", backgroundColor: "var(--color-white)" }}
      >
        <p
          className="font-display font-black uppercase tracking-widest"
          style={{ color: "var(--color-gray-mid)", fontSize: "1rem" }}
        >
          Loading collection…
        </p>
      </div>
    );
  }

  const content = shownVariant ? kits?.[shownVariant] : null;

  if (!content?.section || content.photos.length === 0) return null;

  const showVariantTabs = surface === "shop" && offeredVariants.length > 1;

  return (
    <ShopKitSection
      section={content.section}
      photos={content.photos}
      headingTag={headingTag}
      animate={!editorContent}
      fadeImageToWhite={fadeImageToWhite}
      ctaHref={surface === "home" ? "/shop" : undefined}
      variantTabs={showVariantTabs ? (
        <div
          className="inline-grid grid-cols-2 rounded-full p-1"
          style={{
            backgroundColor: "rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
          aria-label="Select kit type"
        >
          {KIT_VARIANTS.filter((variant) => offeredVariants.includes(variant.id)).map((variant) => {
            const isSelected = shownVariant === variant.id;
            return (
              <button
                key={variant.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setInternalVariant(variant.id);
                  onVariantChange?.(variant.id);
                }}
                className="font-display rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest transition-colors"
                style={{
                  backgroundColor: isSelected ? "var(--color-black)" : "transparent",
                  color: isSelected ? "white" : "rgba(0,0,0,0.48)",
                }}
              >
                {variant.label}
              </button>
            );
          })}
        </div>
      ) : undefined}
    />
  );
}
