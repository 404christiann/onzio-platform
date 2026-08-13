"use client";

import { useEffect, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import { useClubId } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import {
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
} from "@/lib/shop-kit";
import type { ShopKitVariant } from "@/lib/db-types";

const VARIANT_ORDER: ShopKitVariant[] = ["home", "away", "third"];
const KIT_LABELS: Record<ShopKitVariant, string> = {
  home: "Home kit",
  away: "Away kit",
  third: "Third kit",
};

/**
 * Real-data editorial Store, using the approved mockup's campaign, catalog,
 * and service-strip structure. Product links remain the admin-authored CTAs;
 * no price, cart, size, or checkout behavior is invented.
 */
export default function EditorialShopPage() {
  const clubId = useClubId();
  const { identity } = useEditorialIdentity();
  const [content, setContent] = useState<Record<ShopKitVariant, ShopKitContent> | null>(null);
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
    return [
      {
        variant,
        section,
        photo: photos[0] ?? null,
        bulletPoints: normalizeKitBulletPoints(section.bullet_points),
        storeNote: normalizeKitStoreNote(section.store_note).trim(),
      },
    ];
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

  const featured = products[0];
  const city = identity?.city?.trim() || "the city";
  const clubLabel = identity?.shortName?.trim() || "the club";
  const productHref = (value: string) => value.trim() || "#store-collection-title";

  return (
    <div className="store-page">
      <section className="store-campaign">
        <div className="store-campaign-copy">
          <span className="eyebrow">Official collection</span>
          <h1>
            Made for the match.
            <br />
            <em>Worn for {city}.</em>
          </h1>
          <p>
            {products.length} first-team colors. One {clubLabel} badge. Built
            for every side of matchday.
          </p>
        </div>

        <a
          className="store-featured-product"
          href={productHref(featured.section.cta_link)}
          aria-label={featured.section.cta_label || `View ${featured.section.title}`}
        >
          <span className="store-featured-label">
            Featured · {KIT_LABELS[featured.variant]}
          </span>
          <span className="store-featured-image">
            {featured.photo ? (
              <ResilientImage
                src={featured.photo.url}
                alt={featured.section.title}
                fill
                priority
                sizes="(max-width: 800px) 94vw, 48vw"
                {...imageDeliveryProps("shop-photo")}
              />
            ) : (
              <span className="store-product-image-empty" aria-hidden="true" />
            )}
          </span>
          <span className="store-featured-footer">
            <strong>{featured.section.title}</strong>
            <b>{featured.section.cta_label || "View kit"}</b>
          </span>
        </a>
      </section>

      <section className="store-catalog" aria-labelledby="store-collection-title">
        <header className="store-catalog-head">
          <div>
            <span className="eyebrow">First-team kits</span>
            <h2 id="store-collection-title">Choose your colors.</h2>
          </div>
          <p>{products.length} official jerseys · current collection</p>
        </header>

        <div className="store-product-grid">
          {products.map((product, index) => (
            <a
              key={product.variant}
              className="store-product-card"
              data-kit={index + 1}
              href={productHref(product.section.cta_link)}
              aria-label={product.section.cta_label || `View ${product.section.title}`}
            >
              <span className="store-product-type">{KIT_LABELS[product.variant]}</span>
              <span className="store-product-image">
                {product.photo ? (
                  <ResilientImage
                    src={product.photo.url}
                    alt={product.section.title}
                    fill
                    sizes="(max-width: 700px) 88vw, 32vw"
                    {...imageDeliveryProps("shop-photo")}
                  />
                ) : (
                  <span className="store-product-image-empty" aria-hidden="true" />
                )}
              </span>
              <span className="store-product-info">
                <span>
                  <small>Official first-team jersey</small>
                  <strong>{product.section.title}</strong>
                </span>
                <b>{product.section.cta_label || "View kit"}</b>
              </span>
            </a>
          ))}
        </div>

        <div className="store-service-strip" aria-label="Store information">
          <p>
            <small>Details</small>
            <strong>{featured.bulletPoints[0] || "Official first-team collection"}</strong>
          </p>
          <p>
            <small>Collection</small>
            <strong>{clubLabel}</strong>
          </p>
          <p>
            <small>Ordering</small>
            <strong>{featured.storeNote || featured.section.cta_label}</strong>
          </p>
        </div>
      </section>
    </div>
  );
}
