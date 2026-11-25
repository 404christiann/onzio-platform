import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClassicSeasonsPage from "@/components/admin/ClassicSeasonsPage";
import RoseCitySeasonsPage from "@/components/admin/seasons/rose-city/RoseCitySeasonsPage";
import { isAdminRouteHiddenForClub } from "@/lib/admin-route-manifest";
import { loadSeasonsList } from "@/lib/admin-seasons-list";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// Session, tenant and role are resolved on the server from the host and the
// signed-in person; every write goes through POST /api/admin/data, which checks
// them again.

export const dynamic = "force-dynamic";

const ROSE_CITY_SLUG = "rose-city";

export default async function SeasonsPage() {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({ hostname: requestHeaders.get("host") ?? "", userId });
  if (club.role !== "owner" && club.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }
  // RC-ADMIN-4b-seasons: Rose City's classic admin lists seasons on the editor kit, keyed on the club's slug
  // (not on its site design, as ADMIN_ROUTES_HIDDEN_BY_CLUB is). Every other club keeps the classic page.
  if (club.slug !== ROSE_CITY_SLUG) return <ClassicSeasonsPage />;
  const list = await loadSeasonsList(supabase, club.id);
  if (list.status !== "ready") {
    return (
      <p role="alert" className="mx-auto max-w-[1120px] text-sm text-destructive">
        Your seasons could not be loaded. Refresh the page to try again.
      </p>
    );
  }
  return (
    <RoseCitySeasonsPage
      seasons={list.seasons}
      deleteStates={list.deleteStates}
      hasStandings={!isAdminRouteHiddenForClub(club.slug, "standings")}
    />
  );
}
