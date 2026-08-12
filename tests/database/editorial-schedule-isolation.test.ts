import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

/**
 * Explicit cross-tenant fixture isolation contract for the L6 editorial
 * schedule/match-area pages.
 *
 * A fixture id is the only input `/schedule/[fixtureId]` trusts from the
 * client, so a Lions fixture id must never resolve under a different club's
 * tenant context and vice versa — this is a real security boundary (RLS
 * plus the app's own `.eq("club_id", tenantId)` scoping in
 * `fetchSchedule`), not a cosmetic concern, per AGENTS.md's tenant-isolation
 * rules. Alpha is used as the other tenant: it is `active`/`live`/`pro`, so
 * its `matches` rows are anon-readable (the `schedule` feature is granted to
 * every tier), letting this test prove real RLS-backed isolation rather than
 * an access-denied false negative.
 */

let clients: LocalClients;

const LIONS_CLUB_ID = "55555555-5555-4555-8555-555555555555";
const LIONS_SEASON_ID = "33333333-3333-4333-8333-333333333333";
const ALPHA_SEASON_ID = "33333333-3333-4333-8333-333333333331";
// Real seeded Lions fixture (Dayton Rovers SC, 2026-05-09) from supabase/seed.sql.
const LIONS_FIXTURE_ID = "99999999-9999-4999-8999-999999999901";
const SYNTHETIC_ALPHA_MATCH_ID = "99999999-9999-4999-8999-000000000001";

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  await clients.service.from("matches").delete().eq("id", SYNTHETIC_ALPHA_MATCH_ID);
});

describe("editorial schedule: cross-tenant fixture isolation", () => {
  it("a real Lions fixture id resolves under Lions' own tenant scope (sanity)", async () => {
    const lionsScoped = await clients.anon
      .from("matches")
      .select("id")
      .eq("club_id", LIONS_CLUB_ID)
      .eq("id", LIONS_FIXTURE_ID);
    expect(lionsScoped.error?.message).toBeUndefined();
    expect(lionsScoped.data).toEqual([{ id: LIONS_FIXTURE_ID }]);
  });

  it("a real Lions fixture id is NOT resolvable when queried under Alpha's tenant scope", async () => {
    const alphaScoped = await clients.anon
      .from("matches")
      .select("id")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", LIONS_FIXTURE_ID);
    expect(alphaScoped.error?.message).toBeUndefined();
    expect(alphaScoped.data).toEqual([]);
  });

  it("an Alpha fixture id is NOT resolvable when queried under Lions' tenant scope", async () => {
    const inserted = await clients.service.from("matches").insert({
      id: SYNTHETIC_ALPHA_MATCH_ID,
      club_id: CLUB_IDS.alpha,
      season_id: ALPHA_SEASON_ID,
      date: "2026-05-01",
      time: "19:00",
      opponent: "Synthetic Alpha Opponent",
      home: true,
      venue: "Alpha Test Ground",
    });
    expect(inserted.error?.message).toBeUndefined();

    const alphaScoped = await clients.anon
      .from("matches")
      .select("id")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", SYNTHETIC_ALPHA_MATCH_ID);
    expect(alphaScoped.data).toEqual([{ id: SYNTHETIC_ALPHA_MATCH_ID }]);

    const lionsScoped = await clients.anon
      .from("matches")
      .select("id")
      .eq("club_id", LIONS_CLUB_ID)
      .eq("id", SYNTHETIC_ALPHA_MATCH_ID);
    expect(lionsScoped.error?.message).toBeUndefined();
    expect(lionsScoped.data).toEqual([]);
  });

  it("fetchSchedule — the real tenant-scoped query EditorialSchedule/EditorialMatchArea use — never returns a foreign club's fixture", async () => {
    const { fetchSchedule } = await import("@/lib/queries");

    const alphaFixtures = await fetchSchedule(undefined, CLUB_IDS.alpha);
    expect(alphaFixtures.some((fixture) => fixture.id === LIONS_FIXTURE_ID)).toBe(false);

    const lionsFixtures = await fetchSchedule(LIONS_SEASON_ID, LIONS_CLUB_ID);
    expect(lionsFixtures.some((fixture) => fixture.id === LIONS_FIXTURE_ID)).toBe(true);
  });
});
