import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AddGame } from "@/components/admin/reimagined/AddGame";
import { loadAddGameData } from "@/lib/admin-add-game-data";
import { readAdminPortal } from "@/lib/admin-portal";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { clubToday, DEFAULT_KICKOFF_TIME, nextClubSaturday } from "@/lib/club-time";
import { websiteState } from "@/lib/save-status";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-07: "Add a game". Only in the reimagined admin; a club still on the
// old admin is sent to the old schedule page, which adds games its own way.
export default async function AddGamePage() {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: (await headers()).get("host") ?? "",
    userId,
  });
  const portal = await readAdminPortal(supabase, club.id);
  if (portal.portal !== "reimagined") redirect("/admin/schedule");

  // Match sponsors only where the club's website shows them: the same rule as
  // the classic Games form (Diverse City's academy pages never do).
  const showSponsors = codeSiteAdminFor(club)?.schedule.showMatchSponsorFields !== false;
  // The competition question only where the club's website shows a game's own
  // competition (Diverse City's Next Match card); the classic Games form's rule.
  const showCompetition = codeSiteAdminFor(club)?.schedule.competitionShowsOnNextMatch === true;
  const data = await loadAddGameData(supabase, club.id, portal.timeZone, { showSponsors, showCompetition }).catch(() => null);
  if (!data) {
    return (
      <p role="alert" className="mx-auto max-w-[1120px] text-sm text-destructive">
        Your games could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  return (
    <AddGame
      seasons={data.seasons}
      upcoming={data.upcoming}
      recentVenues={data.recentVenues}
      showCompetition={showCompetition}
      recentCompetitions={data.recentCompetitions}
      showSponsors={showSponsors}
      sponsors={data.sponsors}
      opponents={data.opponents}
      today={clubToday(portal.timeZone)}
      defaultDate={nextClubSaturday(portal.timeZone)}
      defaultTime={DEFAULT_KICKOFF_TIME}
      websiteState={websiteState(club)}
    />
  );
}
