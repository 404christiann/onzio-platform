import { clubHasFeature, type ClubTier } from "@/lib/club-features";
import { failContract } from "@/lib/contract-error";

type Club = {
  id?: unknown;
  lifecycle?: unknown;
  tier?: unknown;
};

type Membership = {
  userId?: unknown;
  user_id?: unknown;
  clubId?: unknown;
  club_id?: unknown;
  role?: unknown;
  status?: unknown;
};

type AuthorizationInput = {
  club: Club;
  userId: string;
  memberships: readonly Membership[];
  aal: "aal1" | "aal2";
  capability: "content" | "billing";
};

function membershipForClub(
  input: Pick<AuthorizationInput, "club" | "userId" | "memberships">,
): Membership | undefined {
  return input.memberships.find(
    (membership) =>
      (membership.userId ?? membership.user_id) === input.userId &&
      (membership.clubId ?? membership.club_id) === input.club.id,
  );
}

export async function authorizeAdminAccess(input: AuthorizationInput): Promise<{
  allowed: true;
  role: "owner" | "admin";
}> {
  if (input.club.lifecycle === "archived") failContract("CLUB_ARCHIVED");
  if (
    input.club.lifecycle !== "active" &&
    !(input.capability === "billing" && input.club.lifecycle === "onboarding")
  ) {
    failContract("CLUB_INACTIVE");
  }
  if (input.aal !== "aal2") failContract("MFA_REQUIRED");

  const membership = membershipForClub(input);
  if (!membership) failContract("MEMBERSHIP_REQUIRED");
  if (membership.status !== "active") failContract("MEMBERSHIP_INACTIVE");

  const role = membership.role;
  if (role !== "owner" && role !== "admin") {
    failContract("MEMBERSHIP_REQUIRED");
  }
  if (input.capability === "billing" && role !== "owner") {
    failContract("OWNER_REQUIRED");
  }

  return { allowed: true, role };
}

export async function authorizeMutation(input: {
  club: Club;
  userId: string;
  memberships: readonly Membership[];
  aal: "aal1" | "aal2";
  feature: string;
  payload: Record<string, unknown>;
}): Promise<{ clubId: string; actorId: string }> {
  if (
    Object.prototype.hasOwnProperty.call(input.payload, "club_id") ||
    Object.prototype.hasOwnProperty.call(input.payload, "clubId")
  ) {
    failContract("UNTRUSTED_TENANT_INPUT");
  }

  await authorizeAdminAccess({ ...input, capability: "content" });

  if (
    (input.club.tier !== "starter" && input.club.tier !== "pro") ||
    !clubHasFeature(input.club.tier as ClubTier, input.feature)
  ) {
    failContract("FEATURE_NOT_INCLUDED");
  }

  if (typeof input.club.id !== "string") failContract("INVALID_CLUB");
  return { clubId: input.club.id, actorId: input.userId };
}
