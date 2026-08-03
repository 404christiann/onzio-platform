import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import {
  addClubAdmin,
  assertClubOwnerSession,
  listClubAdmins,
  removeClubAdmin,
} from "@/lib/owner-admin-membership";
import { createClient } from "@/lib/supabase-server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), email: z.string().email() }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
]);

async function ownerSession(request: Request) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: request.headers.get("host") ?? "",
    userId,
  });
  if (club.role !== "owner") throw new ContractError("OWNER_REQUIRED");
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new ContractError("AUTHENTICATION_REQUIRED");
  return await assertClubOwnerSession(accessToken, club.id);
}

function failure(error: unknown) {
  const code = error instanceof ContractError ? error.code : "MEMBERSHIP_FAILED";
  const status = code === "AUTHENTICATION_REQUIRED"
    ? 401
    : code === "AUTH_CODE_RATE_LIMITED"
      ? 429
      : 403;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  try {
    return NextResponse.json({ admins: await listClubAdmins(await ownerSession(request)) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_MEMBERSHIP_INPUT" }, { status: 400 });
  }
  try {
    const session = await ownerSession(request);
    const result = parsed.data.action === "add"
      ? await addClubAdmin(session, { email: parsed.data.email, role: "admin" })
      : await removeClubAdmin(session, parsed.data.userId);
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
