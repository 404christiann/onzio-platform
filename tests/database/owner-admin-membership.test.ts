import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  addClubAdmin,
  createClubOwnerSessionFromVerifiedIdentity,
  listClubAdmins,
  removeClubAdmin,
} from "@/lib/owner-admin-membership";
import { expectContractError } from "../helpers/contract";
import { createLocalClients } from "../helpers/supabase";

const REDIRECT_TO = "http://alpha.localhost:3000/admin/auth/callback";

describe("club owner admin membership", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  it("lets a fresh owner add and remove only an admin", async () => {
    const { service } = createLocalClients();
    const ownerId = randomUUID();
    const clubId = randomUUID();
    const adminEmail = `admin-${clubId}@onzio.local`;
    const owner = await service.auth.admin.createUser({
      id: ownerId,
      email: `owner-${ownerId}@onzio.local`,
      email_confirm: true,
    });
    if (owner.error) throw owner.error;
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `owner-admin-${clubId.slice(0, 8)}`,
      name: "Owner Admin Contract FC",
      lifecycle: "active",
      public_access: "live",
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

    // createClubOwnerSessionFromVerifiedIdentity does no verification of its
    // own -- in production, requireMembershipRouteAuthorization does that
    // re-check before this is ever constructed (see
    // tests/contracts/authorization.test.ts for that boundary). This test is
    // about the mutation/rollback logic downstream of that check, so it
    // constructs the session directly rather than re-testing authorization.
    const session = createClubOwnerSessionFromVerifiedIdentity(ownerId, clubId, {
      client: service,
    });
    const added = await addClubAdmin(
      session,
      { email: adminEmail, role: "admin" },
      { redirectTo: REDIRECT_TO, sendRecoveryEmail: async () => ({ error: null }) },
    );
    expect(added).toMatchObject({ email: adminEmail, role: "admin", codeSent: true });
    await expect(
      addClubAdmin(
        session,
        { email: adminEmail, role: "owner" as "admin" },
        { redirectTo: REDIRECT_TO, sendRecoveryEmail: async () => ({ error: null }) },
      ),
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
      { redirectTo: REDIRECT_TO, sendRecoveryEmail: async () => ({ error: null }) },
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

    const audits = await service
      .from("audit_events")
      .select("actor_user_id,actor_type,operation")
      .eq("club_id", clubId)
      .order("id");
    expect(audits.data).toEqual([
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_added" },
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_removed" },
      { actor_user_id: ownerId, actor_type: "user", operation: "membership_added" },
    ]);
  });

  it("deletes a just-created identity when the membership write fails", async () => {
    const { service } = createLocalClients();
    const ownerId = randomUUID();
    // No club row exists for this id, so the club_members upsert fails its
    // foreign key *after* addClubAdmin has provisioned a brand-new identity.
    const missingClubId = randomUUID();
    const adminEmail = `orphan-${missingClubId}@onzio.local`;

    const findIdentity = async () => {
      const identities = await service.auth.admin.listUsers({
        page: 1,
        perPage: 1_000,
      });
      return identities.data.users.find(
        (user) => user.email?.toLowerCase() === adminEmail,
      );
    };

    cleanups.push(async () => {
      const leaked = await findIdentity();
      if (leaked) await service.auth.admin.deleteUser(leaked.id, false);
    });

    const session = createClubOwnerSessionFromVerifiedIdentity(ownerId, missingClubId, {
      client: service,
    });
    await expectContractError(
      () =>
        addClubAdmin(
          session,
          { email: adminEmail, role: "admin" },
          { redirectTo: REDIRECT_TO, sendRecoveryEmail: async () => ({ error: null }) },
        ),
      "MEMBERSHIP_MUTATION_FAILED",
    );

    await expect(findIdentity()).resolves.toBeUndefined();
  });

  it("deletes a just-created identity when the pre-write membership read fails", async () => {
    // Regression test: the `previous` club_members lookup used to run
    // *before* the rollback boundary, so a failure here leaked the
    // just-created auth identity with no cleanup at all. Using a malformed
    // clubId (not a UUID) makes the `.eq("club_id", ...)` lookup itself
    // fail at the database layer, exercising that exact failure point.
    const { service } = createLocalClients();
    const ownerId = randomUUID();
    const malformedClubId = "not-a-uuid";
    const adminEmail = `preread-orphan-${randomUUID()}@onzio.local`;

    const findIdentity = async () => {
      const identities = await service.auth.admin.listUsers({
        page: 1,
        perPage: 1_000,
      });
      return identities.data.users.find(
        (user) => user.email?.toLowerCase() === adminEmail,
      );
    };

    cleanups.push(async () => {
      const leaked = await findIdentity();
      if (leaked) await service.auth.admin.deleteUser(leaked.id, false);
    });

    const session = createClubOwnerSessionFromVerifiedIdentity(ownerId, malformedClubId, {
      client: service,
    });
    await expectContractError(
      () =>
        addClubAdmin(
          session,
          { email: adminEmail, role: "admin" },
          { redirectTo: REDIRECT_TO, sendRecoveryEmail: async () => ({ error: null }) },
        ),
      "MEMBERSHIP_READ_FAILED",
    );

    await expect(findIdentity()).resolves.toBeUndefined();
  });
});
