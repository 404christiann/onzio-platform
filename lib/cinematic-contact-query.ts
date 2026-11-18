import type { supabase } from "@/lib/supabase";
import { cinematicContactContentSchema, type CinematicContactContent } from "@/lib/cinematic-contact-content";

export async function fetchCinematicContactContent(clubId: string, client: typeof supabase): Promise<CinematicContactContent | null> {
  const { data, error } = await client.from("cinematic_contact_content").select("content").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error(`fetchCinematicContactContent: ${error.message}`);
  return data ? cinematicContactContentSchema.parse(data.content) : null;
}
