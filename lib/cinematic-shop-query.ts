import { supabase } from "@/lib/supabase";
import { cinematicShopContentSchema, EMPTY_CINEMATIC_SHOP_CONTENT, type CinematicShopPresentation } from "@/lib/cinematic-shop-content";
import { shopPurchaseSchema } from "@/lib/shop-editor/contract";
import type { DBShopPurchaseDetails } from "@/lib/db-types";

/** Preserve intentionally blank/removed cards; legacy normalizers supply defaults. */
export async function fetchCinematicShopPurchase(clubId: string): Promise<DBShopPurchaseDetails | null> {
  if (!clubId) throw new Error("Shop requires a resolved club.");
  const result = await supabase.from("shop_purchase_details")
    .select("heading,cards,cta_eyebrow,cta_text,cta_label,cta_link,updated_at").eq("club_id", clubId).maybeSingle();
  if (result.error) throw new Error("Could not load jersey details.");
  if (!result.data) return null;
  const { updated_at, ...fields } = result.data;
  return { id: 1, ...shopPurchaseSchema.parse(fields), updated_at };
}

/** Read the club's own settings and published map; never trust a stored URL. */
export async function fetchCinematicShopContent(clubId: string): Promise<CinematicShopPresentation> {
  if (!clubId) throw new Error("Shop requires a resolved club.");
  const { data, error } = await supabase.from("cinematic_shop_content")
    .select("content,map_media_asset_id").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error("Could not load Shop page sections.");
  if (!data) return { ...EMPTY_CINEMATIC_SHOP_CONTENT };
  const content = cinematicShopContentSchema.parse({ ...(data.content as Record<string, unknown>), mapAssetId: data.map_media_asset_id });
  if (!content.mapAssetId) return { ...content, mapUrl: "" };
  const asset = await supabase.from("media_assets").select("storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("id", content.mapAssetId).eq("status", "published").is("deleted_at", null).maybeSingle();
  if (asset.error) throw new Error("Could not load Shop map.");
  if (!asset.data || asset.data.storage_bucket !== "onzio-media") return { ...content, mapUrl: "" };
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const path = asset.data.storage_path.split("/").map(encodeURIComponent).join("/");
  return { ...content, mapUrl: base ? `${base}/storage/v1/object/public/onzio-media/${path}` : "", mapWidth: asset.data.width, mapHeight: asset.data.height };
}
