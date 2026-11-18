import {
  hydrateTicketPage, ticketPageSchemas,
  type TicketPageContent, type TicketPageKey, type TicketPageView,
} from "@/lib/cinematic-ticket-pages-content";
import type { VisitorPageMedia } from "@/lib/visitor-page-editor";
import type { supabase } from "@/lib/supabase";

/** Public read of one ticket page. The caller supplies the trusted tenant's server onzio client. */
export async function fetchTicketPage<K extends TicketPageKey>(clubId: string, key: K, client: typeof supabase): Promise<TicketPageView<K>> {
  const page = await client.from("cinematic_ticket_pages").select("content").eq("club_id", clubId).eq("page", key).maybeSingle();
  if (page.error) throw new Error("Unable to load this page.");
  if (!page.data) return hydrateTicketPage(key, null, []);
  const rows = await client.from("cinematic_ticket_page_images").select("slot,media_asset_id").eq("club_id", clubId).eq("page", key);
  if (rows.error) throw new Error("Unable to load this page's images.");
  // Stored JSON keeps descriptions only; authoritative identities live in the tenant image rows.
  const identities = new Map((rows.data ?? []).map(row => [row.slot, row.media_asset_id]));
  const stored = page.data.content as unknown as TicketPageContent<K>;
  const content = ticketPageSchemas[key].parse({ ...stored, images: Object.fromEntries(Object.entries(stored.images ?? {}).map(([slot, image]) =>
    [slot, { alt: image.alt, assetId: identities.get(slot) ?? null }])) }) as TicketPageContent<K>;
  const ids = [...new Set(Object.values(content.images).map(image => image.assetId).filter((id): id is string => !!id))];
  const assets = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height")
    .eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error("Unable to load this page's images.");
  return hydrateTicketPage(key, content, (assets.data ?? []) as VisitorPageMedia[]);
}
