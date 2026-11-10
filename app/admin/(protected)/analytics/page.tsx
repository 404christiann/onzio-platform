import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClassicAnalyticsPage from "@/components/admin/ClassicAnalyticsPage";
import { TeamAnalytics } from "@/components/admin/reimagined/TeamAnalytics";
import { loadTeamAnalytics } from "@/lib/admin-analytics-data";
import { readAdminPortal } from "@/lib/admin-portal";
import { getAdminRouteHref } from "@/lib/admin-route-manifest";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-19: "How the team is doing" (design: cd-analytics-a, cd-analytics-b).
// In the reimagined admin the Analytics page shows the season game by game and
// one player at a time. A club still on the classic admin keeps the old page
// unchanged. Session, tenant and role are resolved on the server from the host
// and the signed-in person; the page only reads, and every read is scoped to
// the club through the person's own client (RLS is the boundary).

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({ hostname: requestHeaders.get("host") ?? "", userId });
  if (club.role !== "owner" && club.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }
  const portal = await readAdminPortal(supabase, club.id);
  if (portal.portal !== "reimagined") return <ClassicAnalyticsPage />;

  const data = await loadTeamAnalytics(supabase, club.id);
  if (data.status === "error") {
    return (
      <p role="alert" className="mx-auto max-w-[960px] text-sm text-destructive">
        Your team’s numbers could not be loaded. Refresh the page to try again.
      </p>
    );
  }
  if (data.status === "no-season") {
    return (
      <div className="mx-auto max-w-[960px]" data-testid="team-analytics-no-season">
        <h1 className="text-[26px] font-semibold leading-8 tracking-tight">How the team is doing</h1>
        <p className="mt-3 text-[15px] leading-[22px] text-muted-foreground">
          Your website isn’t showing a season yet, so there are no results to read.
        </p>
        <a href={getAdminRouteHref("seasons")} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
          Go to This season
        </a>
      </div>
    );
  }

  return (
    <TeamAnalytics
      data={data}
      links={{
        score: getAdminRouteHref("score"),
        stats: getAdminRouteHref("match-stats"),
        roster: getAdminRouteHref("roster"),
      }}
    />
  );
}
