import { CHICK_FIL_A_ARTWORK_SLOTS, CHICK_FIL_A_MEDIA_COLUMNS, chickFilAContentSchema, hydrateChickFilAContent, type ChickFilAPageContent } from "@/lib/chick-fil-a-content";
import type { supabase } from "@/lib/supabase";
import type { VisitorPageMedia } from "@/lib/visitor-page-editor";

/** All media lookup filters are tenant-scoped and published-only; URLs never come from content JSON. */
export async function fetchChickFilAContent(clubId: string, client: typeof supabase): Promise<ChickFilAPageContent> {
  const { data, error } = await client.from("cinematic_chick_fil_a_content").select("*").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error("Unable to load Chick-fil-A content.");
  if (!data) return hydrateChickFilAContent(null, []);
  const stored = data.content as unknown as Partial<ReturnType<typeof chickFilAContentSchema.parse>>;
  const content = chickFilAContentSchema.parse({ ...stored, artwork: Object.fromEntries(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => [slot, { assetId: data[CHICK_FIL_A_MEDIA_COLUMNS[slot]], alt: stored.artwork?.[slot]?.alt }])) });
  const ids = [...new Set(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => content.artwork[slot].assetId).filter((id): id is string => !!id))];
  const media = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height").eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (media.error) throw new Error("Unable to load Chick-fil-A artwork.");
  return hydrateChickFilAContent(content, media.data as VisitorPageMedia[]);
}
