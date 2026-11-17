import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { YourClub } from "@/components/admin/reimagined/YourClub";
import { readAdminPortal } from "@/lib/admin-portal";
import { loadYourClubData } from "@/lib/admin-your-club-data";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { savedLabel, websiteState } from "@/lib/save-status";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-14: Your club (design: cd-your-club; decision 0006). One page, one
// Save, for what shows across the whole website: the logo, how people reach the
// club, social pages and the footer line. It exists only in the reimagined
// admin; a club still on the classic admin is sent to Branding. Session, club
// and role come from the server; saving goes through POST /api/admin/data,
// which checks them again.

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

export default async function YourClubPage() {
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
  if (portal.portal !== "reimagined") redirect("/admin/branding");

  // Only what the club's website shows (decision 0005): the email, phone, hours
  // and area appear on designs with a Contact page, the footer line on designs
  // whose footer prints one. The logo and social pages are on every website.
  const siteAdmin = codeSiteAdminFor(club);
  const shown = {
    reach: siteAdmin?.contact.routeVisible === true,
    footerLine: siteAdmin?.branding.showFooterTagline === true,
  };

  const data = await loadYourClubData(supabase, club.id);
  const state = websiteState(club);

  return (
    <YourClub
      clubName={club.name}
      data={data}
      shown={shown}
      canSave={canMutateContent(club)}
      websiteState={state}
      savedText={savedLabel(websiteState(club))}
    />
  );
}
