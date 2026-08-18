"use client";

import { type KeyboardEvent, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayMerchColor = "orange" | "black";

export type PathwayMerchVariant = {
  id: string;
  label: string;
  color: PathwayMerchColor;
  title: string;
  description: string;
  image: {
    src: string;
    alt: string;
  };
  cta: {
    label: string;
    href: string;
  };
};

export type PathwayMerchCollection = {
  id: string;
  eyebrow: string;
  heading: string;
  intro: string;
  variants: PathwayMerchVariant[];
};

export type PathwayMerchMentality = {
  heading: string;
  body: string;
  image: {
    src: string;
    alt: string;
  };
};

export type PathwayMerchStoreProps = {
  collectionLabel: string;
  heading: string;
  intro: string;
  collections: PathwayMerchCollection[];
  note: string;
  mentality: PathwayMerchMentality;
};

function PathwayMerchCollectionPanel({
  collection,
  priority,
  primary,
}: {
  collection: PathwayMerchCollection;
  priority: boolean;
  primary: boolean;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(
    collection.variants[0]?.id ?? "",
  );
  const selectedVariant =
    collection.variants.find((variant) => variant.id === selectedVariantId) ??
    collection.variants[0];

  if (!selectedVariant) return null;

  const tabPanelId = `pathway-merch-${collection.id}-panel`;
  const selectAdjacentVariant = (
    event: KeyboardEvent<HTMLButtonElement>,
    variantId: string,
  ) => {
    const currentIndex = collection.variants.findIndex(
      (variant) => variant.id === variantId,
    );
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % collection.variants.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + collection.variants.length) %
        collection.variants.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = collection.variants.length - 1;
    }

    if (nextIndex === null) return;

    const nextVariant = collection.variants[nextIndex];
    if (!nextVariant) return;

    event.preventDefault();
    setSelectedVariantId(nextVariant.id);
    document
      .getElementById(
        `pathway-merch-${collection.id}-${nextVariant.id}-tab`,
      )
      ?.focus();
  };

  return (
    <section
      className="pathway-merch-collection"
      aria-labelledby={primary ? "pathway-merch-page-heading" : `${collection.id}-heading`}
    >
      <header className="pathway-merch-collection-head">
        {!primary && (
          <>
            <span className="pathway-merch-eyebrow">{collection.eyebrow}</span>
            <h2 id={`${collection.id}-heading`}>{collection.heading}</h2>
            <p>{collection.intro}</p>
          </>
        )}

        <div
          className="pathway-merch-tabs"
          role="tablist"
          aria-label={`Choose a ${collection.eyebrow.toLowerCase()} color`}
        >
          {collection.variants.map((variant) => (
            <button
              id={`pathway-merch-${collection.id}-${variant.id}-tab`}
              className="pathway-merch-tab"
              type="button"
              role="tab"
              aria-selected={variant.id === selectedVariant.id}
              aria-controls={tabPanelId}
              tabIndex={variant.id === selectedVariant.id ? 0 : -1}
              onClick={() => setSelectedVariantId(variant.id)}
              onKeyDown={(event) => selectAdjacentVariant(event, variant.id)}
              key={variant.id}
            >
              {variant.label}
            </button>
          ))}
        </div>
      </header>

      <div
        id={tabPanelId}
        className="pathway-merch-product"
        role="tabpanel"
        aria-labelledby={`pathway-merch-${collection.id}-${selectedVariant.id}-tab`}
        aria-live="polite"
      >
        <div className="pathway-merch-visual">
          <div className="pathway-merch-image">
            <ResilientImage
              key={selectedVariant.id}
              src={selectedVariant.image.src}
              alt={selectedVariant.image.alt}
              fill
              priority={priority}
              sizes="(max-width: 900px) 100vw, 62vw"
              fallback={
                <PathwayImageFallback
                  className="pathway-merch-image-fallback"
                  label={`${selectedVariant.title} image unavailable`}
                />
              }
              {...imageDeliveryProps("shop-photo")}
            />
          </div>
        </div>

        <div className="pathway-merch-details">
          <span className="pathway-merch-color-label">
            {selectedVariant.label} colorway
          </span>
          <h3>{selectedVariant.title}</h3>
          <p>{selectedVariant.description}</p>
          <div className="pathway-merch-action">
            <a
              href={selectedVariant.cta.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buy ${selectedVariant.title} from DIAZA (opens in a new tab)`}
            >
              {selectedVariant.cta.label}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A pathway-native translation of the platform's approved single-product
 * store rhythm. Each real collection owns its color selector and one large
 * front/back product image; no price or checkout affordance is invented.
 */
export default function PathwayMerchStore({
  collectionLabel,
  heading,
  intro,
  collections,
  note,
  mentality,
}: PathwayMerchStoreProps) {
  if (collections.length === 0) return null;

  return (
    <main className="pathway-merch-page">
      <header className="pathway-merch-page-head">
        <span className="pathway-merch-collection-label">{collectionLabel}</span>
        <h1 id="pathway-merch-page-heading">{heading}</h1>
        <p>{intro}</p>
      </header>

      <div className="pathway-merch-collections">
        {collections.map((collection, index) => (
          <PathwayMerchCollectionPanel
            collection={collection}
            priority={index === 0}
            primary={index === 0}
            key={collection.id}
          />
        ))}
      </div>

      <p className="pathway-merch-note">{note}</p>

      <section
        className="pathway-merch-mentality"
        aria-labelledby="pathway-merch-mentality-heading"
      >
        <div className="pathway-merch-mentality-copy">
          <h2 id="pathway-merch-mentality-heading">{mentality.heading}</h2>
          <p>{mentality.body}</p>
        </div>

        <div className="pathway-merch-mentality-mark">
          <ResilientImage
            src={mentality.image.src}
            alt={mentality.image.alt}
            fill
            sizes="(max-width: 760px) 84vw, 42vw"
            fallback={
              <PathwayImageFallback
                className="pathway-merch-mentality-fallback"
                label="DIAZA logo unavailable"
              />
            }
            {...imageDeliveryProps("small-graphic")}
          />
        </div>
      </section>
    </main>
  );
}
