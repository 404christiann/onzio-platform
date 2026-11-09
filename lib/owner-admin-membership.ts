import { z } from "zod";
import {
  isClubSessionFresh,
  verifyAccessTokenClaims,
} from "@/lib/auth-session";
import { normalizeDisplayName } from "@/lib/admin-greeting";
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

type SendCodeOptions = {
  sendCode?: (email: string) => Promise<AuthCodeDeliveryResult>;
};

/**
 * ADMIN-RE-18: how long after Remove an owner can press Undo. Measured from the
 * row's removed_at, which removeClubAdmin sets.
 */
export const REMOVE_UNDO_WINDOW_MS = 10 * 60 * 1_000;

export type ClubOwnerSession = {
  actorId: string;
  clubId: string;
  client: ServiceClient;
};

/** Any active owner or admin of the club, with their role (ADMIN-RE-04). */
export type ClubMemberSession = ClubOwnerSession & { role: "owner" | "admin" };

type SessionCheckOptions = {
  client?: ServiceClient;
  now?: Date;
  verifyAccessToken?: (accessToken: string) => Promise<{
    sub: string;
    amr: unknown;
  }>;
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

async function assertActiveMembership(
  accessToken: string,
  clubId: string,
  roles: Array<"owner" | "admin">,
  failureCode: string,
  options?: SessionCheckOptions,
): Promise<ClubMemberSession> {
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
    .in("role", roles)
    .eq("status", "active")
    .maybeSingle();
  const club = membership.data?.clubs as unknown as
    | { lifecycle?: string }
    | Array<{ lifecycle?: string }>
    | undefined;
  const lifecycle = Array.isArray(club) ? club[0]?.lifecycle : club?.lifecycle;
  const role = membership.data?.role;
  if (
    membership.error ||
    !membership.data ||
    lifecycle === "archived" ||
    (role !== "owner" && role !== "admin")
  ) {
    failContract(failureCode);
  }
  return { actorId: claims.sub, clubId, client, role };
}

export async function assertClubOwnerSession(
  accessToken: string,
  clubId: string,
  options?: SessionCheckOptions,
): Promise<ClubOwnerSession> {
  const { actorId, client } = await assertActiveMembership(
    accessToken,
    clubId,
    ["owner"],
    "OWNER_REQUIRED",
    options,
  );
  return { actorId, clubId, client };
}

/**
 * ADMIN-RE-04: the same fresh-session and active-membership check as
 * assertClubOwnerSession, for things any owner or admin may do for themselves,
 * such as saving their own name.
 */
export async function assertClubMemberSession(
  accessToken: string,
  clubId: string,
  options?: SessionCheckOptions,
): Promise<ClubMemberSession> {
  return await assertActiveMembership(
    accessToken,
    clubId,
    ["owner", "admin"],
    "CLUB_MEMBER_REQUIRED",
    options,
  );
}

async function listActiveMembers(session: ClubOwnerSession, role: "owner" | "admin") {
  const memberships = await session.client
    .schema("onzio")
    .from("club_members")
    .select("user_id,status,created_at,display_name")
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
        displayName: (membership.display_name as string | null) ?? null,
        // ADMIN-RE-18: "Signed in Tue" / "Hasn't signed in yet" (null).
        lastSignInAt: identity.data.user?.last_sign_in_at ?? null,
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

/**
 * Emails a sign-in code through Supabase Auth, the one path both "add" and "send
 * the code again" use, so the Auth cooldown always reads as AUTH_CODE_RATE_LIMITED.
 */
async function sendSignInCode(
  session: ClubOwnerSession,
  email: string,
  options?: SendCodeOptions,
) {
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
}

/**
 * `displayName` is optional for now (decision 0010 wants it required for new
 * helpers): the old Team access page has no name field, and requiring it would
 * stop that page adding anyone. RE-18's new screen sends it; make it required
 * when the old page goes.
 */
export async function addClubAdmin(
  session: ClubOwnerSession,
  rawInput: { email: string; role: "admin"; displayName?: string },
  options?: SendCodeOptions,
) {
  if (rawInput.role !== "admin") failContract("OWNER_TRANSFER_OPERATOR_REQUIRED");
  const email = emailSchema.parse(rawInput.email);
  const displayName = rawInput.displayName === undefined
    ? undefined
    : normalizeDisplayName(rawInput.displayName);
  if (displayName === null) failContract("INVALID_DISPLAY_NAME");
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
    .select("role,status,removed_at,display_name")
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
          // Left out when no name is given, so re-adding someone keeps theirs.
          ...(displayName === undefined ? {} : { display_name: displayName }),
        },
        { onConflict: "user_id,club_id" },
      );
    if (membership.error) failContract("MEMBERSHIP_MUTATION_FAILED");
    membershipWritten = true;

    await sendSignInCode(session, email, options);
    await writeOwnerAudit(session, {
      operation: "membership_added",
      userId: identity.id,
      payload: {
        role: "admin",
        recipient_domain: email.split("@")[1],
        name_given: displayName !== undefined,
      },
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
  return {
    userId: parsedUserId,
    status: "removed" as const,
    undoUntil: new Date(Date.parse(removedAt) + REMOVE_UNDO_WINDOW_MS).toISOString(),
  };
}

/**
 * ADMIN-RE-18: Undo for Remove. Puts back an admin this owner removed, within
 * REMOVE_UNDO_WINDOW_MS of removed_at. Only the owner whose removal it was may
 * undo it (the latest membership_removed audit for that person must be theirs),
 * and the re-activation is conditional on the row still being that removal, so a
 * re-add or a second removal in between makes Undo unavailable. No code is sent:
 * their sign-in identity never went away.
 */
export async function undoRemoveClubAdmin(
  session: ClubOwnerSession,
  userId: string,
  options?: { now?: Date },
) {
  const parsedUserId = z.string().uuid().parse(userId);
  const membership = await session.client
    .schema("onzio")
    .from("club_members")
    .select("role,status,removed_at")
    .eq("club_id", session.clubId)
    .eq("user_id", parsedUserId)
    .maybeSingle();
  if (membership.error) failContract("MEMBERSHIP_READ_FAILED");
  if (!membership.data) failContract("MEMBERSHIP_REQUIRED");
  if (membership.data.role !== "admin") {
    failContract("OWNER_TRANSFER_OPERATOR_REQUIRED");
  }
  if (membership.data.status === "active") failContract("MEMBERSHIP_EXISTS");
  const removedAt = membership.data.removed_at as string | null;
  const now = (options?.now ?? new Date()).getTime();
  if (!removedAt || now - Date.parse(removedAt) > REMOVE_UNDO_WINDOW_MS) {
    failContract("MEMBERSHIP_UNDO_UNAVAILABLE");
  }

  const lastRemoval = await session.client
    .schema("onzio")
    .from("audit_events")
    .select("actor_user_id")
    .eq("club_id", session.clubId)
    .eq("resource_type", "club_member")
    .eq("resource_id", parsedUserId)
    .eq("operation", "membership_removed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRemoval.error) failContract("MEMBERSHIP_READ_FAILED");
  if (lastRemoval.data?.actor_user_id !== session.actorId) {
    failContract("MEMBERSHIP_UNDO_UNAVAILABLE");
  }

  const restore = await session.client
    .schema("onzio")
    .from("club_members")
    .update({ status: "active", removed_at: null, updated_at: new Date().toISOString() })
    .eq("club_id", session.clubId)
    .eq("user_id", parsedUserId)
    .eq("role", "admin")
    .eq("status", "removed")
    .eq("removed_at", removedAt)
    .select("user_id");
  if (restore.error) failContract("MEMBERSHIP_MUTATION_FAILED");
  if (!restore.data || restore.data.length === 0) {
    failContract("MEMBERSHIP_UNDO_UNAVAILABLE");
  }

  try {
    await writeOwnerAudit(session, {
      operation: "membership_restored",
      userId: parsedUserId,
      payload: { role: "admin", source: "undo" },
    });
  } catch (error) {
    // Put the removal back only while the row is still what this call wrote.
    const revert = await session.client
      .schema("onzio")
      .from("club_members")
      .update({ status: "removed", removed_at: removedAt, updated_at: new Date().toISOString() })
      .eq("club_id", session.clubId)
      .eq("user_id", parsedUserId)
      .eq("role", "admin")
      .eq("status", "active");
    if (revert.error) failContract("MEMBERSHIP_ROLLBACK_FAILED");
    throw error;
  }
  return { userId: parsedUserId, status: "active" as const };
}

/**
 * ADMIN-RE-18: "Send the code again". Emails a fresh sign-in code to an active
 * admin of this club, through the same Supabase Auth path and cooldown as add.
 * This sends a real email.
 */
export async function resendClubAdminCode(
  session: ClubOwnerSession,
  userId: string,
  options?: SendCodeOptions,
) {
  const parsedUserId = z.string().uuid().parse(userId);
  const membership = await session.client
    .schema("onzio")
    .from("club_members")
    .select("role,status")
    .eq("club_id", session.clubId)
    .eq("user_id", parsedUserId)
    .maybeSingle();
  if (membership.error) failContract("MEMBERSHIP_READ_FAILED");
  if (!membership.data || membership.data.role !== "admin") {
    failContract("MEMBERSHIP_REQUIRED");
  }
  if (membership.data.status !== "active") failContract("MEMBERSHIP_INACTIVE");

  const identity = await session.client.auth.admin.getUserById(parsedUserId);
  const email = identity.data.user?.email?.toLowerCase();
  if (identity.error || !email) failContract("AUTH_IDENTITY_LOOKUP_FAILED");

  await sendSignInCode(session, email, options);
  // The email has gone by now and can't be recalled; a failed audit still fails
  // the call so the gap is visible, as in addClubAdmin.
  await writeOwnerAudit(session, {
    operation: "membership_code_resent",
    userId: parsedUserId,
    payload: { role: "admin" },
  });
  return { userId: parsedUserId, codeSent: true as const };
}

/**
 * ADMIN-RE-04: save what the admin calls a person. Anyone active in the club may
 * name themselves; only an owner may name someone else, and only someone active
 * in this club. The audit event never carries the name (no PII in audit).
 */
export async function setMemberDisplayName(
  session: ClubMemberSession,
  input: { userId?: string; displayName: string },
): Promise<{ userId: string; displayName: string }> {
  const displayName = normalizeDisplayName(input.displayName);
  if (displayName === null) failContract("INVALID_DISPLAY_NAME");
  const targetId = input.userId === undefined
    ? session.actorId
    : z.string().uuid().parse(input.userId);
  const self = targetId === session.actorId;
  if (!self && session.role !== "owner") failContract("OWNER_REQUIRED");

  const membership = await session.client
    .schema("onzio")
    .from("club_members")
    .select("status,display_name")
    .eq("club_id", session.clubId)
    .eq("user_id", targetId)
    .maybeSingle();
  if (membership.error) failContract("MEMBERSHIP_READ_FAILED");
  if (!membership.data || membership.data.status !== "active") {
    failContract("MEMBERSHIP_REQUIRED");
  }
  const previous = (membership.data.display_name as string | null) ?? null;

  const update = await session.client
    .schema("onzio")
    .from("club_members")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("club_id", session.clubId)
    .eq("user_id", targetId)
    .eq("status", "active")
    .select("user_id");
  if (update.error) failContract("MEMBERSHIP_MUTATION_FAILED");
  if (!update.data || update.data.length === 0) failContract("MEMBERSHIP_REQUIRED");

  try {
    await writeOwnerAudit(session, {
      operation: "membership_renamed",
      userId: targetId,
      payload: { self, had_name: previous !== null },
    });
  } catch (error) {
    // Restore only while the row still holds the name this call wrote, so a
    // rename that landed in between is never overwritten.
    const revert = await session.client
      .schema("onzio")
      .from("club_members")
      .update({ display_name: previous })
      .eq("club_id", session.clubId)
      .eq("user_id", targetId)
      .eq("display_name", displayName);
    if (revert.error) failContract("MEMBERSHIP_ROLLBACK_FAILED");
    throw error;
  }
  return { userId: targetId, displayName };
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
