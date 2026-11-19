import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAdminRouteHiddenForClub, type AdminRouteId } from "@/lib/admin-route-manifest";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

/**
 * For the layout of an admin page a club's admin hides (ADMIN_ROUTES_HIDDEN_BY_CLUB):
 * the same 404 as any page that does not exist for that club, for the page and
 * every page under it. Any other club passes straight through.
 */
export async function notFoundIfAdminRouteHidden(routeId: AdminRouteId): Promise<void> {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({ hostname: (await headers()).get("host") ?? "", userId });
  if (isAdminRouteHiddenForClub(club.slug, routeId)) notFound();
}
