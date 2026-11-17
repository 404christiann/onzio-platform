"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchShopKitVariants, fetchShopCarouselPhotos, fetchSiteSponsorLogos } from "@/lib/queries";
import { fetchCinematicShopContent, fetchCinematicShopPurchase } from "@/lib/cinematic-shop-query";
import CinematicShop, { type CinematicShopProps } from "./CinematicShop";
import { useCinematicContent } from "./CinematicContent";

type Content = Omit<CinematicShopProps, "treatments" | "selectedVariant" | "onVariantChange" | "editing">;

export default function CinematicShopPage() {
  const club = useClubContext();
  const { content: shell } = useCinematicContent();
  const [state, setState] = useState<{ clubId: string; content: Content | null; failed: boolean }>({ clubId: club.id, content: null, failed: false });
  useEffect(() => {
    let active = true;
    setState({ clubId: club.id, content: null, failed: false });
    void Promise.all([
      fetchShopKitVariants("shop", club.id), fetchShopCarouselPhotos("home", club.id),
      fetchShopCarouselPhotos("away", club.id), fetchShopCarouselPhotos("third", club.id), fetchCinematicShopPurchase(club.id),
      fetchCinematicShopContent(club.id), fetchSiteSponsorLogos("carousel", club.id),
    ]).then(([kits, home, away, third, purchase, presentation, sponsors]) => {
      if (active) setState({ clubId: club.id, content: { kits, photoRows: { home, away, third }, purchase, presentation, sponsors }, failed: false });
    }).catch(() => { if (active) setState({ clubId: club.id, content: null, failed: true }); });
    return () => { active = false; };
  }, [club.id]);
  const current = state.clubId === club.id ? state : null;
  if (!current?.content) return <p role="status" className="shop-empty-message">{current?.failed ? "Shop is temporarily unavailable. Please try again." : "Loading shop…"}</p>;
  return <CinematicShop {...current.content} treatments={shell?.presentation.sponsorTreatments ?? {}} />;
}
