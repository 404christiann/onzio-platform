import { NextResponse } from "next/server";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { loadAboutDestinationOptions } from "@/lib/about-editor/destinations";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  let userId: string;
  try {
    ({ userId } = await requireFreshClubSession(supabase));
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "AUTHENTICATION_REQUIRED";
    return NextResponse.json({ error: code }, { status: code === "AUTHENTICATION_REQUIRED" ? 401 : 403 });
  }

  let club;
  try {
    club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId });
    await authorizeAdminAccess({
      club,
      userId,
      memberships: club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [],
      aal: "aal1",
      capability: "content",
    });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "UNKNOWN_TENANT";
    return NextResponse.json({ error: code }, { status: code === "UNKNOWN_TENANT" ? 404 : 403 });
  }

  try {
    const options = await loadAboutDestinationOptions(supabase, club);
    return NextResponse.json({ options }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DESTINATIONS_UNAVAILABLE" }, { status: 503 });
  }
}
