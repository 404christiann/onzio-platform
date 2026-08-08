"use client";

export const dynamic = "force-dynamic";

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

gsap.registerPlugin(ScrollTrigger);

export default function ShopPage() {
  const club = useClubContext();
  const [selectedKitVariant, setSelectedKitVariant] =
    useState<ShopKitVariant>("home");

  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseShopPage />;
  // academy@1 uses the mockup's compact split layout (Front/Back pill
  // toggle, no photo strip / purchase-details cards / closing band).
  if (club.presentationTemplateKey === "academy@1") return <AcademyShopPage />;

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
