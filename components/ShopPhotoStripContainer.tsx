"use client";

import { useEffect, useState } from "react";
import ShopPhotoStrip from "@/components/ShopPhotoStrip";
import { fetchShopCarouselPhotos } from "@/lib/queries";
import type { DBShopCarouselPhoto, ShopKitVariant } from "@/lib/db-types";
import { useClubId } from "@/components/ClubContextProvider";

export default function ShopPhotoStripContainer({
  variant = "home",
}: {
  variant?: ShopKitVariant;
}) {
  const clubId = useClubId();
  const [photos, setPhotos] = useState<DBShopCarouselPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchShopCarouselPhotos(variant, clubId)
      .then(setPhotos)
      .catch((error) => {
        console.error("ShopPhotoStrip:", error);
      })
      .finally(() => setLoading(false));
  }, [clubId, variant]);

  if (loading) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ minHeight: "260px", backgroundColor: "var(--color-white)" }}
      >
        <p
          className="font-display font-black uppercase tracking-widest"
          style={{ color: "var(--color-gray-mid)", fontSize: "0.9rem" }}
        >
          Loading gallery…
        </p>
      </div>
    );
  }

  if (photos.length === 0) return null;

  return <ShopPhotoStrip photos={photos} />;
}
