import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];

const alphaIdentity = {
  club_id: CLUB_IDS.alpha,
  short_name: "Alpha",
  initials: "AFC",
  founded_year: 2015,
} as const;

const bravoIdentity = {
  club_id: CLUB_IDS.bravo,
  short_name: "Bravo",
  initials: "BU",
  founded_year: 2019,
} as const;

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  await clients.service
    .from("club_identity")
    .delete()
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
});

describe("club identity anonymous RLS contract", () => {
  it("exposes only a publicly accessible club's identity to anon", async () => {
    const seeded = await clients.service
      .from("club_identity")
      .insert([alphaIdentity, bravoIdentity]);
    expect(seeded.error?.message).toBeUndefined();

    const alphaRead = await clients.anon
      .from("club_identity")
      .select("club_id, short_name, initials, founded_year")
      .eq("club_id", CLUB_IDS.alpha);
    expect(alphaRead.error?.message).toBeUndefined();
    expect(alphaRead.data).toEqual([
      {
        club_id: CLUB_IDS.alpha,
        short_name: "Alpha",
        initials: "AFC",
        founded_year: 2015,
      },
    ]);

    // Bravo is onboarding/preview, not publicly accessible, so anon sees no
    // rows for it even though the service role can see the seeded row.
    const bravoRead = await clients.anon
      .from("club_identity")
      .select("club_id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(bravoRead.error?.message).toBeUndefined();
    expect(bravoRead.data).toEqual([]);
  });

  it("rejects anonymous identity writes", async () => {
    const insert = await clients.anon
      .from("club_identity")
      .insert(alphaIdentity);
    expectPostgrestError(insert.error, "42501", "anonymous identity insert");
  });
});

describe("club identity authenticated RLS contract", () => {
  it("allows a fresh member session insert and update only inside the member's club", async () => {
    const session = await createFreshLocalClient({
      email: "admin-aal2@alpha.local",
      userId: USER_IDS.adminAal2,
    });
    cleanups.push(session.cleanup);

    const insert = await session.client
      .from("club_identity")
      .insert(alphaIdentity);
    expect(insert.error?.message).toBeUndefined();

    const update = await session.client
      .from("club_identity")
      .update({ venue: "Alpha Park" })
      .eq("club_id", CLUB_IDS.alpha)
      .select("venue");
    expect(update.error?.message).toBeUndefined();
    expect(update.data).toEqual([{ venue: "Alpha Park" }]);

    const crossClub = await session.client
      .from("club_identity")
      .insert(bravoIdentity);
    expectPostgrestError(
      crossClub.error,
      "42501",
      "cross-club identity insert",
    );
  });

  // PLAT-101 removed the AAL2 requirement for club-facing content
  // mutations: session freshness (30-day AMR age) and club membership are
  // the RLS boundary, not TOTP/AAL2. Operator TOTP is a separate,
  // application-level boundary. This mirrors the equivalent case in
  // tests/database/authenticated-rls.test.ts for other content tables.
  it("allows content writes from a fresh aal1 owner session", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal1@alpha.local",
      userId: USER_IDS.ownerAal1,
    });
    cleanups.push(session.cleanup);

    const write = await session.client
      .from("club_identity")
      .insert(alphaIdentity);
    expect(write.error?.message).toBeUndefined();
  });
});
