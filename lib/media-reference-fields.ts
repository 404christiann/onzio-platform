/**
 * Where content rows point at published media. Two kinds of entry:
 *
 * - `{ source, asset }`: a url column with a matching asset-id column. The admin client fills the asset id when
 *   a save sets the url (attachMediaReferences in lib/admin-client.ts), and public reads re-derive the url from it.
 * - `{ json, keys }`: urls nested inside a JSON array column (the Club Logo page's patches, icons and color cards).
 *   There is no asset-id column; the database finds these by storage path through
 *   onzio_private.media_reference_columns, which the orphan sweep and every retirement check read. Each `json`
 *   column listed here must be registered there, or the sweep would treat its images as unused.
 *   tests/contracts/media-reference-fields.test.ts and tests/database/media-orphan-sweep.test.ts enforce that.
 */
export type MediaReferenceField =
  | { source: string; asset: string }
  | { json: string; keys: readonly string[] };

export const MEDIA_REFERENCE_FIELDS: Readonly<Record<string, readonly MediaReferenceField[]>> = {
  about_page_content: [
    { source: "feature_image_url", asset: "feature_image_asset_id" },
  ],
  club_logo_page_content: [
    { source: "annotated_image_url", asset: "annotated_image_asset_id" },
    { source: "map_image_url", asset: "map_image_asset_id" },
    { json: "features", keys: ["patch_url", "icon_url"] },
    { json: "color_cards", keys: ["image_url"] },
  ],
  homepage_slideshow_photos: [{ source: "url", asset: "media_asset_id" }],
  league_standings: [{ source: "logo_url", asset: "logo_asset_id" }],
  matches: [
    { source: "opponent_logo_url", asset: "opponent_logo_asset_id" },
    { source: "sponsor_logo_url", asset: "sponsor_logo_asset_id" },
    { source: "league_logo_url", asset: "league_logo_asset_id" },
  ],
  player_photos: [{ source: "url", asset: "media_asset_id" }],
  program_media: [{ source: "url", asset: "media_asset_id" }],
  players: [{ source: "photo_url", asset: "photo_asset_id" }],
  shop_carousel_photos: [{ source: "url", asset: "media_asset_id" }],
  shop_kit_photos: [{ source: "url", asset: "media_asset_id" }],
  site_branding: [{ source: "club_logo_path", asset: "club_logo_asset_id" }],
  site_sponsor_logos: [{ source: "logo_url", asset: "media_asset_id" }],
  staff: [{ source: "photo_url", asset: "photo_asset_id" }],
};

/** The url/asset-id column pairs of a table (nested JSON urls have no asset column). */
export function assetColumnPairs(table: string): { source: string; asset: string }[] {
  return (MEDIA_REFERENCE_FIELDS[table] ?? []).filter(
    (field): field is { source: string; asset: string } => "source" in field,
  );
}

/** The nested JSON url fields of a table. */
export function nestedJsonFields(table: string): { json: string; keys: readonly string[] }[] {
  return (MEDIA_REFERENCE_FIELDS[table] ?? []).filter(
    (field): field is { json: string; keys: readonly string[] } => "json" in field,
  );
}
