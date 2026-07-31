"use client";

export const dynamic = "force-dynamic";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import nextDynamic from "next/dynamic";
import { useState } from "react";
import { SHOW_SHOP_HERO } from "@/lib/site-flags";
import ShopKitSectionContainer from "@/components/ShopKitSectionContainer";
import ShopPhotoStripContainer from "@/components/ShopPhotoStripContainer";
import ShopPurchaseDetailsContainer from "@/components/ShopPurchaseDetailsContainer";
import type { ShopKitVariant } from "@/lib/db-types";
import { useClubContext } from "@/components/ClubContextProvider";
import ClubhouseShopPage from "@/components/ClubhouseShopPage";

const ShopHero = nextDynamic(() => import("@/components/ShopHero"), {
  ssr: false,
});

gsap.registerPlugin(ScrollTrigger);

export default function ShopPage() {
  const club = useClubContext();
  const [selectedKitVariant, setSelectedKitVariant] =
    useState<ShopKitVariant>("home");

  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseShopPage />;

  return (
    <div className={SHOW_SHOP_HERO ? "pt-20 sm:pt-0" : "pt-24 sm:pt-28"} style={{ backgroundColor: "var(--color-white)" }}>

      {/* ── Cinematic hero slideshow ── */}
      {SHOW_SHOP_HERO && club.slug === "rose-city" && <ShopHero />}

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
