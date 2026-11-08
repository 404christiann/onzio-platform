import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { assertClubOwnerSession, setClubTimeZoneOnce } from "@/lib/owner-admin-membership";
import { expectContractError } from "../helpers/contract";
import { createLocalClients } from "../helpers/supabase";

// ADMIN-RE-02, decision 1: an owner's browser sets the club's time zone once.

describe("setClubTimeZoneOnce", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  async function ownerSessionForNewClub(timeZoneSetAt: string | null) {
    const { service } = createLocalClients();
    const ownerId = randomUUID();
    const clubId = randomUUID();
    const owner = await service.auth.admin.createUser({
      id: ownerId,
      email: `tz-owner-${ownerId}@onzio.local`,
      email_confirm: true,
    });
    if (owner.error) throw owner.error;
    const club = await service.from("clubs").insert({
      id: clubId,
      slug: `tz-${clubId.slice(0, 8)}`,
      name: "Time Zone Contract FC",
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
      time_zone_set_at: timeZoneSetAt,
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
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      await service.auth.admin.deleteUser(ownerId, false);
    });
    const session = await assertClubOwnerSession("unused", clubId, {
      client: service,
      verifyAccessToken: async () => ({
        sub: ownerId,
        amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1_000) }],
      }),
    });
    const readClub = async () =>
      (await service.from("clubs").select("time_zone,time_zone_set_at").eq("id", clubId).single()).data;
    const audits = async () =>
      (await service.from("audit_events").select("operation,payload").eq("club_id", clubId)).data ?? [];
    return { session, readClub, audits };
  }

  it("saves the browser's zone once, confirms it, and audits it", async () => {
    const { session, readClub, audits } = await ownerSessionForNewClub(null);
    await expect(setClubTimeZoneOnce(session, "America/Chicago")).resolves.toEqual({
      saved: true,
      timeZone: "America/Chicago",
    });
    const club = await readClub();
    expect(club?.time_zone).toBe("America/Chicago");
    expect(club?.time_zone_set_at).not.toBeNull();
    expect(await audits()).toEqual([
      {
        operation: "club_time_zone_set",
        payload: { previous_value: "America/Los_Angeles", new_value: "America/Chicago", source: "owner_browser" },
      },
    ]);

    // A second owner's browser in another zone does not move it.
    await expect(setClubTimeZoneOnce(session, "America/New_York")).resolves.toEqual({
      saved: false,
      timeZone: "America/Chicago",
    });
    expect((await readClub())?.time_zone).toBe("America/Chicago");
    expect(await audits()).toHaveLength(1);
  });

  it("never overrides a zone Onzio already confirmed", async () => {
    const { session, readClub, audits } = await ownerSessionForNewClub(new Date().toISOString());
    await expect(setClubTimeZoneOnce(session, "Europe/London")).resolves.toEqual({
      saved: false,
      timeZone: "America/Los_Angeles",
    });
    expect((await readClub())?.time_zone).toBe("America/Los_Angeles");
    expect(await audits()).toEqual([]);
  });

  it("rejects a zone that is not real before writing", async () => {
    const { session, readClub } = await ownerSessionForNewClub(null);
    await expectContractError(() => setClubTimeZoneOnce(session, "Mars/Phobos"), "INVALID_TIME_ZONE");
    expect((await readClub())?.time_zone_set_at).toBeNull();
  });
});
