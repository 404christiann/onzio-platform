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
