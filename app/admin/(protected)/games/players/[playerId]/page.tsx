import { notFound, redirect } from "next/navigation";
import { PlayerPage } from "@/components/admin/reimagined/PlayerPage";
import { loadTeamAnalytics } from "@/lib/admin-analytics-data";
import { gameLine, readMissingScoreGame, versus } from "@/lib/admin-home-board";
import { getAdminRouteHref, getVisibleAdminHomeJobs } from "@/lib/admin-route-manifest";
import { loadAdminTabPage } from "@/lib/admin-tab-page";

// ADMIN-RE-24d: one player under the Games tab (design:
// admin-plain-search-two-clubs.html, RE-19's picked design B). "‹ Games",
// chips to switch between players in the same position, the six-sided chart
// and the recent games, all RE-19's own pieces and reads. Same checks as every
// tab page; the player must be in the club's shown season.

export const dynamic = "force-dynamic";

export default async function PlayerTabPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const { supabase, club, portal, access } = await loadAdminTabPage("games");
  const [data, missing] = await Promise.all([
    loadTeamAnalytics(supabase, club.id),
    readMissingScoreGame(supabase, club.id, portal.timeZone),
  ]);
  if (data.status !== "ready") redirect("/admin/games");
  const group = data.groups.find((candidate) => candidate.players.some((player) => player.id === playerId));
  const player = group?.players.find((candidate) => candidate.id === playerId);
  if (!group || !player) notFound();

  const scoreHref = getVisibleAdminHomeJobs(access).find((job) => job.id === "enter-score")?.href ?? null;
  return (
    <PlayerPage
      player={player}
      teammates={group.players.map(({ id, name }) => ({ id, name }))}
      position={group.position}
      season={{ id: data.season.id, label: data.season.label }}
      games={data.games}
      teamGames={data.record.played}
      statsHref={getAdminRouteHref("match-stats")}
      missingScore={
        missing && scoreHref ? { title: versus(missing), sub: `${gameLine(missing)} · score not in yet`, href: scoreHref } : null
      }
    />
  );
}
