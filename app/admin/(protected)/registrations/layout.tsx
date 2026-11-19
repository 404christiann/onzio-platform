import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAdminRouteHiddenForClub } from "@/lib/admin-route-manifest";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// A club whose admin hides Registrations (Rose City, which outsources tryouts)
// gets the same 404 as any page that does not exist for it, for this page and
// any page under it. Every other club renders the page unchanged. Nothing here
// touches the registration API routes, data or public pages.
export default async function RegistrationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({ hostname: (await headers()).get("host") ?? "", userId });
  if (isAdminRouteHiddenForClub(club.slug, "registrations")) notFound();
  return children;
}
