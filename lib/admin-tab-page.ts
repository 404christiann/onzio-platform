import { headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readAdminPortal, type AdminPortalSettings } from "@/lib/admin-portal";
import { loadAdminHomeData, type AdminHomeData } from "@/lib/admin-home-data";
import type { AdminRouteAccessContext } from "@/lib/admin-route-manifest";
import { getVisibleAdminTabs, type AdminTabId } from "@/lib/admin-tabs";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import type { CodeSiteInput } from "@/lib/code-site";
import type { AdminSearchGame, AdminSearchPlayer } from "@/lib/admin-search";
import { clubToday, formatClubDate } from "@/lib/club-time";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-24: what every tab page and the shell need about the club. Same
// session, club and capability checks as the home (app/admin/(protected)/page.tsx);
// reads stay server-side and user-scoped.

/** Same predicate as the home, Enter a score and the classic shell use for content changes. */
export function canMutateClubContent(club: ClubContext): boolean {
  return (
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"))
  );
}

/**
 * The home's counts (games needing a score, new sign-ups, live forms), read
 * once per request: the layout's red dots, a tab page and the home share it.
 * Same user-scoped client as everywhere else.
 */
export const readAdminHomeCounts = cache(
  async (clubId: string, timeZone: string): Promise<AdminHomeData> =>
    loadAdminHomeData(await createClient(), clubId, timeZone),
);

const POSITIONS = new Set(["Goalkeeper", "Defender", "Midfielder", "Forward"]);

/**
 * ADMIN-RE-24c: the players (the ones with a page under Games) and the next
 * five games, for search. Read once per request with the user-scoped client,
 * scoped to the club; names, numbers and dates only. Any problem means search
 * lists pages and jobs alone.
 */
export const readSearchExtras = cache(
  async (clubId: string, timeZone: string): Promise<{ players: AdminSearchPlayer[]; games: AdminSearchGame[] }> => {
    try {
      const onzio = (await createClient()).schema("onzio");
      const [players, season] = await Promise.all([
        onzio.from("players").select("id,name,number,position,active").eq("club_id", clubId).eq("active", true).order("name").limit(300),
        onzio.from("seasons").select("id").eq("club_id", clubId).eq("active", true).maybeSingle(),
      ]);
      const seasonId = (season.data as { id: string } | null)?.id;
      const games = seasonId
        ? await onzio
            .from("matches")
            .select("id,opponent,home,date")
            .eq("club_id", clubId)
            .eq("season_id", seasonId)
            .is("rose_city_score", null)
            .is("opponent_score", null)
            .gte("date", clubToday(timeZone))
            .order("date", { ascending: true })
            .limit(5)
        : { data: [], error: null };
      return {
        // A player's page needs a shown season; without one, search lists no players.
        players: players.error || !seasonId
          ? []
          : ((players.data ?? []) as { id: string; name: string; number: number | null; position: string }[])
              .filter((player) => POSITIONS.has(player.position))
              .map(({ id, name, number, position }) => ({ id, name, number, position })),
        games: games.error
          ? []
          : ((games.data ?? []) as { id: string; opponent: string; home: boolean | null; date: string }[]).map((game) => ({
              id: game.id,
              opponent: game.opponent,
              home: game.home,
              when: formatClubDate(game.date, "weekday-short") ?? game.date,
            })),
      };
    } catch {
      return { players: [], games: [] };
    }
  },
);

/** The access context the manifest and the tabs read, for a reimagined or classic club. */
export function adminAccessFor(
  club: ClubContext,
  portal: AdminPortalSettings,
  hasLiveSignUps = false,
): AdminRouteAccessContext {
  // The club's site goes through untouched; only the manifest's
  // codeSiteAdminFor reads it. Nothing here branches on the design.
  const site: CodeSiteInput = club;
  return {
    ...site,
    role: club.role === "owner" || club.role === "admin" ? club.role : null,
    isBillingAuthorized: club.role === "owner" && club.lifecycle !== "archived",
    canMutateContent: canMutateClubContent(club),
    storeEnabled: club.storeEnabled,
    adminPortal: portal.portal,
    adminFlags: portal.flags,
    hasLiveSignUps,
  };
}

export type AdminTabPageContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  club: ClubContext;
  portal: AdminPortalSettings;
  home: AdminHomeData;
  access: AdminRouteAccessContext;
};

/**
 * Loads a tab page's context, or sends the person elsewhere: a classic club,
 * or a club without this tab, goes to /admin.
 */
export async function loadAdminTabPage(tab: AdminTabId): Promise<AdminTabPageContext> {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: (await headers()).get("host") ?? "",
    userId,
  });
  if (club.role !== "owner" && club.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }
  const portal = await readAdminPortal(supabase, club.id);
  if (portal.portal !== "reimagined") redirect("/admin");
  const home = await readAdminHomeCounts(club.id, portal.timeZone);
  const access = adminAccessFor(club, portal, home.hasLiveSignUps);
  if (!getVisibleAdminTabs(access).some((candidate) => candidate.id === tab)) redirect("/admin");
  return { supabase, club, portal, home, access };
}
