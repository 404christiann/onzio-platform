import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { createAal2LocalClient } from "../helpers/mfa";
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
    expect(insert.error).not.toBeNull();
  });
});

describe("club identity authenticated RLS contract", () => {
  it("allows AAL2 member insert and update only inside the member's club", async () => {
    // admin-aal2 avoids concurrent MFA factor churn with the parallel
    // authenticated-rls file, which enrolls owner-aal2 and multiclub.
    const session = await createAal2LocalClient({
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
    expect(crossClub.error).not.toBeNull();
  });

  it("rejects identity writes from an AAL1 owner session", async () => {
    const { supabaseUrl } = await import("../helpers/environment").then(
      ({ assertSafeTestEnvironment }) => assertSafeTestEnvironment(),
    );
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      supabaseUrl,
      process.env.SUPABASE_TEST_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: "onzio" },
        realtime: {
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      },
    );
    const signIn = await client.auth.signInWithPassword({
      email: "owner-aal1@alpha.local",
      password: "local-contract-only",
    });
    expect(signIn.error?.message).toBeUndefined();

    const write = await client.from("club_identity").insert(alphaIdentity);
    expect(write.error).not.toBeNull();
    await client.auth.signOut();
  });
});
