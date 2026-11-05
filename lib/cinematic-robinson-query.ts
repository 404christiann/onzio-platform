import {
  ROBINSON_IMAGE_SLOTS, hydrateRobinsonContent, robinsonContentSchema,
  type RobinsonContent, type RobinsonImageSlot, type RobinsonPageContent, type RobinsonSnapshot,
} from "@/lib/cinematic-robinson-content";
import type { supabase } from "@/lib/supabase";

/** Tenant FK column holding each image slot's identity. Mirrors onzio_private.robinson_images. */
export const ROBINSON_IMAGE_COLUMNS: Record<RobinsonImageSlot, string> = {
  seating: "seating_media_asset_id", lockers: "lockers_media_asset_id", mealPass: "meal_pass_media_asset_id",
  step1: "step_1_media_asset_id", step2: "step_2_media_asset_id", step3: "step_3_media_asset_id",
  bus: "bus_media_asset_id", routeMap: "route_map_media_asset_id", partner: "partner_media_asset_id",
};

/** The caller supplies the trusted tenant's server onzio client. */
export async function fetchRobinsonContent(clubId: string, client: typeof supabase): Promise<RobinsonPageContent> {
  const { data, error } = await client.from("cinematic_robinson_content").select("*").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error("Unable to load Robinson Stadium content.");
  if (!data) return hydrateRobinsonContent(null, []);
  // Stored JSON keeps descriptions only; authoritative identities live in tenant FK columns.
  const row = data as unknown as Record<string, unknown> & { content: RobinsonContent };
  const content = robinsonContentSchema.parse({ ...row.content, images: Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot =>
    [slot, { ...row.content.images[slot], assetId: row[ROBINSON_IMAGE_COLUMNS[slot]] ?? null }])) });
  const ids = [...new Set(ROBINSON_IMAGE_SLOTS.map(slot => content.images[slot].assetId).filter((id): id is string => !!id))];
  const assets = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error("Unable to load Robinson Stadium images.");
  return hydrateRobinsonContent(content, (assets.data ?? []) as RobinsonSnapshot["media"]);
}
