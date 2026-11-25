import { redirect } from "next/navigation";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { retiredAdminRouteClub } from "@/lib/retired-admin-route";

// Retired reimagined-admin address: a classic club goes on to Tryouts, else Programs, else the dashboard, as before.
export const dynamic = "force-dynamic";

export default async function RetiredAdminPage(): Promise<never> {
  const club = await retiredAdminRouteClub({ requireAdmin: true });
  const site = codeSiteAdminFor(club);
  redirect(site?.tryouts.routeVisible ? "/admin/tryouts" : site?.programs.routeVisible ? "/admin/programs" : "/admin");
}
