import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import {
  assertClubOwnerSession,
  setClubTimeZoneOnce,
} from "@/lib/owner-admin-membership";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-02, decision 1: an owner's browser sends its time zone once, and the
// club keeps it until Onzio changes it. Owners only; the club comes from the
// host and the session, never from the request body.

const requestSchema = z.object({ timeZone: z.string().min(1).max(64) }).strict();

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_TIME_ZONE" }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { userId } = await requireFreshClubSession(supabase);
    const club = await getClubContext({
      hostname: request.headers.get("host") ?? "",
      userId,
    });
    if (club.role !== "owner") throw new ContractError("OWNER_REQUIRED");
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    if (!accessToken) throw new ContractError("AUTHENTICATION_REQUIRED");
    const session = await assertClubOwnerSession(accessToken, club.id);
    const result = await setClubTimeZoneOnce(session, parsed.data.timeZone);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "CLUB_TIME_ZONE_FAILED";
    const status = code === "INVALID_TIME_ZONE"
      ? 400
      : code === "AUTHENTICATION_REQUIRED" || code === "SESSION_EXPIRED"
        ? 401
        : error instanceof ContractError
          ? 403
          : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
