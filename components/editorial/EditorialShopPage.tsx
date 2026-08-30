"use client";

import { useEffect, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import { useClubId } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import EditorialShopKitSlideshow from "@/components/editorial/EditorialShopKitSlideshow";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import type { ShopKitVariant } from "@/lib/db-types";

const VARIANT_ORDER: ShopKitVariant[] = ["home", "away", "third"];
const KIT_LABELS: Record<ShopKitVariant, string> = {
  home: "Home kit",
  away: "Away kit",
  third: "Third kit",
};

/**
 * Real-data editorial Store using a simple official-vendor handoff. The club
 * controls each product's title, description, image, and destination link.
 */
export default function EditorialShopPage() {
  const clubId = useClubId();
  const { identity } = useEditorialIdentity();
  const [content, setContent] = useState<Record<ShopKitVariant, ShopKitContent> | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ShopKitVariant>("home");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchShopKitVariants("shop", clubId)
      .then((variants) => {
        if (!cancelled) setContent(variants);
      })
      .catch((error: unknown) => {
        console.error("EditorialShopPage:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (loading) {
    return (
      <section className="shop-state">
        <p className="eyebrow">Store</p>
        <p>Loading collection…</p>
      </section>
    );
  }

  const products = VARIANT_ORDER.flatMap((variant) => {
    const variantContent = content?.[variant];
    const section = variantContent?.section;
    if (!section) return [];

    const photos = (variantContent.photos ?? []).filter(
      (photo) => photo.url.trim().length > 0,
    );

    // Carry the whole ordered list: a variant with more than one photo is
    // rendered as a slideshow rather than silently showing only photos[0].
    return [{ variant, section, photos }];
  });

  if (products.length === 0) {
    return (
      <section className="shop-state">
        <p className="eyebrow">Store</p>
        <h1>Nothing in the store yet</h1>
        <p>Check back soon for kit and merchandise.</p>
      </section>
    );
  }

  const selectedProduct =
    products.find((product) => product.variant === selectedVariant) ?? products[0];
  const productHref = selectedProduct.section.cta_link.trim() || "#store-product";
  const collectionName =
    identity?.shortName?.replace(/\s+FC$/i, "").trim() || "Club";

  return (
    <main className="store-page">
      <header className="store-heading">
        <span className="store-collection-label">
          Official {collectionName} collection
        </span>
        <h1>Make it yours!</h1>
        <p className="store-intro">
          Pick your colors, then finish sizing and checkout with our official
          merchandise partner.
        </p>

        <div className="store-kit-tabs" role="tablist" aria-label="Choose a jersey">
          {products.map((product) => (
            <button
              key={product.variant}
              className="store-kit-tab"
              type="button"
              role="tab"
              aria-selected={selectedProduct.variant === product.variant}
              aria-controls="store-product"
              onClick={() => setSelectedVariant(product.variant)}
            >
              {KIT_LABELS[product.variant]}
            </button>
          ))}
        </div>
      </header>

      <section
        id="store-product"
        className="store-product"
        role="tabpanel"
        aria-live="polite"
      >
        <div className="store-product-visual">
          <div className="store-product-image">
            {selectedProduct.photos.length > 1 ? (
              // key={variant} remounts on a kit-tab switch, so the slideshow
              // resets to the first photo and restarts its auto-advance cycle.
              <EditorialShopKitSlideshow
                key={selectedProduct.variant}
                photos={selectedProduct.photos}
                alt={selectedProduct.section.title}
                priority
              />
            ) : selectedProduct.photos[0] ? (
              <ResilientImage
                src={selectedProduct.photos[0].url}
                alt={selectedProduct.section.title}
                fill
                priority
                sizes="(max-width: 1120px) 100vw, 62vw"
                {...imageDeliveryProps("shop-photo")}
              />
            ) : (
              <span className="store-product-image-empty" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="store-product-details">
          <h2>{selectedProduct.section.title}</h2>
          <p className="store-product-description">
            {selectedProduct.section.description}
          </p>
          <div className="store-product-action">
            <a
              className="store-vendor-button"
              href={productHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Shop ${selectedProduct.section.title} with our vendor`}
            >
              Shop with our vendor
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
