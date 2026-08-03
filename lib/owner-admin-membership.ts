import { z } from "zod";
import {
  isClubSessionFresh,
  verifyAccessTokenClaims,
} from "@/lib/auth-session";
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

  try {
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
