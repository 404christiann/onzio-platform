import { z } from "zod";
import {
  isClubSessionFresh,
  verifyAccessTokenClaims,
} from "@/lib/auth-session";
import { isValidTimeZone } from "@/lib/club-time";
import { failContract } from "@/lib/contract-error";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type AuthCodeDeliveryResult = {
  error: null | {
    code?: string;
    status?: number;
  };
};

type AddClubAdminOptions = {
  sendCode?: (email: string) => Promise<AuthCodeDeliveryResult>;
};

export type ClubOwnerSession = {
  actorId: string;
  clubId: string;
  client: ServiceClient;
};

const emailSchema = z.string().trim().email().max(254).transform((value) =>
  value.toLowerCase(),
);

async function findUserByEmail(client: ServiceClient, email: string) {
  const perPage = 1_000;
  for (let page = 1; ; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage });
    if (result.error) failContract("AUTH_IDENTITY_LOOKUP_FAILED");
    const match = result.data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (match) return match;
    if (result.data.users.length < perPage) return null;
  }
}

async function writeOwnerAudit(
  session: ClubOwnerSession,
  input: { operation: string; userId: string; payload?: Record<string, unknown> },
) {
  const result = await session.client
    .schema("onzio")
    .from("audit_events")
    .insert({
      club_id: session.clubId,
      actor_user_id: session.actorId,
      actor_type: "user",
      operation: input.operation,
      resource_type: "club_member",
      resource_id: input.userId,
      payload: input.payload ?? {},
    });
  if (result.error) failContract("MEMBERSHIP_AUDIT_FAILED");
}

export async function assertClubOwnerSession(
  accessToken: string,
  clubId: string,
  options?: {
    client?: ServiceClient;
    now?: Date;
    verifyAccessToken?: (accessToken: string) => Promise<{
      sub: string;
      amr: unknown;
    }>;
  },
): Promise<ClubOwnerSession> {
  const client = options?.client ?? createServiceRoleClient();
  const claims = options?.verifyAccessToken
    ? await options.verifyAccessToken(accessToken)
    : await verifyAccessTokenClaims(client, accessToken);
  if (!claims || typeof claims.sub !== "string") {
    failContract("AUTHENTICATION_REQUIRED");
  }
  if (!isClubSessionFresh(claims, options?.now ?? new Date())) {
    failContract("SESSION_EXPIRED");
  }

  const membership = await client
    .schema("onzio")
    .from("club_members")
    .select("role,status,clubs!inner(lifecycle)")
    .eq("club_id", clubId)
    .eq("user_id", claims.sub)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  const club = membership.data?.clubs as unknown as
    | { lifecycle?: string }
    | Array<{ lifecycle?: string }>
    | undefined;
  const lifecycle = Array.isArray(club) ? club[0]?.lifecycle : club?.lifecycle;
  if (membership.error || !membership.data || lifecycle === "archived") {
    failContract("OWNER_REQUIRED");
  }
  return { actorId: claims.sub, clubId, client };
}

async function listActiveMembers(session: ClubOwnerSession, role: "owner" | "admin") {
  const memberships = await session.client
    .schema("onzio")
    .from("club_members")
    .select("user_id,status,created_at")
    .eq("club_id", session.clubId)
    .eq("role", role)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (memberships.error) failContract("MEMBERSHIP_READ_FAILED");

  return await Promise.all(
    (memberships.data ?? []).map(async (membership) => {
      const identity = await session.client.auth.admin.getUserById(
        membership.user_id,
      );
      return {
        userId: membership.user_id,
        email: identity.data.user?.email ?? "Unavailable",
        status: membership.status,
        createdAt: membership.created_at,
      };
    }),
  );
}

export async function listClubAdmins(session: ClubOwnerSession) {
  return await listActiveMembers(session, "admin");
}

/**
 * Every active owner of the club, the signed-in one included (admin redesign
 * decision 0013: a club can have more than one owner, and an owner with full
 * rights must never be invisible to the others). Owners are read-only here:
 * only Onzio adds, removes or transfers an owner.
 */
export async function listClubOwners(session: ClubOwnerSession) {
  return (await listActiveMembers(session, "owner")).map((owner) => ({
    ...owner,
    isYou: owner.userId === session.actorId,
  }));
}

export async function addClubAdmin(
  session: ClubOwnerSession,
  rawInput: { email: string; role: "admin" },
  options?: AddClubAdminOptions,
) {
  if (rawInput.role !== "admin") failContract("OWNER_TRANSFER_OPERATOR_REQUIRED");
  const email = emailSchema.parse(rawInput.email);
  let identity = await findUserByEmail(session.client, email);
  let identityCreated = false;
  if (!identity) {
    const created = await session.client.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      failContract("AUTH_PROVISIONING_FAILED");
    }
    identity = created.data.user;
    identityCreated = true;
  }

  const previous = await session.client
    .schema("onzio")
    .from("club_members")
    .select("role,status,removed_at")
    .eq("club_id", session.clubId)
    .eq("user_id", identity.id)
    .maybeSingle();
  if (previous.error) failContract("MEMBERSHIP_READ_FAILED");
  if (previous.data?.role === "owner") {
    failContract("OWNER_TRANSFER_OPERATOR_REQUIRED");
  }
  if (previous.data?.status === "active") failContract("MEMBERSHIP_EXISTS");

  const now = new Date().toISOString();
  // The membership write lives inside the rollback boundary: if it fails after
  // we just provisioned a brand-new auth identity, that identity has to be
  // deleted too, or it is orphaned in Auth with no club membership.
  let membershipWritten = false;
  try {
    const membership = await session.client
      .schema("onzio")
      .from("club_members")
      .upsert(
        {
          club_id: session.clubId,
          user_id: identity.id,
          role: "admin",
          status: "active",
          removed_at: null,
          updated_at: now,
        },
        { onConflict: "user_id,club_id" },
      );
    if (membership.error) failContract("MEMBERSHIP_MUTATION_FAILED");
    membershipWritten = true;

    const code = options?.sendCode
      ? await options.sendCode(email)
      : await session.client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
    if (code.error) {
      if (
        code.error.status === 429 ||
        code.error.code === "over_email_send_rate_limit"
      ) {
        failContract("AUTH_CODE_RATE_LIMITED");
      }
      failContract("AUTH_CODE_DELIVERY_FAILED");
    }
    await writeOwnerAudit(session, {
      operation: "membership_added",
      userId: identity.id,
      payload: { role: "admin", recipient_domain: email.split("@")[1] },
    });
  } catch (error) {
    // Only revert club_members when this call actually wrote it. When the
    // upsert itself failed there is nothing to revert, and the pre-existing
    // row (if any) is already the correct state.
    if (membershipWritten) {
      if (previous.data) {
        await session.client
          .schema("onzio")
          .from("club_members")
          .update(previous.data)
          .eq("club_id", session.clubId)
          .eq("user_id", identity.id);
      } else {
        await session.client
          .schema("onzio")
          .from("club_members")
          .delete()
          .eq("club_id", session.clubId)
          .eq("user_id", identity.id);
      }
    }
    // Never delete an identity we did not create in this call.
    if (identityCreated) {
      await session.client.auth.admin.deleteUser(identity.id, false);
    }
    throw error;
  }

  return { userId: identity.id, email, role: "admin" as const, codeSent: true };
}

export async function removeClubAdmin(
  session: ClubOwnerSession,
  userId: string,
) {
  const parsedUserId = z.string().uuid().parse(userId);
  const membership = await session.client
    .schema("onzio")
    .from("club_members")
    .select("role,status")
    .eq("club_id", session.clubId)
    .eq("user_id", parsedUserId)
    .maybeSingle();
  if (membership.error || !membership.data) failContract("MEMBERSHIP_REQUIRED");
  if (membership.data.role !== "admin") {
    failContract("OWNER_TRANSFER_OPERATOR_REQUIRED");
  }
  if (membership.data.status !== "active") failContract("MEMBERSHIP_INACTIVE");

  const removedAt = new Date().toISOString();
  const removal = await session.client
    .schema("onzio")
    .from("club_members")
    .update({ status: "removed", removed_at: removedAt, updated_at: removedAt })
    .eq("club_id", session.clubId)
    .eq("user_id", parsedUserId)
    .eq("role", "admin")
    .eq("status", "active");
  if (removal.error) failContract("MEMBERSHIP_MUTATION_FAILED");

  try {
    await writeOwnerAudit(session, {
      operation: "membership_removed",
      userId: parsedUserId,
      payload: { previous_role: "admin" },
    });
  } catch (error) {
    await session.client
      .schema("onzio")
      .from("club_members")
      .update({ status: "active", removed_at: null })
      .eq("club_id", session.clubId)
      .eq("user_id", parsedUserId);
    throw error;
  }
  return { userId: parsedUserId, status: "removed" as const };
}

/**
 * ADMIN-RE-02, decision 1: the club's time zone is set automatically from an
 * owner's browser, once. Writes only while time_zone_set_at is null, so a zone
 * Onzio or an earlier owner already confirmed is never overridden, and two
 * owners signing in at once can't both win. Returns whether this call saved it.
 */
export async function setClubTimeZoneOnce(
  session: ClubOwnerSession,
  timeZone: string,
): Promise<{ saved: boolean; timeZone: string }> {
  if (!isValidTimeZone(timeZone)) failContract("INVALID_TIME_ZONE");

  const current = await session.client
    .schema("onzio")
    .from("clubs")
    .select("time_zone,time_zone_set_at")
    .eq("id", session.clubId)
    .maybeSingle();
  if (current.error || !current.data) failContract("CLUB_TIME_ZONE_READ_FAILED");
  if (current.data.time_zone_set_at !== null) {
    return { saved: false, timeZone: current.data.time_zone as string };
  }

  const update = await session.client
    .schema("onzio")
    .from("clubs")
    .update({ time_zone: timeZone, time_zone_set_at: new Date().toISOString() })
    .eq("id", session.clubId)
    .is("time_zone_set_at", null)
    .select("time_zone");
  if (update.error) failContract("CLUB_TIME_ZONE_WRITE_FAILED");
  if (!update.data || update.data.length === 0) {
    // Another owner's browser confirmed it between the read and the write.
    return { saved: false, timeZone: current.data.time_zone as string };
  }

  const audit = await session.client
    .schema("onzio")
    .from("audit_events")
    .insert({
      club_id: session.clubId,
      actor_user_id: session.actorId,
      actor_type: "user",
      operation: "club_time_zone_set",
      resource_type: "club",
      resource_id: session.clubId,
      payload: { previous_value: current.data.time_zone, new_value: timeZone, source: "owner_browser" },
    });
  if (audit.error) {
    await session.client
      .schema("onzio")
      .from("clubs")
      .update({ time_zone: current.data.time_zone, time_zone_set_at: null })
      .eq("id", session.clubId);
    failContract("CLUB_TIME_ZONE_AUDIT_FAILED");
  }
  return { saved: true, timeZone };
}
