import { STADIUM_ARTWORK_SLOTS, hydrateStadiumContent, stadiumContentSchema, type StadiumContent, type StadiumPageContent, type StadiumSnapshot } from "@/lib/stadium-content";
import type { supabase } from "@/lib/supabase";

/** The caller supplies the trusted tenant's server onzio client. */
export async function fetchStadiumContent(clubId: string, client: typeof supabase): Promise<StadiumPageContent> {
  const { data, error } = await client.from("cinematic_stadium_content").select("*").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error("Unable to load Stadium content.");
  if (!data) return hydrateStadiumContent(null, []);
  // Persisted JSON contains descriptions; authoritative identities live in tenant FKs.
  const stored = data.content as unknown as StadiumContent;
  const content = stadiumContentSchema.parse({ ...stored, artwork: {
    bus: { ...stored.artwork.bus, assetId: data.bus_media_asset_id },
    map: { ...stored.artwork.map, assetId: data.map_media_asset_id },
    partner: { ...stored.artwork.partner, assetId: data.partner_media_asset_id },
  } });
  const ids = STADIUM_ARTWORK_SLOTS.map(slot => content.artwork[slot].assetId).filter((id): id is string => !!id);
  const assets = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error("Unable to load Stadium artwork.");
  return hydrateStadiumContent(content, (assets.data ?? []) as StadiumSnapshot["media"]);
}
