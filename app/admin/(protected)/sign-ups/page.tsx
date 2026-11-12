import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignUps } from "@/components/admin/reimagined/SignUps";
import { readAdminPortal } from "@/lib/admin-portal";
import { loadSignUps, parseSignUpFormId, parseSignUpPersonId, parseSignUpTab } from "@/lib/admin-sign-ups-data";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-08: "See registrations" (design: cd-regs). The reimagined admin's
// read-only list of who signed up, from every form. Building forms, opening and
// closing them, and Stripe stay on /admin/registrations ("Sign-up forms").
// Reads are server-side through the signed-in person's own client.

export const dynamic = "force-dynamic";

export default async function SignUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({ hostname: requestHeaders.get("host") ?? "", userId });
  const portal = await readAdminPortal(supabase, club.id);
  // A club still on the classic admin keeps its old page.
  if (portal.portal !== "reimagined") redirect("/admin/registrations");

  const params = await searchParams;
  const tab = parseSignUpTab(params.tab);
  const personId = parseSignUpPersonId(params.person);
  // ADMIN-RE-12c: "N signed up" on Programs and tryouts opens the list for that one form.
  const formId = parseSignUpFormId(params.form);
  const data = await loadSignUps(supabase, club.id, portal.timeZone, { tab, personId, formId });

  return <SignUps data={data} personId={personId} />;
}
