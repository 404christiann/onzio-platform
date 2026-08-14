"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import type { ShopKitVariant } from "@/lib/db-types";

const PRODUCT_ORDER: ShopKitVariant[] = ["home", "away", "third"];
const KIT_LABELS: Record<ShopKitVariant, string> = {
  home: "Home kit",
  away: "Away kit",
  third: "Third kit",
};

type HomeStoreProduct = {
  variant: ShopKitVariant;
  title: string;
  description: string;
  photoUrl: string | null;
};

export default function EditorialHomeStore() {
  const club = useClubContext();
  const [content, setContent] =
    useState<Record<ShopKitVariant, ShopKitContent> | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<ShopKitVariant>("home");

  useEffect(() => {
    if (!club.storeEnabled) return;
    let cancelled = false;
    fetchShopKitVariants("shop", club.id)
      .then((variants) => {
        if (!cancelled) setContent(variants);
      })
      .catch((error: unknown) => {
        console.error("EditorialHomeStore:", error);
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id, club.storeEnabled]);

  if (!club.storeEnabled) return null;

  const products: HomeStoreProduct[] = PRODUCT_ORDER.flatMap((variant) => {
    const kit = content?.[variant];
    const section = kit?.section;
    if (!section) return [];
    const photoUrl =
      kit.photos.find((photo) => photo.url.trim().length > 0)?.url.trim() ?? null;
    return [
      {
        variant,
        title: section.title,
        description: section.description,
        photoUrl,
      },
    ];
  });

  if (products.length === 0) return null;

  const selectedProduct =
    products.find((product) => product.variant === selectedVariant) ??
    products[0];

  return (
    <section className="editorial-home-store" aria-labelledby="home-store-title">
      <div className="editorial-home-store-head">
        <div>
          <p className="eyebrow">Team Shop</p>
          <h2 id="home-store-title">
            Three colors.
            <br />
            <em>One badge.</em>
          </h2>
        </div>
        <div className="editorial-home-store-copy">
          <p>
            Choose the home, away, or third kit, then continue to the full shop
            for collection details.
          </p>
        </div>
      </div>

      <div
        className="editorial-home-store-tabs"
        role="tablist"
        aria-label="Choose a featured jersey"
      >
        {products.map((product) => (
          <button
            className="editorial-home-store-tab"
            type="button"
            role="tab"
            aria-selected={selectedProduct.variant === product.variant}
            aria-controls="home-store-product"
            onClick={() => setSelectedVariant(product.variant)}
            key={product.variant}
          >
            {KIT_LABELS[product.variant]}
          </button>
        ))}
      </div>

      <div
        id="home-store-product"
        className="editorial-home-store-feature"
        role="tabpanel"
        aria-live="polite"
      >
        <div className="editorial-home-store-visual">
          <span className="editorial-home-store-image">
            {selectedProduct.photoUrl ? (
              <ResilientImage
                src={selectedProduct.photoUrl}
                alt={selectedProduct.title}
                fill
                sizes="(max-width: 900px) 92vw, 58vw"
                {...imageDeliveryProps("shop-photo")}
              />
            ) : (
              <span className="store-product-image-empty" aria-hidden="true" />
            )}
          </span>
        </div>

        <div className="editorial-home-store-detail">
          <p className="editorial-home-store-kit-label">
            {KIT_LABELS[selectedProduct.variant]}
          </p>
          <h3>{selectedProduct.title}</h3>
          <p>{selectedProduct.description}</p>
          <Link href="/shop">Shop the collection</Link>
        </div>
      </div>
    </section>
  );
}
