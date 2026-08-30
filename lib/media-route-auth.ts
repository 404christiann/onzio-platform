import { authorizeMutation } from "@/lib/authorization";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import type { MediaSurface } from "@/lib/storage-path";

export async function requireMediaRouteAuthorization(
  request: Request,
  surface: MediaSurface,
) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: request.headers.get("host") ?? "",
    userId,
  });
  const memberships = club.role
    ? [
        {
          userId,
          clubId: club.id,
          role: club.role,
          status: "active",
        },
      ]
    : [];
  await authorizeMutation({
    club,
    userId,
    memberships,
    aal: "aal1",
    feature: surface,
    payload: {},
  });

  return { supabase, user: { id: userId }, club };
}
