import { newestNewsFirst, newsArticleContentSchema, type NewsArticleContent } from "@/lib/cinematic-news";
import { mediaAssetUrl } from "@/lib/media-assets";
import type { supabase } from "@/lib/supabase";

/** An article as visitors see it. */
export type NewsPublicArticle = {
  id: string; slug: string; publishedAt: string; content: NewsArticleContent;
  cover: { url: string; width: number; height: number } | null;
};
type Row = { id: string; slug: string; content: unknown; cover_media_asset_id: string | null; published_at: string; removed_at: string | null };
type Asset = { id: string; storage_bucket: string; storage_path: string; width: number; height: number };

const COLUMNS = "id,slug,content,cover_media_asset_id,published_at,removed_at";

/**
 * The caller supplies the trusted tenant's server onzio client. A signed-in owner can read removed
 * articles through the editor policy, so removed rows are filtered here as well as in the query.
 */
async function hydrate(rows: Row[], clubId: string, client: typeof supabase): Promise<NewsPublicArticle[]> {
  const shown = rows.filter(row => row.removed_at === null);
  const ids = [...new Set(shown.map(row => row.cover_media_asset_id).filter((id): id is string => !!id))];
  const assets = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error("Unable to load News photos.");
  const byId = new Map(((assets.data ?? []) as Asset[]).map(asset => [asset.id, asset]));
  const articles = shown.flatMap(row => {
    const content = newsArticleContentSchema.safeParse(row.content);
    if (!content.success) return [];
    const asset = row.cover_media_asset_id ? byId.get(row.cover_media_asset_id) : undefined;
    return [{ id: row.id, slug: row.slug, publishedAt: new Date(row.published_at).toISOString(), content: content.data,
      cover: asset ? { url: mediaAssetUrl(asset), width: asset.width, height: asset.height } : null }];
  });
  return newestNewsFirst(articles);
}

export async function fetchNewsArticles(clubId: string, client: typeof supabase): Promise<NewsPublicArticle[]> {
  const { data, error } = await client.from("cinematic_news_articles").select(COLUMNS)
    .eq("club_id", clubId).is("removed_at", null).order("published_at", { ascending: false });
  if (error) throw new Error("Unable to load News.");
  return hydrate((data ?? []) as Row[], clubId, client);
}

export async function fetchNewsArticle(clubId: string, slug: string, client: typeof supabase): Promise<NewsPublicArticle | null> {
  const { data, error } = await client.from("cinematic_news_articles").select(COLUMNS)
    .eq("club_id", clubId).eq("slug", slug).is("removed_at", null).maybeSingle();
  if (error) throw new Error("Unable to load the article.");
  return data ? (await hydrate([data as Row], clubId, client))[0] ?? null : null;
}
