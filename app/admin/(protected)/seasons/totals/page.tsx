import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SeasonTotals } from "@/components/admin/reimagined/SeasonTotals";
import { readAdminPortal } from "@/lib/admin-portal";
import { getAdminRouteHref } from "@/lib/admin-route-manifest";
import { loadSeasonTotals } from "@/lib/admin-season-totals-data";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { savedLabel, websiteState } from "@/lib/save-status";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-11c-2: Season totals (design cd-season-totals), opened from This
// season's Player totals card. Only in the reimagined admin; a classic club goes
// to the old Season stats page. Session, tenant and role come from the host and
// the signed-in person; saving goes through POST /api/admin/data, which checks
// them again.

export const dynamic = "force-dynamic";

export default async function SeasonTotalsPage({
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
  if (portal.portal !== "reimagined") redirect(`${getAdminRouteHref("match-stats")}?view=season`);

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
  const data = await loadSeasonTotals(supabase, club.id, asked);
  const hub = getAdminRouteHref("seasons");
  if (data.status === "no-season") redirect(hub);
  if (data.status === "error") {
    return (
      <p role="alert" className="mx-auto max-w-[1120px] text-sm text-destructive">
        The season totals could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  return (
    <SeasonTotals
      season={data.season}
      players={data.players}
      gamesEntered={data.gamesEntered}
      canSave={canMutateContent}
      savedText={savedLabel(websiteState(club))}
      backHref={data.season.active ? hub : `${hub}?season=${data.season.id}`}
    />
  );
}
