import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClassicAnalyticsPage from "@/components/admin/ClassicAnalyticsPage";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// Session, tenant and role are resolved on the server from the host and the
// signed-in person.

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({ hostname: requestHeaders.get("host") ?? "", userId });
  if (club.role !== "owner" && club.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }
  return <ClassicAnalyticsPage />;
}
