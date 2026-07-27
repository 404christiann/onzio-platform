import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;

async function expectDenied(
  operation: PromiseLike<{ error: { code?: string; message: string } | null }>,
) {
  const { error } = await operation;
  expect(error, "operation unexpectedly bypassed RLS").not.toBeNull();
}

async function expectAllowed(
  operation: PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await operation;
  expect(error?.message).toBeUndefined();
}

async function tableExists(
  client: SupabaseClient<any, any, any>,
  table: string,
) {
  const { error } = await client.from(table).select("*").limit(0);
  expect(error?.message).toBeUndefined();
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

describe("planned schema contract", () => {
  it.each([
    "clubs",
    "club_domains",
    "club_members",
    "club_subscriptions",
    "stripe_events",
    "media_assets",
    "audit_events",
    "club_exports",
    "site_branding",
    "players",
    "matches",
    "seasons",
    "player_photos",
    "player_match_stats",
  ])("exposes onzio.%s", async (table) => {
    await tableExists(clients.service, table);
  });

  it("allows equivalent singleton rows for separate clubs", async () => {
    await expectAllowed(
      clients.service.from("site_branding").upsert([
        { club_id: CLUB_IDS.alpha, club_logo_path: "alpha/logo.png" },
        { club_id: CLUB_IDS.bravo, club_logo_path: "bravo/logo.png" },
      ]),
    );
  });

  it("rejects duplicate singleton rows within one club", async () => {
    await expectDenied(
      clients.service.from("site_branding").insert([
        { club_id: CLUB_IDS.alpha, club_logo_path: "alpha/one.png" },
        { club_id: CLUB_IDS.alpha, club_logo_path: "alpha/two.png" },
      ]),
    );
  });

  it("rejects a cross-club player-photo relationship", async () => {
    const bravoPlayerId = "66666666-6666-4666-8666-666666666666";
    await expectAllowed(
      clients.service.from("players").upsert({
        id: bravoPlayerId,
        club_id: CLUB_IDS.bravo,
        number: 1,
        name: "Bravo Player",
        nationality: "US",
        position: "Goalkeeper",
        height: "6 ft",
        weight: "180 lb",
        hometown: "Portland",
        age: 24,
        photo_url: "",
        active: true,
      }),
    );

    await expectDenied(
      clients.service.from("player_photos").insert({
        id: "77777777-7777-4777-8777-777777777777",
        club_id: CLUB_IDS.alpha,
        player_id: bravoPlayerId,
        url: "https://example.invalid/cross-club.webp",
        sort_order: 0,
      }),
    );
  });

  it("restricts direct club deletion", async () => {
    await expectDenied(
      clients.anon.from("clubs").delete().eq("id", CLUB_IDS.alpha),
    );
  });
});

describe("anonymous RLS contract", () => {
  it("can resolve a verified live tenant without private-helper grants", async () => {
    const { data: clubs, error: clubsError } = await clients.anon
      .from("clubs")
      .select("id, slug")
      .eq("id", CLUB_IDS.alpha);
    expect(clubsError?.message).toBeUndefined();
    expect(clubs).toEqual([{ id: CLUB_IDS.alpha, slug: "alpha" }]);

    const { data: domains, error: domainsError } = await clients.anon
      .from("club_domains")
      .select("club_id, hostname")
      .eq("hostname", "alpha-onzio.vercel.app");
    expect(domainsError?.message).toBeUndefined();
    expect(domains).toEqual([
      {
        club_id: CLUB_IDS.alpha,
        hostname: "alpha-onzio.vercel.app",
      },
    ]);
  });

  it("can read live public content", async () => {
    await expectAllowed(
      clients.anon
        .from("site_branding")
        .select("*")
        .eq("club_id", CLUB_IDS.alpha),
    );
  });

  it.each([
    "club_members",
    "club_subscriptions",
    "stripe_events",
    "audit_events",
  ])("cannot read private %s records", async (table) => {
    const { data, error } = await clients.anon.from(table).select("*");
    expect(error === null ? data : null).toEqual([]);
  });

  it("cannot write public content", async () => {
    await expectDenied(
      clients.anon.from("site_branding").insert({
        club_id: CLUB_IDS.alpha,
        club_logo_path: "attacker/logo.png",
      }),
    );
  });

  it("cannot write membership records", async () => {
    await expectDenied(
      clients.anon.from("club_members").insert({
        club_id: CLUB_IDS.alpha,
        user_id: "88888888-8888-4888-8888-888888888888",
        role: "owner",
        status: "active",
      }),
    );
  });
});
