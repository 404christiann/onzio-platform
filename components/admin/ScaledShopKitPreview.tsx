"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import ShopKitSection from "@/components/ShopKitSection";
import ResilientImage from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type {
  DBShopKitPhoto,
  DBShopKitSection,
} from "@/lib/db-types";
// Side-effect import: editorial.css's rules are scoped under
// [data-site-template="editorial"] and are normally only pulled into the
// bundle by components/editorial/EditorialShell.tsx, which the admin app
// never mounts. The editorial branch below renders that same markup, so the
// stylesheet has to be imported here directly or it would render unstyled.
import "@/styles/editorial.css";

const DESKTOP_PREVIEW_WIDTH = 1700;

// Mirrors EditorialShell.tsx's own fallback constants (components/editorial/
// EditorialShell.tsx), used there until its async fetchClubThemeColors call
// resolves. The admin preview never makes that call, so it stays on these
// fallbacks whenever a club hasn't set its own colors -- the same state a
// visitor briefly sees on first paint.
const EDITORIAL_DEFAULT_PRIMARY = "#1B2958";
const EDITORIAL_DEFAULT_SECONDARY = "#AD3234";

interface ScaledShopKitPreviewProps {
  section: DBShopKitSection;
  photos: DBShopKitPhoto[];
}

/**
 * Preview for the single kit product view that components/editorial/
 * EditorialShopPage.tsx renders for whichever variant is selected in its
 * tabs. Reproduces that component's markup/classNames directly (rather than
 * rendering EditorialShopPage itself) because that page always self-fetches
 * its own three variants via fetchShopKitVariants and has no way to accept
 * this admin screen's unsaved draft section/photos as props.
 *
 * Notably different from the generic ShopKitSection this replaces: no
 * bullet points, no store note, and the CTA button's label is always "Shop
 * with our vendor" -- cta_label is never read on the real page.
 */
function EditorialShopKitProductPreview({
  section,
  photos,
  primaryColor,
  secondaryColor,
}: {
  section: DBShopKitSection;
  photos: DBShopKitPhoto[];
  primaryColor: string;
  secondaryColor: string;
}) {
  const photo = photos.find((item) => item.url.trim().length > 0) ?? null;
  const productHref = section.cta_link.trim() || "#store-product";

  return (
    <div
      data-site-template="editorial"
      style={
        {
          "--club-primary": primaryColor,
          "--club-secondary": secondaryColor,
          "--club-accent": secondaryColor,
          background: "var(--panel)",
          padding: "clamp(32px, 4vw, 56px) var(--pad-x)",
        } as CSSProperties
      }
    >
      <div className="store-product">
        <div className="store-product-visual">
          <div className="store-product-image">
            {photo ? (
              <ResilientImage
                src={photo.url}
                alt={section.title}
                fill
                sizes="(max-width: 1120px) 100vw, 62vw"
                {...imageDeliveryProps("shop-photo")}
              />
            ) : (
              <span className="store-product-image-empty" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="store-product-details">
          <h2>{section.title}</h2>
          <p className="store-product-description">{section.description}</p>
          <div className="store-product-action">
            <a
              className="store-vendor-button"
              href={productHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Shop ${section.title} with our vendor`}
            >
              Shop with our vendor
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScaledShopKitPreview({
  section,
  photos,
}: ScaledShopKitPreviewProps) {
  const club = useClubContext();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const nextScale = Math.min(1, frame.clientWidth / DESKTOP_PREVIEW_WIDTH);
      setScale(nextScale);
      setScaledHeight(canvas.scrollHeight * nextScale);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(canvas);
    document.fonts?.ready.then(measure);

    return () => observer.disconnect();
  }, []);

  // editorial@1's public /shop route (components/editorial/EditorialShopPage.tsx)
  // is a completely different page from the generic ShopKitSection this
  // preview otherwise renders -- see EditorialShopKitProductPreview above.
  // Its "home page kit" surface has no equivalent real single-product
  // component (components/editorial/EditorialHomeStore.tsx renders all three
  // variants behind its own tabs), so that surface keeps the generic
  // ShopKitSection preview. Every other template (clubhouse@1, academy@1,
  // and the default) is unchanged.
  const isEditorialShopSurface =
    club.presentationTemplateKey === "editorial@1" && section.surface === "shop";

  return (
    <div ref={frameRef} className="relative w-full overflow-hidden">
      <div
        style={{
          position: "relative",
          width: DESKTOP_PREVIEW_WIDTH * scale,
          height: scaledHeight || undefined,
          margin: "0 auto",
        }}
      >
        <div
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: DESKTOP_PREVIEW_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {isEditorialShopSurface ? (
            <EditorialShopKitProductPreview
              section={section}
              photos={photos}
              primaryColor={club.primaryColor ?? EDITORIAL_DEFAULT_PRIMARY}
              secondaryColor={club.secondaryColor ?? EDITORIAL_DEFAULT_SECONDARY}
            />
          ) : (
            <ShopKitSection
              animate={false}
              section={section}
              photos={photos}
            />
          )}
        </div>
      </div>
    </div>
  );
}
