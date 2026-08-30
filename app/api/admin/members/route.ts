import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthEmailCallbackUrl } from "@/lib/auth-email-callback";
import { ContractError } from "@/lib/contract-error";
import {
  addClubAdmin,
  createClubOwnerSession,
  listClubAdmins,
  removeClubAdmin,
} from "@/lib/owner-admin-membership";
import { requireMembershipRouteAuthorization } from "@/lib/membership-route-auth";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), email: z.string().email() }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
]);

async function ownerSession(request: Request) {
  const { user, club } = await requireMembershipRouteAuthorization(request);
  return createClubOwnerSession(user.id, club.id);
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
      ? await addClubAdmin(
          session,
          { email: parsed.data.email, role: "admin" },
          { redirectTo: createAuthEmailCallbackUrl(new URL(request.url).origin) },
        )
      : await removeClubAdmin(session, parsed.data.userId);
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
