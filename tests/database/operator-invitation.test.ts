import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inviteClubMember } from "@/lib/operator/invite-club-member";
import { expectContractError } from "../helpers/contract";
import { createLocalClients } from "../helpers/supabase";

describe("operator invitation and membership", () => {
  const cleanupActions: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupActions.length > 0) {
      await cleanupActions.pop()?.();
    }
    vi.unstubAllEnvs();
  });

  it("invites one new identity, derives the tenant callback, and refuses a duplicate", async () => {
    const { service } = createLocalClients();
    const actorEmail = `invite-actor-${randomUUID()}@onzio.local`;
    const ownerEmail = `invite-owner-${randomUUID()}@onzio.local`;
    const clubId = randomUUID();
    const slug = `invite-${clubId.slice(0, 8)}`;
    const hostname = `${slug}.localhost`;

    const actor = await service.auth.admin.createUser({
      email: actorEmail,
      password: `actor-${randomUUID()}`,
      email_confirm: true,
    });
    if (actor.error) throw actor.error;
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", actor.data.user.id);

    const clubInsert = await service.from("clubs").insert({
      id: clubId,
      slug,
      name: "Invitation Contract FC",
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
    });
    if (clubInsert.error) throw clubInsert.error;
    const domainInsert = await service.from("club_domains").insert({
      club_id: clubId,
      hostname,
      environment: "staging",
      is_primary: true,
      verified_at: new Date().toISOString(),
      active: true,
    });
    if (domainInsert.error) throw domainInsert.error;

    cleanupActions.push(async () => {
      const users = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
      const invited = users.data.users.find(
        (user) => user.email?.toLowerCase() === ownerEmail,
      );
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("club_domains").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      if (invited) await service.auth.admin.deleteUser(invited.id, false);
      await service.auth.admin.deleteUser(actor.data.user.id, false);
    });

    const invited = await inviteClubMember({
      clubId,
      actorId: actor.data.user.id,
      email: ownerEmail,
      role: "owner",
      environment: "staging",
      dependencies: { client: service },
    });

    expect(invited).toMatchObject({
      clubId,
      role: "owner",
      callbackUrl: `https://${hostname}/admin/auth/callback`,
      authUserCreated: true,
      invitationRequested: true,
      membershipActive: true,
      audited: true,
    });

    const membership = await service
      .from("club_members")
      .select("role,status")
      .eq("club_id", clubId)
      .eq("user_id", invited.userId)
      .single();
    expect(membership.error?.message).toBeUndefined();
    expect(membership.data).toEqual({ role: "owner", status: "active" });

    const audits = await service
      .from("audit_events")
      .select("operation")
      .eq("club_id", clubId)
      .in("operation", ["membership_added", "identity_invited"]);
    expect(audits.error?.message).toBeUndefined();
    expect(audits.data?.map((event) => event.operation).sort()).toEqual([
      "identity_invited",
      "membership_added",
    ]);

    await expectContractError(
      () =>
        inviteClubMember({
          clubId,
          actorId: actor.data.user.id,
          email: ownerEmail,
          role: "owner",
          environment: "staging",
          dependencies: { client: service },
        }),
      "AUTH_IDENTITY_EXISTS",
    );
  });
});
