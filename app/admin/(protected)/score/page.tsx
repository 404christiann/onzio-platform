import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ScoreEntry } from "@/components/admin/reimagined/ScoreEntry";
import { readAdminPortal } from "@/lib/admin-portal";
import {
  getVisibleAdminHomeJobs,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { loadScorePageData } from "@/lib/admin-score-data";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import { savedLabel, websiteState } from "@/lib/save-status";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-06: Enter a score (design: cd-score, cd-score-desktop). The page
// exists only in the reimagined admin; a club still on the classic admin is
// sent to the old schedule page. Session, tenant and role are resolved on the
// server from the host and the signed-in person, never from the browser. Saving
// goes through POST /api/admin/data, which checks them again.

export const dynamic = "force-dynamic";

/** Same predicate as the home and the classic shell use for content changes. */
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

export default async function ScorePage() {
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
  if (portal.portal !== "reimagined") redirect("/admin/schedule");

  const canSave = canMutateContent(club);
  const access: AdminRouteAccessContext = {
    role: club.role,
    presentationTemplateKey: club.presentationTemplateKey,
    isBillingAuthorized: club.role === "owner" && club.lifecycle !== "archived",
    canMutateContent: canSave,
    storeEnabled: club.storeEnabled,
    adminPortal: portal.portal,
    adminFlags: portal.flags,
  };
  const addGameHref =
    getVisibleAdminHomeJobs(access).find((job) => job.id === "add-game")?.href ?? null;
  const data = await loadScorePageData(supabase, club.id, portal.timeZone);

  return (
    <ScoreEntry
      clubName={club.name}
      data={data}
      canSave={canSave}
      savedText={savedLabel(websiteState(club))}
      addGameHref={addGameHref}
    />
  );
}
