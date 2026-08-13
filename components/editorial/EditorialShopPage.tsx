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
      <section className="shop-state grid min-h-screen place-items-center bg-ed-paper px-5 text-ed-ink">
        <p className="eyebrow">Store</p>
        <p className="font-display text-4xl font-black uppercase">Loading collection...</p>
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
      <section className="shop-state grid min-h-screen place-items-center bg-ed-paper px-5 text-center text-ed-ink">
        <div className="grid gap-4">
        <p className="eyebrow">Store</p>
        <h1 className="font-display text-5xl font-black uppercase leading-none">Nothing in the store yet</h1>
        <p className="text-ed-muted">Check back soon for kit and merchandise.</p>
        </div>
      </section>
    );
  }

  const featured = products[0];
  const city = identity?.city?.trim() || "the city";
  const clubLabel = identity?.shortName?.trim() || "the club";
  const productHref = (value: string) => value.trim() || "#store-collection-title";

  return (
    <div className="store-page bg-ed-paper text-ed-ink">
      <section className="store-campaign mx-auto grid max-w-[1180px] gap-10 px-5 pb-20 pt-32 md:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] md:items-end md:px-8">
        <div className="store-campaign-copy grid gap-6">
          <span className="eyebrow">Official collection</span>
          <h1 className="text-[clamp(3.75rem,11vw,9rem)] font-black uppercase leading-[0.82]">
            Made for the match.
            <br />
            <em className="not-italic text-ed-accent">Worn for {city}.</em>
          </h1>
          <p className="max-w-xl text-xl leading-9 text-ed-muted">
            {products.length} first-team colors. One {clubLabel} badge. Built
            for every side of matchday.
          </p>
        </div>

        <a
          className="store-featured-product grid overflow-hidden bg-ed-primary text-ed-on-dark shadow-[0_28px_80px_rgba(16,16,16,0.18)]"
          href={productHref(featured.section.cta_link)}
          aria-label={featured.section.cta_label || `View ${featured.section.title}`}
        >
          <span className="store-featured-label p-5 font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">
            Featured - {KIT_LABELS[featured.variant]}
          </span>
          <span className="store-featured-image relative aspect-[4/3] overflow-hidden">
            {featured.photo ? (
              <ResilientImage
                src={featured.photo.url}
                alt={featured.section.title}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 800px) 94vw, 48vw"
                {...imageDeliveryProps("shop-photo")}
              />
            ) : (
              <span className="store-product-image-empty" aria-hidden="true" />
            )}
          </span>
          <span className="store-featured-footer flex flex-wrap items-center justify-between gap-4 p-5">
            <strong className="font-display text-3xl font-black uppercase leading-none">{featured.section.title}</strong>
            <b className="font-display text-xs font-black uppercase tracking-[0.14em]">{featured.section.cta_label || "View kit"}</b>
          </span>
        </a>
      </section>

      <section className="store-catalog mx-auto grid max-w-[1180px] gap-10 px-5 pb-28 md:px-8" aria-labelledby="store-collection-title">
        <header className="store-catalog-head flex flex-wrap items-end justify-between gap-5 border-b border-[color:var(--ed-line)] pb-6">
          <div>
            <span className="eyebrow">First-team kits</span>
            <h2 className="mt-4 font-display text-5xl font-black uppercase leading-none" id="store-collection-title">Choose your colors.</h2>
          </div>
          <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-muted">{products.length} official jerseys - current collection</p>
        </header>

        <div className="store-product-grid grid gap-5 md:grid-cols-3">
          {products.map((product, index) => (
            <a
              key={product.variant}
              className="store-product-card grid overflow-hidden border border-[color:var(--ed-line)] bg-ed-panel-glass"
              data-kit={index + 1}
              href={productHref(product.section.cta_link)}
              aria-label={product.section.cta_label || `View ${product.section.title}`}
            >
              <span className="store-product-type p-5 font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">{KIT_LABELS[product.variant]}</span>
              <span className="store-product-image relative aspect-[4/5] overflow-hidden bg-ed-ink-ghost">
                {product.photo ? (
                  <ResilientImage
                    src={product.photo.url}
                    alt={product.section.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 700px) 88vw, 32vw"
                    {...imageDeliveryProps("shop-photo")}
                  />
                ) : (
                  <span className="store-product-image-empty" aria-hidden="true" />
                )}
              </span>
              <span className="store-product-info grid gap-4 p-5">
                <span>
                  <small className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Official first-team jersey</small>
                  <strong className="mt-2 block font-display text-3xl font-black uppercase leading-none">{product.section.title}</strong>
                </span>
                <b className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-accent">{product.section.cta_label || "View kit"}</b>
              </span>
            </a>
          ))}
        </div>

        <div className="store-service-strip grid gap-4 border-y border-[color:var(--ed-line)] py-6 md:grid-cols-3" aria-label="Store information">
          <p className="grid gap-1">
            <small className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Details</small>
            <strong className="font-display text-xl font-black uppercase leading-tight">{featured.bulletPoints[0] || "Official first-team collection"}</strong>
          </p>
          <p className="grid gap-1">
            <small className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Collection</small>
            <strong className="font-display text-xl font-black uppercase leading-tight">{clubLabel}</strong>
          </p>
          <p className="grid gap-1">
            <small className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Ordering</small>
            <strong className="font-display text-xl font-black uppercase leading-tight">{featured.storeNote || featured.section.cta_label}</strong>
          </p>
        </div>
      </section>
    </div>
  );
}
