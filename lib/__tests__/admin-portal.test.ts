import { describe, expect, it } from "vitest";
import { CLASSIC_ADMIN_PORTAL, parseAdminPortalRow, readAdminPortal } from "../admin-portal";

type Reader = Parameters<typeof readAdminPortal>[0];

function clientReturning(result: () => Promise<{ data: unknown; error: unknown }>): Reader {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: result,
  };
  return { schema: () => ({ from: () => query }) } as unknown as Reader;
}

describe("readAdminPortal is fail-safe", () => {
  it("reads a reimagined club's settings", async () => {
    const settings = await readAdminPortal(
      clientReturning(async () => ({
        data: {
          admin_portal: "reimagined",
          admin_flags: { season: true, shop: false },
          time_zone: "America/Chicago",
          time_zone_set_at: "2026-11-08T15:00:00Z",
        },
        error: null,
      })),
      "club-id",
    );
    expect(settings).toEqual({
      portal: "reimagined",
      flags: { season: true, shop: false },
      timeZone: "America/Chicago",
      timeZoneConfirmed: true,
    });
  });

  it.each([
    ["the query errors (a lagging migration: column does not exist)", async () => ({ data: null, error: { code: "42703" } })],
    ["the club row is missing", async () => ({ data: null, error: null })],
    ["the client throws", async () => { throw new Error("network down"); }],
  ])("falls back to the classic admin when %s", async (_label, result) => {
    await expect(readAdminPortal(clientReturning(result), "club-id")).resolves.toEqual(CLASSIC_ADMIN_PORTAL);
  });

  it("never treats a failed read as an unconfirmed time zone", () => {
    expect(CLASSIC_ADMIN_PORTAL.timeZoneConfirmed).toBe(true);
  });
});

describe("parseAdminPortalRow", () => {
  it("cleans up unexpected values instead of trusting them", () => {
    expect(
      parseAdminPortalRow({
        admin_portal: "beta",
        admin_flags: { season: "yes", roster: true },
        time_zone: "Mars/Phobos",
        time_zone_set_at: null,
      }),
    ).toEqual({ portal: "classic", flags: { roster: true }, timeZone: "America/Los_Angeles", timeZoneConfirmed: false });
    expect(parseAdminPortalRow({ admin_portal: "classic", admin_flags: [] }).flags).toEqual({});
  });
});
