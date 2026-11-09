import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  addClubAdmin,
  assertClubMemberSession,
  assertClubOwnerSession,
  listClubAdmins,
  listClubOwners,
  REMOVE_UNDO_WINDOW_MS,
  removeClubAdmin,
  resendClubAdminCode,
  setMemberDisplayName,
  undoRemoveClubAdmin,
  type ClubOwnerSession,
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
    await expect(removeClubAdmin(session, added.userId)).resolves.toMatchObject({
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

// ADMIN-RE-18: who can sign in. Last sign-in on the lists, "Send the code again",
// Remove with Undo, and a name for new helpers (decision 0010), plus the RE-04
// review follow-ups (format characters in names, a careful rename rollback).
describe("who can sign in (ADMIN-RE-18)", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  type Person = { id: string; email: string };

  async function seedClub(prefix: string, labels: string[]) {
    const { service } = createLocalClients();
    const clubId = randomUUID();
    const people: Record<string, Person> = {};
    for (const label of labels) {
      const person = { id: randomUUID(), email: `${label}-${clubId}@onzio.local` };
      const created = await service.auth.admin.createUser({ id: person.id, email: person.email, email_confirm: true });
      if (created.error) throw created.error;
      people[label] = person;
    }
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `${prefix}-${clubId.slice(0, 8)}`,
      name: `${prefix} Contract FC`,
      lifecycle: "active",
      public_access: "preview",
      tier: "starter",
    });
    if (club.error) throw club.error;
    cleanups.push(async () => {
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      for (const person of Object.values(people)) await service.auth.admin.deleteUser(person.id, false);
    });
    const members = async (rows: Array<Record<string, unknown>>) => {
      const inserted = await service.from("club_members").insert(rows.map((row) => ({ club_id: clubId, ...row })));
      if (inserted.error) throw inserted.error;
    };
    const optionsFor = (userId: string) => ({
      client: service,
      verifyAccessToken: async () => ({
        sub: userId,
        amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1_000) }],
      }),
    });
    const ownerSession = (userId: string) => assertClubOwnerSession("unused", clubId, optionsFor(userId));
    const memberSession = (userId: string) => assertClubMemberSession("unused", clubId, optionsFor(userId));
    const row = async (userId: string) =>
      (await service.from("club_members").select("role,status,removed_at,display_name")
        .eq("club_id", clubId).eq("user_id", userId).single()).data;
    const audits = async () =>
      (await service.from("audit_events").select("actor_user_id,operation,resource_id,payload")
        .eq("club_id", clubId).order("id")).data ?? [];
    return { service, clubId, people, members, optionsFor, ownerSession, memberSession, row, audits };
  }

  // A client whose audit insert fails, optionally after doing something first
  // (to stand in for a change that lands between the write and the rollback).
  function withFailingAudit(service: ClubOwnerSession["client"], beforeFail?: () => Promise<void>) {
    const bind = (target: object, key: PropertyKey) => {
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    };
    return new Proxy(service, {
      get(target, key) {
        if (key !== "schema") return bind(target, key);
        return (name: string) => {
          const scoped = target.schema(name);
          return new Proxy(scoped, {
            get(inner, innerKey) {
              if (innerKey !== "from") return bind(inner, innerKey);
              return (table: string) => {
                const query = inner.from(table);
                if (table !== "audit_events") return query;
                return new Proxy(query, {
                  get(builder, builderKey) {
                    if (builderKey !== "insert") return bind(builder, builderKey);
                    return async () => {
                      await beforeFail?.();
                      return { error: { message: "forced audit failure" } };
                    };
                  },
                });
              };
            },
          });
        };
      },
    }) as ClubOwnerSession["client"];
  }

  it("lists each person's last sign-in, null until they first sign in", async () => {
    const club = await seedClub("last-sign-in", ["owner", "signed-in", "never"]);
    const { owner, "signed-in": signedIn, never } = club.people;
    await club.members([
      { user_id: owner.id, role: "owner", status: "active" },
      { user_id: signedIn.id, role: "admin", status: "active" },
      { user_id: never.id, role: "admin", status: "active" },
    ]);

    // Sign one admin in the real passwordless way: a one-time email code.
    const link = await club.service.auth.admin.generateLink({ type: "magiclink", email: signedIn.email });
    if (link.error) throw link.error;
    const before = Date.now();
    const { anon } = createLocalClients();
    const verified = await anon.auth.verifyOtp({
      email: signedIn.email,
      token: link.data.properties.email_otp,
      type: "email",
    });
    if (verified.error) throw verified.error;

    const session = await club.ownerSession(owner.id);
    const admins = await listClubAdmins(session);
    const byId = new Map(admins.map((admin) => [admin.userId, admin.lastSignInAt]));
    expect(byId.get(never.id)).toBeNull();
    const signedInAt = byId.get(signedIn.id);
    expect(typeof signedInAt).toBe("string");
    expect(Date.parse(signedInAt as string)).toBeGreaterThanOrEqual(before - 5_000);
    expect(Date.parse(signedInAt as string)).toBeLessThanOrEqual(Date.now() + 5_000);
    const owners = await listClubOwners(session);
    expect(owners).toEqual([expect.objectContaining({ userId: owner.id, lastSignInAt: null, isYou: true })]);
  });

  it("sends the code again only to an active admin of this club, through the real Auth path", async () => {
    const club = await seedClub("resend", ["owner", "second-owner", "admin", "helper", "removed-admin", "outsider"]);
    const other = await seedClub("resend-other", ["other-owner", "other-admin"]);
    const { owner, "second-owner": secondOwner, admin, helper, "removed-admin": removedAdmin, outsider } = club.people;
    await club.members([
      { user_id: owner.id, role: "owner", status: "active" },
      { user_id: secondOwner.id, role: "owner", status: "active" },
      { user_id: admin.id, role: "admin", status: "active" },
      { user_id: helper.id, role: "admin", status: "active" },
      { user_id: removedAdmin.id, role: "admin", status: "removed", removed_at: new Date().toISOString() },
    ]);
    await other.members([
      { user_id: other.people["other-owner"].id, role: "owner", status: "active" },
      { user_id: other.people["other-admin"].id, role: "admin", status: "active" },
    ]);

    // Only an owner gets a session that can resend; an admin is refused.
    await expectContractError(
      () => assertClubOwnerSession("unused", club.clubId, club.optionsFor(helper.id)),
      "OWNER_REQUIRED",
    );

    const session = await club.ownerSession(owner.id);
    const sent: string[] = [];
    const stub = async (email: string) => {
      sent.push(email);
      return { error: null };
    };
    await expect(resendClubAdminCode(session, admin.id, { sendCode: stub })).resolves.toEqual({
      userId: admin.id,
      codeSent: true,
    });
    expect(sent).toEqual([admin.email]);

    // Never to an owner, someone removed, someone outside the club, or another club's admin.
    await expectContractError(() => resendClubAdminCode(session, secondOwner.id, { sendCode: stub }), "MEMBERSHIP_REQUIRED");
    await expectContractError(() => resendClubAdminCode(session, removedAdmin.id, { sendCode: stub }), "MEMBERSHIP_INACTIVE");
    await expectContractError(() => resendClubAdminCode(session, outsider.id, { sendCode: stub }), "MEMBERSHIP_REQUIRED");
    await expectContractError(
      () => resendClubAdminCode(session, other.people["other-admin"].id, { sendCode: stub }),
      "MEMBERSHIP_REQUIRED",
    );
    expect(sent).toHaveLength(1);

    // Auth's answers keep the add path's meaning.
    await expectContractError(
      () => resendClubAdminCode(session, admin.id, { sendCode: async () => ({ error: { status: 429 } }) }),
      "AUTH_CODE_RATE_LIMITED",
    );
    await expectContractError(
      () => resendClubAdminCode(session, admin.id, { sendCode: async () => ({ error: { code: "over_email_send_rate_limit" } }) }),
      "AUTH_CODE_RATE_LIMITED",
    );
    await expectContractError(
      () => resendClubAdminCode(session, admin.id, { sendCode: async () => ({ error: { status: 500, code: "unexpected_failure" } }) }),
      "AUTH_CODE_DELIVERY_FAILED",
    );

    // The real signInWithOtp path: one code goes, a second within a minute is held back.
    await expect(resendClubAdminCode(session, helper.id)).resolves.toEqual({ userId: helper.id, codeSent: true });
    await expectContractError(() => resendClubAdminCode(session, helper.id), "AUTH_CODE_RATE_LIMITED");

    // Each code that went is audited, with no address in the payload.
    const rows = await club.audits();
    expect(rows).toEqual([
      { actor_user_id: owner.id, operation: "membership_code_resent", resource_id: admin.id, payload: { role: "admin" } },
      { actor_user_id: owner.id, operation: "membership_code_resent", resource_id: helper.id, payload: { role: "admin" } },
    ]);
    expect(JSON.stringify(rows)).not.toContain("@");
  });

  it("undoes a removal for the owner who made it, within the undo window only", async () => {
    const club = await seedClub("undo", ["owner", "second-owner", "admin", "legacy-removed", "former-owner", "outsider"]);
    const other = await seedClub("undo-other", ["other-owner", "other-admin"]);
    const { owner, "second-owner": secondOwner, admin, "legacy-removed": legacy, "former-owner": formerOwner, outsider } = club.people;
    const removedLongAgo = new Date().toISOString();
    await club.members([
      { user_id: owner.id, role: "owner", status: "active" },
      { user_id: secondOwner.id, role: "owner", status: "active" },
      { user_id: admin.id, role: "admin", status: "active", display_name: "Sam" },
      // Removed without an audit row from this owner, as older removals were.
      { user_id: legacy.id, role: "admin", status: "removed", removed_at: removedLongAgo },
      { user_id: formerOwner.id, role: "owner", status: "removed", removed_at: removedLongAgo },
    ]);
    await other.members([
      { user_id: other.people["other-owner"].id, role: "owner", status: "active" },
      { user_id: other.people["other-admin"].id, role: "admin", status: "active" },
    ]);
    const session = await club.ownerSession(owner.id);
    const secondSession = await club.ownerSession(secondOwner.id);
    expect(REMOVE_UNDO_WINDOW_MS).toBe(10 * 60 * 1_000);

    const removed = await removeClubAdmin(session, admin.id);
    const removedAt = (await club.row(admin.id))?.removed_at as string;
    expect(removed.undoUntil).toBe(new Date(Date.parse(removedAt) + REMOVE_UNDO_WINDOW_MS).toISOString());

    // Another owner didn't make this removal, so has no Undo for it.
    await expectContractError(() => undoRemoveClubAdmin(secondSession, admin.id), "MEMBERSHIP_UNDO_UNAVAILABLE");

    // One millisecond past the window is too late, and changes nothing.
    await expectContractError(
      () => undoRemoveClubAdmin(session, admin.id, { now: new Date(Date.parse(removedAt) + REMOVE_UNDO_WINDOW_MS + 1) }),
      "MEMBERSHIP_UNDO_UNAVAILABLE",
    );
    expect(await club.row(admin.id)).toEqual({ role: "admin", status: "removed", removed_at: removedAt, display_name: "Sam" });

    // The last moment of the window still works, and the name is still there.
    await expect(
      undoRemoveClubAdmin(session, admin.id, { now: new Date(Date.parse(removedAt) + REMOVE_UNDO_WINDOW_MS) }),
    ).resolves.toEqual({ userId: admin.id, status: "active" });
    expect(await club.row(admin.id)).toEqual({ role: "admin", status: "active", removed_at: null, display_name: "Sam" });
    await expect(listClubAdmins(session)).resolves.toEqual([expect.objectContaining({ userId: admin.id, displayName: "Sam" })]);

    // Nothing to undo for someone already active, an owner, someone never in
    // the club, an older removal with no record of this owner making it, or
    // another club's removal.
    await expectContractError(() => undoRemoveClubAdmin(session, admin.id), "MEMBERSHIP_EXISTS");
    await expectContractError(() => undoRemoveClubAdmin(session, formerOwner.id), "OWNER_TRANSFER_OPERATOR_REQUIRED");
    await expectContractError(() => undoRemoveClubAdmin(session, outsider.id), "MEMBERSHIP_REQUIRED");
    await expectContractError(() => undoRemoveClubAdmin(session, legacy.id), "MEMBERSHIP_UNDO_UNAVAILABLE");
    const otherSession = await other.ownerSession(other.people["other-owner"].id);
    await removeClubAdmin(otherSession, other.people["other-admin"].id);
    await expectContractError(() => undoRemoveClubAdmin(session, other.people["other-admin"].id), "MEMBERSHIP_REQUIRED");
    expect((await other.row(other.people["other-admin"].id))?.status).toBe("removed");
    expect((await club.row(legacy.id))?.status).toBe("removed");

    // If the Undo can't be recorded, the removal stands exactly as it was.
    await removeClubAdmin(session, admin.id);
    const secondRemovedAt = (await club.row(admin.id))?.removed_at as string;
    await expectContractError(
      () => undoRemoveClubAdmin({ ...session, client: withFailingAudit(club.service) }, admin.id),
      "MEMBERSHIP_AUDIT_FAILED",
    );
    expect(await club.row(admin.id)).toEqual({ role: "admin", status: "removed", removed_at: secondRemovedAt, display_name: "Sam" });

    expect(await club.audits()).toEqual([
      { actor_user_id: owner.id, operation: "membership_removed", resource_id: admin.id, payload: { previous_role: "admin" } },
      { actor_user_id: owner.id, operation: "membership_restored", resource_id: admin.id, payload: { role: "admin", source: "undo" } },
      { actor_user_id: owner.id, operation: "membership_removed", resource_id: admin.id, payload: { previous_role: "admin" } },
    ]);
  });

  it("saves a new helper's name on add, and keeps format characters out of names", async () => {
    // Registered before the club, so it runs after the club's rows are gone
    // (club_members restricts deleting an identity it still points at).
    const tag = randomUUID();
    const helperEmail = `helper-${tag}@onzio.local`;
    const blankEmail = `blank-${tag}@onzio.local`;
    const { service } = createLocalClients();
    const findIdentity = async (email: string) =>
      (await service.auth.admin.listUsers({ page: 1, perPage: 1_000 })).data.users.find(
        (user) => user.email?.toLowerCase() === email,
      );
    cleanups.push(async () => {
      for (const email of [helperEmail, blankEmail]) {
        const identity = await findIdentity(email);
        if (identity) await service.auth.admin.deleteUser(identity.id, false);
      }
    });
    const club = await seedClub("add-name", ["owner"]);
    const { owner } = club.people;
    await club.members([{ user_id: owner.id, role: "owner", status: "active" }]);
    const sendCode = async () => ({ error: null });
    const session = await club.ownerSession(owner.id);

    const added = await addClubAdmin(session, { email: helperEmail, role: "admin", displayName: "  Sam \n Lee " }, { sendCode });
    expect((await club.row(added.userId))?.display_name).toBe("Sam Lee");

    // A name that's only a zero-width space is refused before anyone is created.
    await expectContractError(
      () => addClubAdmin(session, { email: blankEmail, role: "admin", displayName: "​" }, { sendCode }),
      "INVALID_DISPLAY_NAME",
    );
    await expect(findIdentity(blankEmail)).resolves.toBeUndefined();

    // Re-adding without a name keeps the one they had.
    await removeClubAdmin(session, added.userId);
    await addClubAdmin(session, { email: helperEmail, role: "admin" }, { sendCode });
    expect(await club.row(added.userId)).toMatchObject({ status: "active", display_name: "Sam Lee" });

    // Format characters: a right-to-left override alone is not a name; around a
    // real name they are dropped.
    const ownerMember = await club.memberSession(owner.id);
    await expectContractError(() => setMemberDisplayName(ownerMember, { displayName: "‮" }), "INVALID_DISPLAY_NAME");
    await expect(setMemberDisplayName(ownerMember, { displayName: "‮Andrea​" })).resolves.toEqual({
      userId: owner.id,
      displayName: "Andrea",
    });

    // A failed rename audit puts the old name back...
    await expectContractError(
      () => setMemberDisplayName({ ...ownerMember, client: withFailingAudit(club.service) }, { displayName: "Bea" }),
      "MEMBERSHIP_AUDIT_FAILED",
    );
    expect((await club.row(owner.id))?.display_name).toBe("Andrea");
    // ...but never over a rename that landed in between.
    const concurrent = withFailingAudit(club.service, async () => {
      const update = await club.service.from("club_members").update({ display_name: "Concurrent" })
        .eq("club_id", club.clubId).eq("user_id", owner.id);
      if (update.error) throw update.error;
    });
    await expectContractError(
      () => setMemberDisplayName({ ...ownerMember, client: concurrent }, { displayName: "Bea" }),
      "MEMBERSHIP_AUDIT_FAILED",
    );
    expect((await club.row(owner.id))?.display_name).toBe("Concurrent");

    // Audits say whether a name came with the add, never the name itself.
    const rows = await club.audits();
    expect(rows.filter((row) => row.operation === "membership_added").map((row) => row.payload)).toEqual([
      { role: "admin", recipient_domain: "onzio.local", name_given: true },
      { role: "admin", recipient_domain: "onzio.local", name_given: false },
    ]);
    const text = JSON.stringify(rows);
    for (const name of ["Sam", "Lee", "Andrea", "Bea", "Concurrent"]) expect(text).not.toContain(name);
  });
});
