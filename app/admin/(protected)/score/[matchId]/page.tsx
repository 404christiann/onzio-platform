import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PlayerNumbers } from "@/components/admin/reimagined/PlayerNumbers";
import { readAdminPortal } from "@/lib/admin-portal";
import { loadPlayerNumbers } from "@/lib/admin-player-numbers-data";
import { getAdminRouteHref } from "@/lib/admin-route-manifest";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import { savedLabel, websiteState } from "@/lib/save-status";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-11c-2: "Who played and scored?" for one game (design cd-after-game).
// Opened from Enter a score after a score saves, and from This season's Games
// card. Only in the reimagined admin; a classic club goes to the old Match
// stats page. Session, tenant and role come from the host and the signed-in
// person; saving goes through POST /api/admin/data, which checks them again.

export const dynamic = "force-dynamic";

/** Same predicate as the home, Enter a score and the classic shell use for content changes. */
function canMutateContent(club: ClubContext): boolean {
  return (
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"))
  );
}

export default async function PlayerNumbersPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId,
  });
  if (club.role !== "owner" && club.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }

  const portal = await readAdminPortal(supabase, club.id);
  if (portal.portal !== "reimagined") redirect(`${getAdminRouteHref("match-stats")}?view=match`);

  const { matchId } = await params;
  const data = await loadPlayerNumbers(supabase, club.id, matchId);
  if (data.status === "missing") notFound();
  if (data.status === "error") {
    return (
      <p role="alert" className="mx-auto max-w-[1120px] text-sm text-destructive">
        This game’s player numbers could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  const from = (await searchParams).from;
  const fromSeason = from === "season";
  const state = websiteState(club);
  return (
    <PlayerNumbers
      clubName={club.name}
      game={data.game}
      players={data.players}
      canSave={canMutateContent(club)}
      live={state === "live"}
      savedText={savedLabel(state)}
      backHref={fromSeason ? getAdminRouteHref("seasons") : getAdminRouteHref("score")}
      backLabel={fromSeason ? "Back to This season" : "Back to Enter a score"}
    />
  );
}
