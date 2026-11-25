import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// The abandoned reimagined admin had its own pages. A classic club that opened one was sent on to its classic
// page, so these addresses keep doing exactly that: same session, club and role checks, same destination.
export async function retiredAdminRouteClub({ requireAdmin }: { requireAdmin: boolean }): Promise<ClubContext> {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({ hostname: (await headers()).get("host") ?? "", userId });
  if (requireAdmin && club.role !== "owner" && club.role !== "admin") redirect("/admin/login?error=not_authorized");
  return club;
}

export async function redirectRetiredAdminRoute(target: `/admin${string}`, requireAdmin = true): Promise<never> {
  await retiredAdminRouteClub({ requireAdmin });
  redirect(target);
}
