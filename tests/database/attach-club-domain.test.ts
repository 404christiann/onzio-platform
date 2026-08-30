import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachClubDomain } from "@/lib/operator/attach-club-domain";
import { expectContractError } from "../helpers/contract";
import { createLocalClients } from "../helpers/supabase";

// Covers lib/operator/attach-club-domain.ts against a real local Postgres so
// the club_domains_one_active_primary_per_environment partial unique index
// (and the rollback path around it) is exercised for real, not simulated —
// same discipline this repo already applies to provisionClub before any
// operator script runs against production (see HANDOFF.md, DCFC-801).

describe("attach club domain", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  async function makeClub(service: ReturnType<typeof createLocalClients>["service"]) {
    const clubId = randomUUID();
    const operatorId = randomUUID();
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `attach-domain-${clubId.slice(0, 8)}`,
      name: "Attach Domain Contract FC",
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
    });
    if (club.error) throw club.error;
    cleanups.push(async () => {
      await service.from("club_domains").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
    });
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", operatorId);
    return { clubId, operatorId };
  }

  function dependencies(
    service: ReturnType<typeof createLocalClients>["service"],
    operatorId: string,
    now = new Date("2026-08-11T18:00:00Z"),
  ) {
    return {
      client: service,
      now: () => now,
      verifyOperatorAccessToken: async () => ({
        sub: operatorId,
        aal: "aal2" as const,
        amr: [{ method: "totp", timestamp: Math.floor(now.getTime() / 1_000) - 60 }],
      }),
    };
  }

  it("attaches a first domain as primary", async () => {
    const { service } = createLocalClients();
    const { clubId, operatorId } = await makeClub(service);

    const result = await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diversecityfc.com",
      environment: "production",
      makePrimary: true,
      dependencies: dependencies(service, operatorId),
    });

    expect(result).toMatchObject({
      hostname: "diversecityfc.com",
      isPrimary: true,
      previousPrimaryHostname: null,
      alreadyAttached: false,
      audited: true,
    });

    const { data } = await service
      .from("club_domains")
      .select("hostname,is_primary,active,verified_at")
      .eq("club_id", clubId)
      .eq("hostname", "diversecityfc.com")
      .single();
    expect(data).toMatchObject({
      hostname: "diversecityfc.com",
      is_primary: true,
      active: true,
    });
    expect(data?.verified_at).not.toBeNull();
  });

  it("demotes the existing primary when a new primary domain is attached", async () => {
    const { service } = createLocalClients();
    const { clubId, operatorId } = await makeClub(service);
    await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diverse-city-fc-private.vercel.app",
      environment: "production",
      makePrimary: true,
      dependencies: dependencies(service, operatorId),
    });

    const result = await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diversecityfc.com",
      environment: "production",
      makePrimary: true,
      dependencies: dependencies(service, operatorId),
    });

    expect(result).toMatchObject({
      isPrimary: true,
      previousPrimaryHostname: "diverse-city-fc-private.vercel.app",
    });

    const { data: rows } = await service
      .from("club_domains")
      .select("hostname,is_primary,active")
      .eq("club_id", clubId)
      .order("hostname");
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hostname: "diverse-city-fc-private.vercel.app",
          is_primary: false,
          active: true,
        }),
        expect.objectContaining({ hostname: "diversecityfc.com", is_primary: true }),
      ]),
    );
  });

  it("attaches a secondary domain without touching the existing primary", async () => {
    const { service } = createLocalClients();
    const { clubId, operatorId } = await makeClub(service);
    await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diversecityfc.com",
      environment: "production",
      makePrimary: true,
      dependencies: dependencies(service, operatorId),
    });

    const result = await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "www.diversecityfc.com",
      environment: "production",
      makePrimary: false,
      dependencies: dependencies(service, operatorId),
    });

    expect(result).toMatchObject({
      hostname: "www.diversecityfc.com",
      isPrimary: false,
      previousPrimaryHostname: null,
    });

    const { data: primary } = await service
      .from("club_domains")
      .select("is_primary")
      .eq("club_id", clubId)
      .eq("hostname", "diversecityfc.com")
      .single();
    expect(primary?.is_primary).toBe(true);
  });

  it("is idempotent when the exact same attachment is repeated", async () => {
    const { service } = createLocalClients();
    const { clubId, operatorId } = await makeClub(service);
    const deps = dependencies(service, operatorId);
    await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diversecityfc.com",
      environment: "production",
      makePrimary: true,
      dependencies: deps,
    });

    const second = await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diversecityfc.com",
      environment: "production",
      makePrimary: true,
      dependencies: deps,
    });

    expect(second).toMatchObject({ alreadyAttached: true, audited: false });
    const { count } = await service
      .from("club_domains")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("hostname", "diversecityfc.com");
    expect(count).toBe(1);
  });

  it("rejects re-attaching a hostname with a different primary flag", async () => {
    const { service } = createLocalClients();
    const { clubId, operatorId } = await makeClub(service);
    const deps = dependencies(service, operatorId);
    await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "www.diversecityfc.com",
      environment: "production",
      makePrimary: false,
      dependencies: deps,
    });

    await expectContractError(
      () =>
        attachClubDomain({
          clubId,
          operatorAccessToken: "token",
          hostname: "www.diversecityfc.com",
          environment: "production",
          makePrimary: true,
          dependencies: deps,
        }),
      "DOMAIN_ALREADY_ATTACHED_DIFFERENTLY",
    );
  });

  it("rejects a hostname already claimed by another club and rolls back the demotion", async () => {
    const { service } = createLocalClients();
    const { clubId: takenClubId, operatorId } = await makeClub(service);
    await attachClubDomain({
      clubId: takenClubId,
      operatorAccessToken: "token",
      hostname: "diversecityfc.com",
      environment: "production",
      makePrimary: true,
      dependencies: dependencies(service, operatorId),
    });

    const { clubId } = await makeClub(service);
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", operatorId);
    await attachClubDomain({
      clubId,
      operatorAccessToken: "token",
      hostname: "diverse-city-fc-private.vercel.app",
      environment: "production",
      makePrimary: true,
      dependencies: dependencies(service, operatorId),
    });

    await expectContractError(
      () =>
        attachClubDomain({
          clubId,
          operatorAccessToken: "token",
          hostname: "diversecityfc.com",
          environment: "production",
          makePrimary: true,
          dependencies: dependencies(service, operatorId),
        }),
      "DOMAIN_CONFLICT",
    );

    const { data: original } = await service
      .from("club_domains")
      .select("is_primary")
      .eq("club_id", clubId)
      .eq("hostname", "diverse-city-fc-private.vercel.app")
      .single();
    expect(original?.is_primary).toBe(true);
  });

  it("rejects an archived club", async () => {
    const { service } = createLocalClients();
    const { clubId, operatorId } = await makeClub(service);
    const archive = await service
      .from("clubs")
      .update({
        lifecycle: "archived",
        public_access: "suspended",
        archived_at: new Date().toISOString(),
      })
      .eq("id", clubId);
    if (archive.error) throw archive.error;

    await expectContractError(
      () =>
        attachClubDomain({
          clubId,
          operatorAccessToken: "token",
          hostname: "diversecityfc.com",
          environment: "production",
          makePrimary: true,
          dependencies: dependencies(service, operatorId),
        }),
      "CLUB_ARCHIVED",
    );
  });

  it("rejects a club that does not exist", async () => {
    const { service } = createLocalClients();
    const operatorId = randomUUID();
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", operatorId);

    await expectContractError(
      () =>
        attachClubDomain({
          clubId: randomUUID(),
          operatorAccessToken: "token",
          hostname: "diversecityfc.com",
          environment: "production",
          makePrimary: true,
          dependencies: dependencies(service, operatorId),
        }),
      "CLUB_NOT_FOUND",
    );
  });
});
