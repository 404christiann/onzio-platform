import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthEmailCallbackUrl } from "@/lib/auth-email-callback";
import { ContractError } from "@/lib/contract-error";
import {
  addClubAdmin,
  createClubOwnerSessionFromVerifiedIdentity,
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
  return createClubOwnerSessionFromVerifiedIdentity(user.id, club.id);
}

// Every ContractError code reachable from this route, mapped to the HTTP
// status it actually represents -- rather than collapsing almost everything
// to 403, which would give client-side retry/alerting logic (and any future
// caller besides this route's own page) the wrong signal for e.g. an
// internal write failure (5xx, safe to retry) vs. a real permission denial
// (403, retrying won't help) vs. a conflict (409, the caller needs to
// refresh state first).
const STATUS_BY_CODE: Record<string, number> = {
  AUTHENTICATION_REQUIRED: 401,
  MFA_REQUIRED: 401,
  AUTH_CODE_RATE_LIMITED: 429,
  UNKNOWN_TENANT: 404,
  MEMBERSHIP_REQUIRED: 404,
  MEMBERSHIP_EXISTS: 409,
  MEMBERSHIP_INACTIVE: 409,
  MEMBERSHIP_READ_FAILED: 502,
  MEMBERSHIP_MUTATION_FAILED: 502,
  MEMBERSHIP_AUDIT_FAILED: 502,
  AUTH_IDENTITY_LOOKUP_FAILED: 502,
  AUTH_PROVISIONING_FAILED: 502,
  AUTH_CODE_DELIVERY_FAILED: 502,
};

function failure(error: unknown) {
  const code = error instanceof ContractError ? error.code : "MEMBERSHIP_FAILED";
  const status = STATUS_BY_CODE[code] ?? 403;
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
