import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type RecoveryEmailResult = {
  error: null | {
    code?: string;
    status?: number;
  };
};

type AddClubAdminOptions = {
  /** The URL a newly-invited admin's password-recovery email should send
   *  them back to. Callers pass this since it depends on the inbound
   *  request's origin, which this module doesn't have direct access to. */
  redirectTo: string;
  sendRecoveryEmail?: (email: string, redirectTo: string) => Promise<RecoveryEmailResult>;
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

// PERFORMS NO AUTHORIZATION CHECK ITSELF -- this only packages an actor/club
// pair with a service-role client (full RLS bypass) into the privileged
// session type every function below trusts completely. Only call this with
// an actorId/clubId that requireMembershipRouteAuthorization (or an
// equivalent fresh authorizeAdminAccess re-check) has *just* verified for
// the current request; do not reuse a session across requests or construct
// one from unverified input. staging's original equivalent
// (assertClubOwnerSession) did its own verification as part of construction,
// so calling it WAS the check -- this version splits that responsibility out
// to lib/membership-route-auth.ts so main's password+AAL2 re-check (instead
// of staging's passwordless access-token-claims re-check) only has to be
// implemented once, but that split means this function's name alone can no
// longer be trusted to imply "verified" -- read this comment before adding
// a second call site.
export function createClubOwnerSessionFromVerifiedIdentity(
  actorId: string,
  clubId: string,
  options?: {
    client?: ServiceClient;
  },
): ClubOwnerSession {
  return { actorId, clubId, client: options?.client ?? createServiceRoleClient() };
}

export async function listClubAdmins(session: ClubOwnerSession) {
  const memberships = await session.client
    .schema("onzio")
    .from("club_members")
    .select("user_id,status,created_at")
    .eq("club_id", session.clubId)
    .eq("role", "admin")
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

export async function addClubAdmin(
  session: ClubOwnerSession,
  rawInput: { email: string; role: "admin" },
  options: AddClubAdminOptions,
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

  const now = new Date().toISOString();
  // Everything from here on lives inside the rollback boundary: if any of it
  // fails after we just provisioned a brand-new auth identity above, that
  // identity has to be deleted too, or it is orphaned in Auth with no club
  // membership -- including the `previous` lookup itself, which used to run
  // before this boundary and could leak an identity on a transient read
  // failure with no rollback at all.
  let membershipWritten = false;
  let previousRow: { role: string; status: string; removed_at: string | null } | null = null;
  try {
    const previous = await session.client
      .schema("onzio")
      .from("club_members")
      .select("role,status,removed_at")
      .eq("club_id", session.clubId)
      .eq("user_id", identity.id)
      .maybeSingle();
    if (previous.error) failContract("MEMBERSHIP_READ_FAILED");
    previousRow = previous.data;
    if (previous.data?.role === "owner") {
      failContract("OWNER_TRANSFER_OPERATOR_REQUIRED");
    }
    if (previous.data?.status === "active") failContract("MEMBERSHIP_EXISTS");

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

    // Newly-provisioned admins have no password yet -- send the same
    // password-recovery email main's own /admin/login "Forgot your
    // password?" flow sends, so they land on /admin/update-password (via
    // /admin/auth/callback) and set one instead of trying to sign in with
    // a password that was never set.
    const recovery = options.sendRecoveryEmail
      ? await options.sendRecoveryEmail(email, options.redirectTo)
      : await session.client.auth.resetPasswordForEmail(email, {
          redirectTo: options.redirectTo,
        });
    if (recovery.error) {
      if (
        recovery.error.status === 429 ||
        recovery.error.code === "over_email_send_rate_limit"
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

    return { userId: identity.id, email, role: "admin" as const, codeSent: true };
  } catch (error) {
    // Only revert club_members when this call actually wrote it. When the
    // upsert itself failed (or never ran, e.g. the `previous` read failed)
    // there is nothing to revert, and any pre-existing row is already the
    // correct state. The `.eq("updated_at", now)` guard on both branches
    // makes the revert a no-op if a second request already wrote its own
    // change to this same row after us (e.g. a concurrent retry that
    // succeeded) -- without it, reverting to the *snapshot* taken before our
    // own upsert could stomp on a legitimate later write neither of us knew
    // about yet.
    if (membershipWritten) {
      if (previousRow) {
        await session.client
          .schema("onzio")
          .from("club_members")
          .update(previousRow)
          .eq("club_id", session.clubId)
          .eq("user_id", identity.id)
          .eq("updated_at", now);
      } else {
        await session.client
          .schema("onzio")
          .from("club_members")
          .delete()
          .eq("club_id", session.clubId)
          .eq("user_id", identity.id)
          .eq("updated_at", now);
      }
    }
    // Never delete an identity we did not create in this call.
    if (identityCreated) {
      await session.client.auth.admin.deleteUser(identity.id, false);
    }
    throw error;
  }
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
