"use client";

import { useEffect, useState } from "react";
import Image from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import type { ShopKitVariant } from "@/lib/db-types";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import { imageDeliveryProps } from "@/lib/image-delivery";

type KitProduct = {
  variant: ShopKitVariant;
  content: ShopKitContent;
  imageUrl: string;
};

const kitLabels: Record<ShopKitVariant, string> = {
  home: "Home kit",
  third: "Third kit",
  away: "Away kit",
};

function productName(product: KitProduct) {
  return product.content.section?.title?.replace(/^2026\s+/i, "").trim()
    || (product.variant === "home"
      ? "Blue Jersey"
      : product.variant === "third"
        ? "Red Jersey"
        : "White Jersey");
}

export default function ClubhouseShopPage() {
  const club = useClubContext();
  const [products, setProducts] = useState<KitProduct[]>([]);
  const [selected, setSelected] = useState<KitProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShopKitVariants("shop", club.id)
      .then((contentByVariant) => {
        if (cancelled) return;
        const nextProducts = (["home", "third", "away"] as ShopKitVariant[])
          .map((variant) => {
            const content = contentByVariant[variant];
            const imageUrl = content.photos[0]?.url;
            if (!content.section || !imageUrl) return null;
            return { variant, content, imageUrl };
          })
          .filter((product): product is KitProduct => product !== null);
        setProducts(nextProducts);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load shop.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  const featured = products[0] ?? null;

  return (
    <main className="clubhouse-route-page clubhouse-store-page">
      <section className="clubhouse-store-campaign">
        <div className="clubhouse-store-campaign-copy">
          <span className="clubhouse-eyebrow">Official 2026 collection</span>
          <h1>
            Made for the match.
            <br />
            <em>Worn for Columbus.</em>
          </h1>
          <p>
            First-team colors. One Lions badge. Built for every side of
            matchday in the Capital City.
          </p>
        </div>

        {featured && (
          <button
            type="button"
            className="clubhouse-store-featured-product"
            onClick={() => {
              setSelectedSize(null);
              setSelected(featured);
            }}
            aria-label={`View ${productName(featured)} details`}
          >
            <span className="clubhouse-store-featured-label">
              Featured · {kitLabels[featured.variant]}
            </span>
            <span className="clubhouse-store-featured-image">
              <Image
                src={featured.imageUrl}
                alt={productName(featured)}
                fill
                priority
                sizes="(max-width: 800px) 94vw, 48vw"
                {...imageDeliveryProps("shop-photo")}
              />
            </span>
            <span className="clubhouse-store-featured-footer">
              <strong>{productName(featured)}</strong>
              <b>$75</b>
            </span>
          </button>
        )}
      </section>

      <section className="clubhouse-store-catalog" aria-labelledby="clubhouse-store-collection-title">
        <header className="clubhouse-store-catalog-head">
          <div>
            <span className="clubhouse-eyebrow">First-team kits</span>
            <h2 id="clubhouse-store-collection-title">Choose your colors.</h2>
          </div>
          <p>{products.length} official jerseys · 2026 season</p>
        </header>

        {loading && <div className="clubhouse-route-state">Loading collection...</div>}
        {error && !loading && <div className="clubhouse-route-state">Store unavailable.</div>}
        {!loading && !error && (
          <div className="clubhouse-store-product-grid">
            {products.map((product, index) => (
              <button
                type="button"
                key={product.variant}
                className="clubhouse-store-product-card"
                data-kit={index + 1}
                onClick={() => {
                  setSelectedSize(null);
                  setSelected(product);
                }}
              >
                <span className="clubhouse-store-product-type">
                  {kitLabels[product.variant]}
                </span>
                <span className="clubhouse-store-product-image">
                  <Image
                    src={product.imageUrl}
                    alt={productName(product)}
                    fill
                    sizes="(max-width: 700px) 88vw, 32vw"
                    {...imageDeliveryProps("shop-photo")}
                  />
                </span>
                <span className="clubhouse-store-product-info">
                  <span>
                    <small>Official 2026 jersey</small>
                    <strong>{productName(product)}</strong>
                  </span>
                  <b>$75</b>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="clubhouse-store-service-strip" aria-label="Store information">
          <p>
            <small>Sizes</small>
            <strong>Adult S-XL</strong>
          </p>
          <p>
            <small>Collection</small>
            <strong>{club.name.replace(/ Football Club$/i, " FC")}</strong>
          </p>
          <p>
            <small>Checkout</small>
            <strong>Club-owned on launch</strong>
          </p>
        </div>
      </section>

      {selected && (
        <div
          className="clubhouse-store-modal-layer"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="clubhouse-store-product-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clubhouse-store-product-title"
          >
            <button
              type="button"
              className="clubhouse-store-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close product details"
            >
              ×
            </button>
            <div className="clubhouse-store-modal-media">
              <Image
                src={selected.imageUrl}
                alt={productName(selected)}
                fill
                sizes="(max-width: 760px) 100vw, 52vw"
                {...imageDeliveryProps("shop-photo")}
              />
            </div>
            <div className="clubhouse-store-modal-copy">
              <span className="clubhouse-eyebrow">Official first-team collection</span>
              <h2 id="clubhouse-store-product-title">{productName(selected)}</h2>
              <p className="clubhouse-store-modal-price">$75</p>
              <p className="clubhouse-store-modal-description">
                The 2026 Lions jersey, finished in club colors and built to
                carry Columbus wherever matchday goes.
              </p>
              <div className="clubhouse-store-sizes">
                <span>Select size</span>
                <div>
                  {["S", "M", "L", "XL"].map((size) => (
                    <button
                      type="button"
                      key={size}
                      data-selected={selectedSize === size}
                      aria-pressed={selectedSize === size}
                      onClick={() => setSelectedSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <button className="clubhouse-disabled-checkout" disabled>
                Checkout available on the live site
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
