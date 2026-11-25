import { notFound, redirect } from "next/navigation";
import { isAdminRouteHiddenForClub } from "@/lib/admin-route-manifest";
import { retiredAdminRouteClub } from "@/lib/retired-admin-route";

// Retired reimagined-admin address: a classic club goes on to Registrations, as before. A club whose admin hides
// Registrations (Rose City) has no list of sign-ups either.
export const dynamic = "force-dynamic";

export default async function RetiredAdminPage(): Promise<never> {
  const club = await retiredAdminRouteClub({ requireAdmin: false });
  if (isAdminRouteHiddenForClub(club.slug, "registrations")) notFound();
  redirect("/admin/registrations");
}
