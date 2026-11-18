import { TICKET_ARTWORK_SLOTS, hydrateTicketsContent, type TicketsContent, type TicketsPageContent, type TicketsSnapshot } from "@/lib/tickets-content";
import type { supabase } from "@/lib/supabase";
export async function fetchTicketsContent(clubId: string, client: typeof supabase): Promise<TicketsPageContent> {
    const { data, error } = await client.from("cinematic_tickets_content").select("*").eq("club_id", clubId).maybeSingle();
    if (error)
        throw new Error("Unable to load Tickets content.");
    if (!data)
        return hydrateTicketsContent(null, []);
    const content = { ...(data.content as unknown as TicketsContent), artwork: Object.fromEntries(TICKET_ARTWORK_SLOTS.map(slot => [slot, { assetId: data[`${slot}_media_asset_id`], alt: (data.content as unknown as TicketsContent).artwork[slot].alt }])) } as TicketsContent;
    const ids = TICKET_ARTWORK_SLOTS.map(slot => content.artwork[slot].assetId).filter((id): id is string => !!id);
    const assets = ids.length ? await client.from("media_assets").select("id,storage_bucket,storage_path,width,height").eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
    if (assets.error)
        throw new Error("Unable to load Tickets artwork.");
    return hydrateTicketsContent(content, assets.data as TicketsSnapshot["media"]);
}
