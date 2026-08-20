import { authorizeAdminAccess } from "@/lib/authorization";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

/** Requires the standard fresh club session for an active owner or admin. */
export async function requireRegistrationRouteAuthorization(request: Request) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: request.headers.get("host") ?? "",
    userId,
  });
  const memberships = club.role
    ? [{
        userId,
        clubId: club.id,
        role: club.role,
        status: "active",
      }]
    : [];

  await authorizeAdminAccess({
    club,
    userId,
    memberships,
    aal: "aal1",
    capability: "content",
  });

  return { supabase, user: { id: userId }, club };
}
