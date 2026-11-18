import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AllWebsitePages } from "@/components/admin/website/AllWebsitePages";
import { readAdminPortal } from "@/lib/admin-portal";
import { isWebsiteHubVisible } from "@/lib/admin-route-manifest";
import { adminAccessFor } from "@/lib/admin-tab-page";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// A club the manifest hides this row from gets the same 404 as any page that does not exist for it.
export default async function WebsitePagesPage() {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({ hostname: (await headers()).get("host") ?? "", userId });
  const portal = await readAdminPortal(supabase, club.id);
  if (!isWebsiteHubVisible(adminAccessFor(club, portal))) notFound();
  return <AllWebsitePages />;
}
