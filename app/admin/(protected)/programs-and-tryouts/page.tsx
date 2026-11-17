import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProgramsTryouts } from "@/components/admin/reimagined/ProgramsTryouts";
import { readAdminPortal } from "@/lib/admin-portal";
import { loadProgramsTryouts } from "@/lib/admin-programs-tryouts-data";
import { getAdminRouteHref, getVisibleAdminRoutes } from "@/lib/admin-route-manifest";
import { adminAccessFor, canMutateClubContent } from "@/lib/admin-tab-page";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { clubToday } from "@/lib/club-time";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { savedLabel, websiteState } from "@/lib/save-status";
import { getRegistrationLedgerEnvironment } from "@/lib/stripe-config";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-12c: "Programs and tryouts" (design: cd-programs-final,
// cd-tryout-final). The one place the reimagined admin lists a club's programs
// and tryouts with whether families can sign up. A club whose website has only
// tryouts sees "Tryouts" with only tryouts (decision 0005); a classic club
// keeps the two old pages. Session, club and role come from the host and the
// signed-in person; reads are user-scoped.

export const dynamic = "force-dynamic";

export default async function ProgramsAndTryoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({ hostname: (await headers()).get("host") ?? "", userId });
  if (club.role !== "owner" && club.role !== "admin") redirect("/admin/login?error=not_authorized");
  const portal = await readAdminPortal(supabase, club.id);
  const site = codeSiteAdminFor(club);
  const sections = { programs: Boolean(site?.programs.routeVisible), tryouts: Boolean(site?.tryouts.routeVisible) };
  if (portal.portal !== "reimagined") redirect(sections.tryouts ? "/admin/tryouts" : sections.programs ? "/admin/programs" : "/admin");
  if (!sections.programs && !sections.tryouts) redirect("/admin");

  const visible = new Set(getVisibleAdminRoutes(adminAccessFor(club, portal)).map((route) => route.id));
  const canChange = canMutateClubContent(club);
  // The Programs tab's "Add a tryout" opens the form straight away.
  const startAdding = canChange && sections.tryouts && (await searchParams).add === "tryout";
  const today = clubToday(portal.timeZone);
  const data = await loadProgramsTryouts(
    supabase.schema("onzio"),
    club.id,
    today,
    sections,
    getRegistrationLedgerEnvironment(),
  );

  return (
    <ProgramsTryouts
      data={data}
      canChange={canChange}
      startAdding={startAdding}
      canCopyPrograms={Boolean(site?.programs.allowCreation)}
      sections={sections}
      savedText={savedLabel(websiteState(club))}
      today={today}
      links={{
        signUps: getAdminRouteHref("sign-ups"),
        forms: getAdminRouteHref("registrations"),
        payments: visible.has("payments") ? getAdminRouteHref("payments") : null,
        editProgram: sections.programs ? getAdminRouteHref("programs") : null,
        // The page-wide words (and a tryout's photo and closed message) stay
        // on the classic pages for now (RE-13 brings them into Edit my website).
        programsWords: sections.programs ? getAdminRouteHref("programs") : null,
        tryoutsWords: sections.tryouts ? getAdminRouteHref("tryouts") : null,
      }}
    />
  );
}
