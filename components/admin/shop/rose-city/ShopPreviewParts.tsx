"use client";

import { useEffect, useState } from "react";
import CinematicShop from "@/components/cinematic/CinematicShop";
import { useCinematicContent } from "@/components/cinematic/CinematicContent";
import ShopKitSectionContainer from "@/components/ShopKitSectionContainer";
import { fetchSiteSponsorLogos, type ShopKitContent } from "@/lib/queries";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { publicKit, publicPhotoRow, publicPurchase, SHOP_VARIANTS, type ShopPageDraft } from "@/lib/shop-editor/model";
import type { ShopSurface, ShopVariant } from "@/lib/shop-editor/contract";

/** The page's three kits as the public components take them (the same shape the editor always fed them). */
export function kitContentFromDraft(draft: ShopPageDraft, surface: ShopSurface): Record<ShopVariant, ShopKitContent> {
  return Object.fromEntries(SHOP_VARIANTS.map(variant => {
    const kit = draft.variants[variant];
    const content = publicKit(kit.section, kit.photos, surface, variant);
    return [variant, { section: kit.exists || kit.photos.length > 0 ? content.section : null, photos: content.photos }];
  })) as Record<ShopVariant, ShopKitContent>;
}

/** Sponsor logos are fetched once for every preview on the page. */
export function useShopSponsorLogos(clubId: string) {
  const [state, setState] = useState<{ clubId: string; rows: DBSiteSponsorLogo[] }>({ clubId, rows: [] });
  useEffect(() => {
    let active = true;
    void fetchSiteSponsorLogos("carousel", clubId).then(rows => { if (active) setState({ clubId, rows }); }).catch(() => { if (active) setState({ clubId, rows: [] }); });
    return () => { active = false; };
  }, [clubId]);
  return state.clubId === clubId ? state.rows : [];
}

/** The real public Shop page (CinematicShop), fed by the draft. Which parts show is decided by the frame's CSS. */
export function ShopPagePreview({ draft, kits, kit, sponsors }: { draft: ShopPageDraft; kits: Record<ShopVariant, ShopKitContent>; kit: ShopVariant; sponsors: DBSiteSponsorLogo[] }) {
  const { content } = useCinematicContent();
  return <CinematicShop
    kits={kits}
    photoRows={{ home: publicPhotoRow(draft.photoRows.home, "home"), away: publicPhotoRow(draft.photoRows.away, "away"), third: publicPhotoRow(draft.photoRows.third, "third") }}
    purchase={publicPurchase(draft.purchase)}
    presentation={draft.presentation}
    sponsors={sponsors}
    treatments={content?.presentation.sponsorTreatments ?? {}}
    selectedVariant={kit}
    editing
  />;
}

/** The homepage shop feature: the home kit through the public kit section, as the editor always showed it. */
export function HomeFeaturePreview({ kits, maxBulletPoints }: { kits: Record<ShopVariant, ShopKitContent>; maxBulletPoints: number }) {
  return <div style={{ backgroundColor: "var(--color-white)" }}>
    <ShopKitSectionContainer surface="home" headingTag="h2" fadeImageToWhite editorContent={kits} maxBulletPoints={maxBulletPoints} selectedVariant="home" />
  </div>;
}

/** CSS for the frame: show only the named parts of the public page. */
export const KIT_PART_CSS = `
  .shop-2027 > :not(.shop-feature):not(.shop-photo-row) { display:none !important; }
  .shop-2027 .shop-jersey-options, .shop-2027 .shop-variants, .shop-2027 .shop-empty-inline[data-shop-editor-target="editions"] { display:none !important; }
`;
export const SHARED_LEFT_CSS = `
  .shop-2027 > :not([data-shop-editor-target="details"]):not([data-shop-editor-target="purchase"]) { display:none !important; }
`;
export const SHARED_RIGHT_CSS = `
  .shop-2027 > :not([data-shop-editor-target="sizeChart"]):not([data-shop-editor-target="map"]):not([data-shop-editor-target="sponsors"]):not(.shop-map-view) { display:none !important; }
`;
