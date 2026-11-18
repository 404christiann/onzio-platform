"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import CinematicShop from "@/components/cinematic/CinematicShop";
import { useCinematicContent } from "@/components/cinematic/CinematicContent";
import { fetchSiteSponsorLogos, type ShopKitContent } from "@/lib/queries";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { publicPhotoRow, publicPurchase, type ShopPageDraft } from "@/lib/shop-editor/model";
import type { ShopVariant } from "@/lib/shop-editor/contract";

export default function CinematicShopCanvas({ kits, draft, variant, onVariantChange }: {
  kits: Record<ShopVariant, ShopKitContent>; draft: ShopPageDraft; variant: ShopVariant;
  onVariantChange: (variant: ShopVariant) => void;
}) {
  const club = useClubContext();
  const { content } = useCinematicContent();
  const [logos, setLogos] = useState<{ clubId: string; rows: DBSiteSponsorLogo[] }>({ clubId: club.id, rows: [] });
  useEffect(() => {
    let active = true;
    void fetchSiteSponsorLogos("carousel", club.id).then(rows => { if (active) setLogos({ clubId: club.id, rows }); }).catch(() => { if (active) setLogos({ clubId: club.id, rows: [] }); });
    return () => { active = false; };
  }, [club.id]);
  return <CinematicShop kits={kits} photoRows={{
    home: publicPhotoRow(draft.photoRows.home, "home"),
    away: publicPhotoRow(draft.photoRows.away, "away"),
    third: publicPhotoRow(draft.photoRows.third, "third"),
  }} purchase={publicPurchase(draft.purchase)} presentation={draft.presentation}
    sponsors={logos.clubId === club.id ? logos.rows : []}
    treatments={content?.presentation.sponsorTreatments ?? {}} selectedVariant={variant}
    onVariantChange={onVariantChange} editing />;
}
