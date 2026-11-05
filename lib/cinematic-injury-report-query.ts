import {
  cinematicInjuryReportDraftSchema, starterCinematicInjuryReportContent, type CinematicInjuryReportContent,
} from "@/lib/cinematic-injury-report-content";
import { mediaAssetUrl } from "@/lib/media-assets";
import type { supabase } from "@/lib/supabase";

type Picture = { url: string; width?: number; height?: number };
export type InjuryPlayerView = { name: string; number: number | null; position: string; photo: Picture | null };
export type InjuryEntryView = { id: string; player: InjuryPlayerView; injury: string; timeline: string; note: string };
/** The Injury Report as visitors see it. */
export type InjuryReportView = {
  page: CinematicInjuryReportContent["page"];
  presenterLogo: Picture | null;
  band: Picture | null;
  entries: InjuryEntryView[];
};

export type InjuryPlayerRow = { id: string; name: string; number: number; position: string; photo_url: string; photo_asset_id: string | null; active: boolean };
export type InjuryAsset = { id: string; storage_bucket: string; storage_path: string; width: number; height: number };

function picture(asset: InjuryAsset | undefined): Picture | null {
  if (!asset || asset.storage_bucket !== "onzio-media") return null;
  return { url: mediaAssetUrl(asset), width: asset.width, height: asset.height };
}

/**
 * Joins the saved report with the Roster. Players who are not active are left out, so an entry
 * disappears with its player. Shared by the public page and the editor preview.
 */
export function injuryReportView(
  content: CinematicInjuryReportContent, players: InjuryPlayerRow[], assets: InjuryAsset[],
): InjuryReportView {
  const byAsset = new Map(assets.map(asset => [asset.id, asset]));
  const byPlayer = new Map(players.filter(row => row.active).map(row => [row.id, row]));
  const photo = (row: InjuryPlayerRow) => (row.photo_asset_id ? picture(byAsset.get(row.photo_asset_id)) : null)
    ?? (row.photo_url ? { url: row.photo_url } : null);
  return {
    page: content.page,
    presenterLogo: content.presenterLogoAssetId ? picture(byAsset.get(content.presenterLogoAssetId)) : null,
    band: content.bandAssetId ? picture(byAsset.get(content.bandAssetId)) : null,
    entries: content.entries.flatMap(entry => {
      const row = byPlayer.get(entry.playerId);
      return row ? [{ id: entry.id, injury: entry.injury, timeline: entry.timeline, note: entry.note,
        player: { name: row.name, number: row.number, position: row.position, photo: photo(row) } }] : [];
    }),
  };
}

/** The tenant's Injury Report, or Sam's starting page when the owner has never saved it. */
export async function fetchInjuryReport(clubId: string, client: typeof supabase): Promise<InjuryReportView> {
  const [saved, rows] = await Promise.all([
    client.from("cinematic_injury_report_content").select("content,presenter_logo_media_asset_id,band_media_asset_id").eq("club_id", clubId).maybeSingle(),
    client.from("cinematic_injury_entries").select("id,player_id,injury,timeline,note,sort_order").eq("club_id", clubId).order("sort_order"),
  ]);
  if (saved.error || rows.error) throw new Error("Unable to load the Injury Report.");
  const starter = starterCinematicInjuryReportContent();
  const parsed = saved.data ? cinematicInjuryReportDraftSchema.safeParse({
    page: saved.data.content,
    presenterLogoAssetId: saved.data.presenter_logo_media_asset_id,
    bandAssetId: saved.data.band_media_asset_id,
    entries: (rows.data ?? []).map(row => ({ id: row.id, playerId: row.player_id, injury: row.injury, timeline: row.timeline, note: row.note })),
  }) : null;
  const content = parsed?.success ? parsed.data : starter;

  const playerIds = [...new Set(content.entries.map(entry => entry.playerId))];
  const players = playerIds.length ? await client.from("players").select("id,name,number,position,photo_url,photo_asset_id,active")
    .eq("club_id", clubId).eq("active", true).in("id", playerIds) : { data: [], error: null };
  if (players.error) throw new Error("Unable to load the Injury Report players.");
  const playerRows = (players.data ?? []) as InjuryPlayerRow[];
  const assetIds = [content.presenterLogoAssetId, content.bandAssetId, ...playerRows.map(row => row.photo_asset_id)]
    .filter((id): id is string => Boolean(id));
  const assets = assetIds.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", [...new Set(assetIds)]) : { data: [], error: null };
  if (assets.error) throw new Error("Unable to load the Injury Report photos.");
  return injuryReportView(content, playerRows, (assets.data ?? []) as InjuryAsset[]);
}

/** Every active Roster player with their photo media, for the editor preview. */
export async function fetchInjuryPreviewRoster(clubId: string, client: typeof supabase): Promise<{ players: InjuryPlayerRow[]; assets: InjuryAsset[] }> {
  const players = await client.from("players").select("id,name,number,position,photo_url,photo_asset_id,active").eq("club_id", clubId).eq("active", true);
  if (players.error) throw new Error("Unable to load the Roster players.");
  const rows = (players.data ?? []) as InjuryPlayerRow[];
  const ids = rows.map(row => row.photo_asset_id).filter((id): id is string => Boolean(id));
  const assets = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error("Unable to load the Roster photos.");
  return { players: rows, assets: (assets.data ?? []) as InjuryAsset[] };
}
