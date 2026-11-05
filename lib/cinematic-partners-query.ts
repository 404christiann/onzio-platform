import type { supabase } from "@/lib/supabase";
import { mediaAssetUrl } from "@/lib/media-assets";
import { cinematicPartnersContentSchema, type CinematicPartnersContent } from "@/lib/cinematic-partners-content";

export type PublicCinematicPartners = { content: CinematicPartnersContent; logoUrls: Record<string, string> };

/** Both Partners pages for one tenant, or null when the owner has never saved them. */
export async function fetchCinematicPartners(clubId: string, client: typeof supabase): Promise<PublicCinematicPartners | null> {
  const [page, rows] = await Promise.all([
    client.from("cinematic_partners_content").select("content").eq("club_id", clubId).maybeSingle(),
    client.from("cinematic_partners").select("id,name,role,logo_media_asset_id,logo_tone").eq("club_id", clubId).order("sort_order"),
  ]);
  if (page.error) throw new Error(`fetchCinematicPartners: ${page.error.message}`);
  if (!page.data) return null;
  if (rows.error) throw new Error(`fetchCinematicPartners rows: ${rows.error.message}`);
  const content = cinematicPartnersContentSchema.parse({
    pages: (page.data.content as { pages: unknown }).pages,
    partners: (rows.data ?? []).map(row => ({ id: row.id, name: row.name, role: row.role, logoAssetId: row.logo_media_asset_id, tone: row.logo_tone })),
  });
  const ids = content.partners.map(row => row.logoAssetId).filter((id): id is string => Boolean(id));
  const logoUrls: Record<string, string> = {};
  if (ids.length) {
    const assets = await client.from("media_assets").select("id,storage_bucket,storage_path")
      .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids);
    if (assets.error) throw new Error(`fetchCinematicPartners media: ${assets.error.message}`);
    for (const asset of assets.data ?? []) if (asset.storage_bucket === "onzio-media") logoUrls[asset.id] = mediaAssetUrl(asset);
  }
  return { content, logoUrls };
}
