import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import {
  addClubAdmin,
  assertClubMemberSession,
  assertClubOwnerSession,
  listClubAdmins,
  listClubOwners,
  removeClubAdmin,
  setMemberDisplayName,
} from "@/lib/owner-admin-membership";
import { createClient } from "@/lib/supabase-server";

// The club always comes from the host and the signed-in session, never from the
// body. `set-name` (ADMIN-RE-04): any active owner or admin may name themselves
// (no userId, or their own); only an owner may name someone else, which
// setMemberDisplayName enforces. The name's own rules live in
// normalizeDisplayName, which matches the database check.
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), email: z.string().trim().email().max(254) }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
  z.object({
    action: z.literal("set-name"),
    userId: z.string().uuid().optional(),
    displayName: z.string().max(1_000),
  }),
]);

async function signedInClub(request: Request, allowed: Array<"owner" | "admin">) {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: request.headers.get("host") ?? "",
    userId,
  });
  if (!club.role || !allowed.includes(club.role)) {
    throw new ContractError(allowed.includes("admin") ? "CLUB_MEMBER_REQUIRED" : "OWNER_REQUIRED");
  }
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new ContractError("AUTHENTICATION_REQUIRED");
  return { accessToken, clubId: club.id };
}

async function ownerSession(request: Request) {
  const { accessToken, clubId } = await signedInClub(request, ["owner"]);
  return await assertClubOwnerSession(accessToken, clubId);
}

async function memberSession(request: Request) {
  const { accessToken, clubId } = await signedInClub(request, ["owner", "admin"]);
  return await assertClubMemberSession(accessToken, clubId);
}

function failure(error: unknown) {
  const code = error instanceof ContractError ? error.code : "MEMBERSHIP_FAILED";
  const status = code === "AUTHENTICATION_REQUIRED"
    ? 401
    : code === "AUTH_CODE_RATE_LIMITED"
      ? 429
      : code === "INVALID_DISPLAY_NAME"
        ? 400
        : 403;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  try {
    const session = await ownerSession(request);
    const [owners, admins] = await Promise.all([
      listClubOwners(session),
      listClubAdmins(session),
    ]);
    return NextResponse.json({ owners, admins });
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
    const input = parsed.data;
    if (input.action === "set-name") {
      const session = await memberSession(request);
      const result = await setMemberDisplayName(session, {
        userId: input.userId,
        displayName: input.displayName,
      });
      return NextResponse.json(result);
    }
    const session = await ownerSession(request);
    const result = input.action === "add"
      ? await addClubAdmin(session, { email: input.email, role: "admin" })
      : await removeClubAdmin(session, input.userId);
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
