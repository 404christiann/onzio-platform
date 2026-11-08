import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  addClubAdmin,
  assertClubMemberSession,
  assertClubOwnerSession,
  listClubAdmins,
  listClubOwners,
  removeClubAdmin,
  setMemberDisplayName,
} from "@/lib/owner-admin-membership";
import { expectContractError } from "../helpers/contract";
import { assertSafeTestEnvironment } from "../helpers/environment";
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

    await expectContractError(
      () =>
        addClubAdmin(
          { actorId: ownerId, clubId: missingClubId, client: service },
          { email: adminEmail, role: "admin" },
          { sendCode: async () => ({ error: null }) },
        ),
      "MEMBERSHIP_MUTATION_FAILED",
    );

    await expect(findIdentity()).resolves.toBeUndefined();
  });

  it("lists every active owner to each owner, read-only (decision 0013)", async () => {
    const { service } = createLocalClients();
    const clubId = randomUUID();
    const people = ["owner", "second-owner", "removed-owner", "admin"].map((label) => ({
      label,
      id: randomUUID(),
      email: `${label}-${clubId}@onzio.local`,
    }));
    for (const person of people) {
      const created = await service.auth.admin.createUser({ id: person.id, email: person.email, email_confirm: true });
      if (created.error) throw created.error;
    }
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `two-owners-${clubId.slice(0, 8)}`,
      name: "Two Owners Contract FC",
      lifecycle: "active",
      public_access: "preview",
      tier: "starter",
    });
    if (club.error) throw club.error;
    const [owner, secondOwner, removedOwner, admin] = people;
    const memberships = await service.from("club_members").insert([
      { club_id: clubId, user_id: owner.id, role: "owner", status: "active" },
      { club_id: clubId, user_id: secondOwner.id, role: "owner", status: "active" },
      { club_id: clubId, user_id: removedOwner.id, role: "owner", status: "removed", removed_at: new Date().toISOString() },
      { club_id: clubId, user_id: admin.id, role: "admin", status: "active" },
    ]);
    if (memberships.error) throw memberships.error;
    cleanups.push(async () => {
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      for (const person of people) await service.auth.admin.deleteUser(person.id, false);
    });

    const session = await assertClubOwnerSession(accessToken(owner.id, owner.email), clubId, {
      client: service,
      verifyAccessToken: async () => ({
        sub: owner.id,
        amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1_000) }],
      }),
    });
    const owners = await listClubOwners(session);
    expect(owners.map(({ userId, email, isYou }) => ({ userId, email, isYou })).sort((a, b) => a.email.localeCompare(b.email))).toEqual(
      [
        { userId: owner.id, email: owner.email, isYou: true },
        { userId: secondOwner.id, email: secondOwner.email, isYou: false },
      ].sort((a, b) => a.email.localeCompare(b.email)),
    );
    expect((await listClubAdmins(session)).map((member) => member.userId)).toEqual([admin.id]);
    await expectContractError(
      () => removeClubAdmin(session, secondOwner.id),
      "OWNER_TRANSFER_OPERATOR_REQUIRED",
    );
    const unchanged = await service.from("club_members").select("role,status")
      .eq("club_id", clubId).eq("user_id", secondOwner.id).single();
    expect(unchanged.data).toEqual({ role: "owner", status: "active" });
  });

  it("lets each member name themselves and only an owner name someone else (ADMIN-RE-04)", async () => {
    const { service } = createLocalClients();
    const clubId = randomUUID();
    const people = ["owner", "admin", "other-admin", "removed-admin", "outsider"].map((label) => ({
      label,
      id: randomUUID(),
      email: `${label}-${clubId}@onzio.local`,
    }));
    for (const person of people) {
      const created = await service.auth.admin.createUser({ id: person.id, email: person.email, email_confirm: true });
      if (created.error) throw created.error;
    }
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `names-${clubId.slice(0, 8)}`,
      name: "Names Contract FC",
      lifecycle: "active",
      public_access: "preview",
      tier: "starter",
    });
    if (club.error) throw club.error;
    const [owner, admin, otherAdmin, removedAdmin, outsider] = people;
    const memberships = await service.from("club_members").insert([
      { club_id: clubId, user_id: owner.id, role: "owner", status: "active" },
      { club_id: clubId, user_id: admin.id, role: "admin", status: "active" },
      { club_id: clubId, user_id: otherAdmin.id, role: "admin", status: "active" },
      { club_id: clubId, user_id: removedAdmin.id, role: "admin", status: "removed", removed_at: new Date().toISOString() },
    ]);
    if (memberships.error) throw memberships.error;
    cleanups.push(async () => {
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      for (const person of people) await service.auth.admin.deleteUser(person.id, false);
    });
    const optionsFor = (userId: string) => ({
      client: service,
      verifyAccessToken: async () => ({
        sub: userId,
        amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1_000) }],
      }),
    });
    const sessionFor = (userId: string) => assertClubMemberSession("unused", clubId, optionsFor(userId));
    const nameOf = async (userId: string) =>
      (await service.from("club_members").select("display_name").eq("club_id", clubId).eq("user_id", userId).single()).data?.display_name;

    // The any-member check accepts an admin; the owner check still doesn't.
    const ownerSession = await sessionFor(owner.id);
    const adminSession = await sessionFor(admin.id);
    expect(ownerSession.role).toBe("owner");
    expect(adminSession.role).toBe("admin");
    await expectContractError(
      () => assertClubOwnerSession("unused", clubId, optionsFor(admin.id)),
      "OWNER_REQUIRED",
    );
    await expectContractError(() => sessionFor(outsider.id), "CLUB_MEMBER_REQUIRED");
    await expectContractError(() => sessionFor(removedAdmin.id), "CLUB_MEMBER_REQUIRED");

    // An admin names themselves; the saved name is trimmed.
    await expect(setMemberDisplayName(adminSession, { displayName: "  Andrea \n Lopez " })).resolves.toEqual({
      userId: admin.id,
      displayName: "Andrea Lopez",
    });
    // Naming yourself by your own id works too.
    await setMemberDisplayName(adminSession, { userId: admin.id, displayName: "Andrea" });
    expect(await nameOf(admin.id)).toBe("Andrea");

    // The member reads their own name back under RLS with their own session.
    const { supabaseUrl } = assertSafeTestEnvironment();
    const asAdmin = createClient(supabaseUrl, process.env.SUPABASE_TEST_ANON_KEY ?? "local-anon-key-not-configured", {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "onzio" },
      global: { headers: { Authorization: `Bearer ${accessToken(admin.id, admin.email)}` } },
    });
    const ownRow = await asAdmin.from("club_members").select("user_id,display_name").eq("club_id", clubId);
    expect(ownRow.error).toBeNull();
    expect(ownRow.data).toEqual([{ user_id: admin.id, display_name: "Andrea" }]);

    // An owner names another member; the list carries names, null when unnamed.
    await setMemberDisplayName(ownerSession, { userId: otherAdmin.id, displayName: "Marco" });
    const admins = await listClubAdmins(ownerSession);
    expect(admins.map(({ userId, displayName }) => ({ userId, displayName })).sort((a, b) => a.userId.localeCompare(b.userId))).toEqual(
      [
        { userId: admin.id, displayName: "Andrea" },
        { userId: otherAdmin.id, displayName: "Marco" },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
    expect((await listClubOwners(ownerSession))[0]).toMatchObject({ userId: owner.id, displayName: null, isYou: true });

    // An admin may not name anyone else, owner included.
    await expectContractError(
      () => setMemberDisplayName(adminSession, { userId: otherAdmin.id, displayName: "Nope" }),
      "OWNER_REQUIRED",
    );
    await expectContractError(
      () => setMemberDisplayName(adminSession, { userId: owner.id, displayName: "Nope" }),
      "OWNER_REQUIRED",
    );
    expect(await nameOf(otherAdmin.id)).toBe("Marco");
    expect(await nameOf(owner.id)).toBeNull();

    // An owner may only name someone active in this club.
    await expectContractError(
      () => setMemberDisplayName(ownerSession, { userId: removedAdmin.id, displayName: "Gone" }),
      "MEMBERSHIP_REQUIRED",
    );
    await expectContractError(
      () => setMemberDisplayName(ownerSession, { userId: outsider.id, displayName: "Stranger" }),
      "MEMBERSHIP_REQUIRED",
    );
    expect(await nameOf(removedAdmin.id)).toBeNull();

    // 120 characters saves; 121 and blank are refused before the database.
    await setMemberDisplayName(ownerSession, { displayName: "x".repeat(120) });
    expect(await nameOf(owner.id)).toBe("x".repeat(120));
    await expectContractError(
      () => setMemberDisplayName(ownerSession, { displayName: "y".repeat(121) }),
      "INVALID_DISPLAY_NAME",
    );
    await expectContractError(
      () => setMemberDisplayName(adminSession, { displayName: "   " }),
      "INVALID_DISPLAY_NAME",
    );
    expect(await nameOf(owner.id)).toBe("x".repeat(120));
    expect(await nameOf(admin.id)).toBe("Andrea");

    // The database check agrees, for anything that skips the library.
    const tooLong = await service.from("club_members").update({ display_name: "z".repeat(121) })
      .eq("club_id", clubId).eq("user_id", owner.id);
    expect(tooLong.error?.message).toContain("club_members_display_name_length");
    const blank = await service.from("club_members").update({ display_name: "   " })
      .eq("club_id", clubId).eq("user_id", owner.id);
    expect(blank.error?.message).toContain("club_members_display_name_length");

    // Every rename is audited, and no audit row carries a name.
    const audits = await service.from("audit_events")
      .select("actor_user_id,operation,resource_id,payload")
      .eq("club_id", clubId)
      .order("id");
    expect(audits.data).toEqual([
      { actor_user_id: admin.id, operation: "membership_renamed", resource_id: admin.id, payload: { self: true, had_name: false } },
      { actor_user_id: admin.id, operation: "membership_renamed", resource_id: admin.id, payload: { self: true, had_name: true } },
      { actor_user_id: owner.id, operation: "membership_renamed", resource_id: otherAdmin.id, payload: { self: false, had_name: false } },
      { actor_user_id: owner.id, operation: "membership_renamed", resource_id: owner.id, payload: { self: true, had_name: false } },
    ]);
    const auditText = JSON.stringify(audits.data);
    for (const name of ["Andrea", "Lopez", "Marco", "x".repeat(120)]) expect(auditText).not.toContain(name);
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
