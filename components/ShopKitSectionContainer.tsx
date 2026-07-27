"use client";

import { useEffect, useState } from "react";
import ShopKitSection from "@/components/ShopKitSection";
import {
  fetchShopKitVariants,
  type ShopKitContent,
} from "@/lib/queries";
import type { ShopKitSurface, ShopKitVariant } from "@/lib/db-types";
import { useClubId } from "@/components/ClubContextProvider";

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
}: {
  headingTag?: "h1" | "h2";
  fadeImageToWhite?: boolean;
  surface: ShopKitSurface;
  selectedVariant?: ShopKitVariant;
  onVariantChange?: (variant: ShopKitVariant) => void;
}) {
  const clubId = useClubId();
  const [contentByVariant, setContentByVariant] =
    useState<Record<ShopKitVariant, ShopKitContent> | null>(null);
  const [internalVariant, setInternalVariant] = useState<ShopKitVariant>("home");
  const activeVariant = selectedVariant ?? internalVariant;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchShopKitVariants(surface, clubId)
      .then(setContentByVariant)
      .catch((error) => {
        console.error("ShopKitSection:", error);
      })
      .finally(() => setLoading(false));
  }, [clubId, surface]);

  if (loading) {
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

  const content =
    contentByVariant?.[activeVariant]?.section &&
    contentByVariant[activeVariant].photos.length > 0
      ? contentByVariant[activeVariant]
      : contentByVariant?.home;

  if (!content?.section || content.photos.length === 0) return null;

  const showVariantTabs = surface === "shop";

  return (
    <ShopKitSection
      section={content.section}
      photos={content.photos}
      headingTag={headingTag}
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
          {KIT_VARIANTS.map((variant) => {
            const isSelected = activeVariant === variant.id;
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
