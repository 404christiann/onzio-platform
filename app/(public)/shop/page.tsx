"use client";

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useState } from "react";
import ShopKitSectionContainer from "@/components/ShopKitSectionContainer";
import ShopPhotoStripContainer from "@/components/ShopPhotoStripContainer";
import ShopPurchaseDetailsContainer from "@/components/ShopPurchaseDetailsContainer";
import type { ShopKitVariant } from "@/lib/db-types";
import { useClubContext } from "@/components/ClubContextProvider";
import ClubhouseShopPage from "@/components/ClubhouseShopPage";
import AcademyShopPage from "@/components/AcademyShopPage";
import EditorialShopPage from "@/components/editorial/EditorialShopPage";

gsap.registerPlugin(ScrollTrigger);

export default function ShopPage() {
  const club = useClubContext();
  const [selectedKitVariant, setSelectedKitVariant] =
    useState<ShopKitVariant>("home");

  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseShopPage />;
  // academy@1 uses the mockup's compact split layout (Front/Back pill
  // toggle, no photo strip / purchase-details cards / closing band).
  if (club.presentationTemplateKey === "academy@1") return <AcademyShopPage />;
  if (club.presentationTemplateKey === "editorial@1") {
    // Operator-only toggle (onzio.clubs.store_enabled, Lions E1). The nav
    // already omits the "Store" link when this is off (EditorialHeader,
    // Lions E3), but a directly-typed /shop URL must still be gated -- same
    // notFound() convention every other template-unsupported route in this
    // app uses (see app/%5Fclubs/[slug]/contact|tryouts|programs/page.tsx).
    if (!club.storeEnabled) return notFound();
    return <EditorialShopPage />;
  }
  if (club.presentationTemplateKey === "crest@1") {
    // CV United C1 shop scope: a kit/merch showcase page (photos, a kit
    // variant toggle, purchase-details info) -- not real e-commerce. Same
    // operator-only toggle and gating convention as editorial@1 above:
    // crestNavLinks (components/Nav.tsx) already omits the Shop link when
    // this is off, but a directly-typed /shop URL must still 404.
    if (!club.storeEnabled) return notFound();
    return (
      <div
        className="crest-home pt-24 sm:pt-28"
        style={{
          backgroundColor: "var(--crest-surface-canvas)",
          // The shared Shop* components below read the platform's base
          // --color-* tokens (Rose City red/black) -- crest@1 deliberately
          // never remaps those globally (see the [data-font-pack="crest"]
          // comment in styles/globals.css), so used as-is they'd render a
          // bright red CTA/eyebrow/bullets that clash with crest@1's
          // navy/gold identity. Alias them here, scoped to this wrapper
          // only, to the exact hex values already established in
          // `.crest-home` -- no new tokens invented, and no other crest@1
          // route or other template is touched.
          ["--color-white" as string]: "var(--crest-surface-canvas)",
          ["--color-black" as string]: "var(--crest-surface-inverse)",
          ["--color-red" as string]: "var(--crest-action-primary)",
          ["--color-red-dark" as string]: "var(--crest-action-primary-hover)",
          ["--color-gray-mid" as string]: "var(--crest-text-muted)",
        } as React.CSSProperties}
      >
        <ShopKitSectionContainer
          surface="shop"
          headingTag="h1"
          fadeImageToWhite
          selectedVariant={selectedKitVariant}
          onVariantChange={setSelectedKitVariant}
        />

        <ShopPhotoStripContainer variant={selectedKitVariant} />

        <ShopPurchaseDetailsContainer />
      </div>
    );
  }

  return (
    <div className="pt-24 sm:pt-28" style={{ backgroundColor: "var(--color-white)" }}>

      <ShopKitSectionContainer
        surface="shop"
        headingTag="h1"
        fadeImageToWhite
        selectedVariant={selectedKitVariant}
        onVariantChange={setSelectedKitVariant}
      />

      <ShopPhotoStripContainer variant={selectedKitVariant} />

      <ShopPurchaseDetailsContainer />
    </div>
  );
}
