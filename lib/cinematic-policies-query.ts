import type { supabase } from "@/lib/supabase";
import { cinematicPolicyContentSchema, type CinematicPolicyContent } from "@/lib/cinematic-policies-content";

export async function fetchCinematicPolicyContent(clubId: string, client: typeof supabase): Promise<CinematicPolicyContent | null> {
  const { data, error } = await client.from("cinematic_policy_content").select("content").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error(`fetchCinematicPolicyContent: ${error.message}`);
  return data ? cinematicPolicyContentSchema.parse(data.content) : null;
}
