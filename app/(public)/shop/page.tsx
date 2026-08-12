"use client";

export const dynamic = "force-dynamic";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import nextDynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { useState } from "react";
import { SHOW_SHOP_HERO } from "@/lib/site-flags";
import ShopKitSectionContainer from "@/components/ShopKitSectionContainer";
import ShopPhotoStripContainer from "@/components/ShopPhotoStripContainer";
import ShopPurchaseDetailsContainer from "@/components/ShopPurchaseDetailsContainer";
import type { ShopKitVariant } from "@/lib/db-types";
import { useClubContext } from "@/components/ClubContextProvider";
import { clubHasFeature } from "@/lib/club-features";

const ShopHero = nextDynamic(() => import("@/components/ShopHero"), {
  ssr: false,
});

gsap.registerPlugin(ScrollTrigger);

export default function ShopPage() {
  const club = useClubContext();
  const [selectedKitVariant, setSelectedKitVariant] =
    useState<ShopKitVariant>("home");

  // Shop is a Pro-only feature platform-wide (lib/club-features.ts). This
  // gates both templates the same way, not just the classic Nav link — a
  // direct URL visit from a Starter tenant (e.g. Bravo) must also 404,
  // matching the clean not-found behavior every other tier-gated Onzio
  // surface already uses instead of a silent/broken render.
  if (!clubHasFeature(club.tier, "shop")) {
    notFound();
  }

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
