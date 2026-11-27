import type { supabase } from "@/lib/supabase";
import { cinematicContactContentSchema, type CinematicContactContent } from "@/lib/cinematic-contact-content";
import { renderableLink } from "@/lib/link-destination";

export async function fetchCinematicContactContent(clubId: string, client: typeof supabase): Promise<CinematicContactContent | null> {
  const { data, error } = await client.from("cinematic_contact_content").select("content").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error(`fetchCinematicContactContent: ${error.message}`);
  if (!data) return null;
  // A link saved under an older rule renders the button inactive instead of failing the page.
  const content = data.content as Record<string, unknown>;
  return cinematicContactContentSchema.parse({ ...content, informationHref: renderableLink(content.informationHref) });
}
