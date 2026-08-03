import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  addClubAdmin,
  assertClubOwnerSession,
  listClubAdmins,
  removeClubAdmin,
} from "@/lib/owner-admin-membership";
import { expectContractError } from "../helpers/contract";
import { createLocalClients } from "../helpers/supabase";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessToken(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "http://127.0.0.1:54321/auth/v1",
    aud: "authenticated",
    exp: now + 3_600,
    iat: now,
    sub: userId,
    role: "authenticated",
    aal: "aal1",
    session_id: randomUUID(),
    email,
    amr: [{ method: "otp", timestamp: now }],
  });
  const unsigned = `${header}.${payload}`;
  const secret =
    process.env.SUPABASE_TEST_JWT_SECRET ??
    "super-secret-jwt-token-with-at-least-32-characters-long";
  return `${unsigned}.${createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64url")}`;
}

describe("club owner admin membership", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  it("lets a fresh owner add and remove only an admin", async () => {
    const { service } = createLocalClients();
    const ownerId = randomUUID();
    const clubId = randomUUID();
    const ownerEmail = `owner-${ownerId}@onzio.local`;
    const adminEmail = `admin-${clubId}@onzio.local`;
    const owner = await service.auth.admin.createUser({
      id: ownerId,
      email: ownerEmail,
      email_confirm: true,
    });
    if (owner.error) throw owner.error;
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `owner-admin-${clubId.slice(0, 8)}`,
      name: "Owner Admin Contract FC",
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
    });
    if (club.error) throw club.error;
    const membership = await service.from("club_members").insert({
      club_id: clubId,
      user_id: ownerId,
      role: "owner",
      status: "active",
    });
    if (membership.error) throw membership.error;

    cleanups.push(async () => {
      const identities = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
      const admin = identities.data.users.find(
        (user) => user.email?.toLowerCase() === adminEmail,
      );
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      if (admin) await service.auth.admin.deleteUser(admin.id, false);
      await service.auth.admin.deleteUser(ownerId, false);
    });

    const session = await assertClubOwnerSession(
      accessToken(ownerId, ownerEmail),
      clubId,
      {
        client: service,
        verifyAccessToken: async () => ({
          sub: ownerId,
          amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1_000) }],
        }),
      },
    );
    const added = await addClubAdmin(session, {
      email: adminEmail,
      role: "admin",
    });
    expect(added).toMatchObject({ email: adminEmail, role: "admin", codeSent: true });
    await expect(
      addClubAdmin(session, { email: adminEmail, role: "owner" as "admin" }),
    ).rejects.toMatchObject({ code: "OWNER_TRANSFER_OPERATOR_REQUIRED" });
    await expect(listClubAdmins(session)).resolves.toContainEqual(
      expect.objectContaining({ userId: added.userId, email: adminEmail }),
    );
    await expect(removeClubAdmin(session, added.userId)).resolves.toEqual({
      userId: added.userId,
      status: "removed",
    });

    const removed = await service
      .from("club_members")
      .select("role,status")
      .eq("club_id", clubId)
      .eq("user_id", added.userId)
      .single();
    expect(removed.data).toEqual({ role: "admin", status: "removed" });

    const readded = await addClubAdmin(
      session,
      { email: adminEmail, role: "admin" },
      { sendCode: async () => ({ error: null }) },
    );
    expect(readded).toMatchObject({
      userId: added.userId,
      email: adminEmail,
      role: "admin",
      codeSent: true,
    });
    const reactivated = await service
      .from("club_members")
      .select("role,status,removed_at")
      .eq("club_id", clubId)
      .eq("user_id", added.userId)
      .single();
    expect(reactivated.data).toEqual({
      role: "admin",
      status: "active",
      removed_at: null,
    });

    await removeClubAdmin(session, added.userId);
    await expect(
      addClubAdmin(session, { email: adminEmail, role: "admin" }),
    ).rejects.toMatchObject({ code: "AUTH_CODE_RATE_LIMITED" });
    const stillRemoved = await service
      .from("club_members")
      .select("status,removed_at")
      .eq("club_id", clubId)
      .eq("user_id", added.userId)
      .single();
    expect(stillRemoved.data?.status).toBe("removed");
    expect(stillRemoved.data?.removed_at).not.toBeNull();

    const audits = await service
      .from("audit_events")
      .select("actor_user_id,actor_type,operation")
      .eq("club_id", clubId)
      .order("id");
    expect(audits.data).toEqual([
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_added" },
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_removed" },
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_added" },
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_removed" },
    ]);
  });

  it("rejects a non-owner even with a valid fresh token", async () => {
    const { service } = createLocalClients();
    const outsiderId = randomUUID();
    const outsiderEmail = `outsider-${outsiderId}@onzio.local`;
    const outsider = await service.auth.admin.createUser({
      id: outsiderId,
      email: outsiderEmail,
      email_confirm: true,
    });
    if (outsider.error) throw outsider.error;
    cleanups.push(async () => {
      await service.auth.admin.deleteUser(outsiderId, false);
    });
    await expectContractError(
      () =>
        assertClubOwnerSession(
          accessToken(outsiderId, outsiderEmail),
          randomUUID(),
          {
            client: service,
            verifyAccessToken: async () => ({
              sub: outsiderId,
              amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1_000) }],
            }),
          },
        ),
      "OWNER_REQUIRED",
    );
  });
});
