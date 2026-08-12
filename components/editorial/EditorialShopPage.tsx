"use client";

import { useEffect, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import {
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
} from "@/lib/shop-kit";
import { useClubId } from "@/components/ClubContextProvider";

const VIEW_LABELS = ["Front", "Back"] as const;

// Splits an admin bullet like "Available item: Match Jersey" into a
// label/value pair for the detail dl grid; bullets without a colon render
// label-only. Mirrors AcademyShopPage.tsx's splitBullet -- duplicated here
// rather than imported since AcademyShopPage.tsx is out of scope to touch
// and this helper is presentational, not shared data logic.
function splitBullet(bullet: string): { label: string; value: string } {
  const index = bullet.indexOf(":");
  if (index === -1) return { label: bullet, value: "" };
  return {
    label: bullet.slice(0, index).trim(),
    value: bullet.slice(index + 1).trim(),
  };
}

/**
 * Editorial store page (editorial@1's /shop), rendered only when the
 * operator has switched onzio.clubs.store_enabled on for this club --
 * app/(public)/shop/page.tsx gates the route itself with notFound() before
 * this ever mounts, and EditorialHeader already hides the "Store" nav item
 * when the flag is off.
 *
 * Structurally follows components/AcademyShopPage.tsx: a self-fetching
 * client component that reads fetchShopKitVariants("shop", clubId) for the
 * "home" kit variant, offers a Front/Back photo toggle when two photos
 * exist (a single photo when there's one, a quiet empty state when there
 * are none), and derives detail columns from bullet_points plus an order
 * CTA from store_note/cta_label/cta_link via lib/shop-kit.ts's existing
 * normalizers. Styled from editorial's own CSS custom properties
 * (styles/editorial.css, scoped under [data-site-template="editorial"])
 * with plain semantic classes -- no Tailwind utility classes and no
 * hardcoded navy/red hex values, unlike AcademyShopPage.tsx -- matching
 * every other component under components/editorial/.
 */
export default function EditorialShopPage() {
  const clubId = useClubId();
  const [content, setContent] = useState<ShopKitContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchShopKitVariants("shop", clubId)
      .then((variants) => {
        if (!cancelled) setContent(variants.home);
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

  const section = content?.section ?? null;
  const photos = (content?.photos ?? [])
    .filter((photo) => photo.url.trim().length > 0)
    .slice(0, VIEW_LABELS.length);

  if (!section) {
    return (
      <section className="shop-state">
        <p className="eyebrow">Store</p>
        <h1>Nothing in the store yet</h1>
        <p>Check back soon for kit and merchandise.</p>
      </section>
    );
  }

  const bulletPoints = normalizeKitBulletPoints(section.bullet_points);
  const storeNote = normalizeKitStoreNote(section.store_note).trim();
  const detailPairs = bulletPoints.map(splitBullet);
  const hasCta =
    section.cta_link.trim().length > 0 && section.cta_label.trim().length > 0;

  return (
    <section className="shop-kit">
      <div className="shop-kit-visual" data-empty={photos.length === 0}>
        {photos.length > 0 ? (
          <>
            {photos.map((photo, index) => (
              <ResilientImage
                key={photo.id}
                src={photo.url}
                alt={
                  activeView === index
                    ? `${VIEW_LABELS[index]} of the ${section.title}`
                    : ""
                }
                fill
                priority={index === 0}
                sizes="(max-width: 1023px) 100vw, 54vw"
                className={`shop-kit-photo${activeView === index ? " is-active" : ""}`}
                {...imageDeliveryProps("shop-photo")}
              />
            ))}
            {photos.length > 1 && (
              <div
                className="shop-kit-toggle"
                role="group"
                aria-label="Choose jersey view"
              >
                {photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    aria-pressed={activeView === index}
                    data-active={activeView === index}
                    onClick={() => setActiveView(index)}
                  >
                    {VIEW_LABELS[index]}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="shop-kit-photo-empty" aria-hidden="true" />
        )}
      </div>

      <div className="shop-kit-details">
        {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
        <h1>{section.title}</h1>
        {section.description && (
          <p className="shop-kit-description">{section.description}</p>
        )}

        {detailPairs.length > 0 && (
          <dl className="shop-kit-bullets">
            {detailPairs.map((pair) => (
              <div key={pair.label}>
                <dt>{pair.label}</dt>
                <dd>{pair.value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}

        {storeNote && <p className="shop-kit-note">{storeNote}</p>}

        {hasCta && (
          <a className="shop-kit-cta" href={section.cta_link}>
            {section.cta_label}
          </a>
        )}
      </div>
    </section>
  );
}
