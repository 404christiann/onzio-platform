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

const DETAIL_COLUMNS = ["detail_1_media_asset_id", "detail_2_media_asset_id", "detail_3_media_asset_id", "detail_4_media_asset_id", "detail_5_media_asset_id", "detail_6_media_asset_id"] as const;

/** Read the club's own settings, published map and detail photos; never trust a stored URL. */
export async function fetchCinematicShopContent(clubId: string): Promise<CinematicShopPresentation> {
  if (!clubId) throw new Error("Shop requires a resolved club.");
  const { data, error } = await supabase.from("cinematic_shop_content")
    .select(["content", "map_media_asset_id", ...DETAIL_COLUMNS].join(",")).eq("club_id", clubId).maybeSingle();
  if (error) throw new Error("Could not load Shop page sections.");
  if (!data) return { ...EMPTY_CINEMATIC_SHOP_CONTENT };
  const row = data as unknown as Record<string, unknown> & { content: Record<string, unknown>; map_media_asset_id: string | null };
  const stored = Array.isArray(row.content.details) ? row.content.details as Record<string, unknown>[] : [];
  const content = cinematicShopContentSchema.parse({
    ...row.content, mapAssetId: row.map_media_asset_id,
    ...(Array.isArray(row.content.details) ? { details: stored.map((detail, i) => ({ ...detail, assetId: (row[DETAIL_COLUMNS[i]] as string | null | undefined) ?? null })) } : {}),
  });
  const ids = [content.mapAssetId, ...content.details.map(detail => detail.assetId)].filter((id): id is string => Boolean(id));
  const assets = new Map<string, { storage_bucket: string; storage_path: string; width: number | null; height: number | null }>();
  if (ids.length) {
    const result = await supabase.from("media_assets").select("id,storage_bucket,storage_path,width,height")
      .eq("club_id", clubId).in("id", ids).eq("status", "published").is("deleted_at", null);
    if (result.error) throw new Error("Could not load Shop images.");
    for (const asset of result.data ?? []) if (asset.storage_bucket === "onzio-media") assets.set(asset.id, asset);
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = (id: string | null) => {
    const asset = id ? assets.get(id) : undefined;
    return asset && base ? `${base}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : "";
  };
  const size = (id: string | null) => { const asset = id ? assets.get(id) : undefined; return { width: asset?.width ?? undefined, height: asset?.height ?? undefined }; };
  return {
    ...content,
    mapUrl: url(content.mapAssetId), mapWidth: size(content.mapAssetId).width, mapHeight: size(content.mapAssetId).height,
    details: content.details.map(detail => ({ ...detail, url: url(detail.assetId), ...size(detail.assetId) })),
  };
}
