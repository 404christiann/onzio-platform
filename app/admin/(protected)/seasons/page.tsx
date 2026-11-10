import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClassicSeasonsPage from "@/components/admin/ClassicSeasonsPage";
import { SeasonsHub } from "@/components/admin/reimagined/SeasonsHub";
import { readAdminPortal } from "@/lib/admin-portal";
import { getAdminRouteHref } from "@/lib/admin-route-manifest";
import { loadSeasonsHub } from "@/lib/admin-seasons-data";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { clubToday } from "@/lib/club-time";
import { savedLabel, websiteState } from "@/lib/save-status";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-11a: "This season" (design: cd-season-final, dc-club-home). In the
// reimagined admin the Seasons page is the hub: the season the website shows,
// its numbers, "Start next season" and the quiet past-season switcher. A club
// still on the classic admin keeps the old page unchanged. Session, tenant and
// role are resolved on the server from the host and the signed-in person; every
// write goes through POST /api/admin/data, which checks them again.

export const dynamic = "force-dynamic";

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({ hostname: requestHeaders.get("host") ?? "", userId });
  if (club.role !== "owner" && club.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }
  const portal = await readAdminPortal(supabase, club.id);
  if (portal.portal !== "reimagined") return <ClassicSeasonsPage />;

  // The same predicate the home and the classic shell use for content changes.
  const canMutateContent =
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"));

  const params = await searchParams;
  const asked = typeof params.season === "string" ? params.season : undefined;
  const data = await loadSeasonsHub(supabase, club.id, clubToday(portal.timeZone), asked);
  if (data.status !== "ready") {
    return (
      <p role="alert" className="mx-auto max-w-[1120px] text-sm text-destructive">
        Your seasons could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  return (
    <SeasonsHub
      data={data}
      canChange={canMutateContent}
      savedText={savedLabel(websiteState(club))}
      links={{
        league: getAdminRouteHref("standings"),
        // The combined stats page, on its season view (/admin/season-stats redirects there).
        totals: `${getAdminRouteHref("match-stats")}?view=season`,
        games: getAdminRouteHref("schedule"),
      }}
    />
  );
}
