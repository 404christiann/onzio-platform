import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readAdminPortal, type AdminPortalSettings } from "@/lib/admin-portal";
import { canSeeSponsorInsights, type AdminRouteAccessContext } from "@/lib/admin-route-manifest";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import type { CodeSiteInput } from "@/lib/code-site";
import { createClient } from "@/lib/supabase-server";

// What the Sponsor Insights pages and the website hub need about the club.
// Reads stay server-side and user-scoped.

/** Same predicate as the dashboard and the classic shell use for content changes. */
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

/** The access context the route manifest reads. */
export function adminAccessFor(
  club: ClubContext,
  portal: AdminPortalSettings,
): AdminRouteAccessContext {
  // The club's site goes through untouched; only the manifest's
  // codeSiteAdminFor reads it. Nothing here branches on the design.
  const site: CodeSiteInput = club;
  return {
    ...site,
    clubSlug: club.slug,
    role: club.role === "owner" || club.role === "admin" ? club.role : null,
    isBillingAuthorized: club.role === "owner" && club.lifecycle !== "archived",
    canMutateContent: canMutateClubContent(club),
    storeEnabled: club.storeEnabled,
    adminFlags: portal.flags,
  };
}

export type SponsorInsightsPageContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  club: ClubContext;
  portal: AdminPortalSettings;
  access: AdminRouteAccessContext;
};

/**
 * Loads the Sponsor Insights page's context, or sends the person elsewhere: a
 * club without the add-on, or a person who is not an owner or admin, goes to
 * /admin or the sign-in page.
 */
export async function loadSponsorInsightsPage(): Promise<SponsorInsightsPageContext> {
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
  const access = adminAccessFor(club, portal);
  if (!canSeeSponsorInsights(access)) redirect("/admin");
  return { supabase, club, portal, access };
}
