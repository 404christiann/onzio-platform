import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;

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
    "club_stripe_connect",
    "registration_forms",
    "registration_form_fields",
    "registration_price_options",
    "registrations",
    "site_branding",
    "homepage_hero_content",
    "club_identity",
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
    const { error } = await clients.service.from("site_branding").insert([
      { club_id: CLUB_IDS.alpha, club_logo_path: "alpha/one.png" },
      { club_id: CLUB_IDS.alpha, club_logo_path: "alpha/two.png" },
    ]);
    expectPostgrestError(
      error,
      "23505",
      "duplicate site-branding singleton rows",
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

    const { error } = await clients.service.from("player_photos").insert({
      id: "77777777-7777-4777-8777-777777777777",
      club_id: CLUB_IDS.alpha,
      player_id: bravoPlayerId,
      url: "https://example.invalid/cross-club.webp",
      sort_order: 0,
    });
    expectPostgrestError(
      error,
      "23503",
      "cross-club player-photo relationship",
    );
  });

  it("restricts direct club deletion", async () => {
    const { error } = await clients.anon
      .from("clubs")
      .delete()
      .eq("id", CLUB_IDS.alpha);
    expectPostgrestError(
      error,
      "42501",
      "anonymous direct club deletion",
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
    await expectAllowed(
      clients.anon
        .from("homepage_hero_content")
        .select("*")
        .eq("club_id", CLUB_IDS.alpha),
    );
  });

  it("keeps club_identity content isolated per tenant", async () => {
    const seeded = await clients.service.from("club_identity").upsert([
      {
        club_id: CLUB_IDS.alpha,
        short_name: "Alpha",
        initials: "AFC",
        founded_year: 2015,
      },
      {
        club_id: CLUB_IDS.bravo,
        short_name: "Bravo",
        initials: "BU",
        founded_year: 2019,
      },
    ]);
    expect(seeded.error?.message).toBeUndefined();

    const alphaRead = await clients.anon
      .from("club_identity")
      .select("club_id, short_name")
      .eq("club_id", CLUB_IDS.alpha);
    expect(alphaRead.error?.message).toBeUndefined();
    expect(alphaRead.data).toEqual([
      { club_id: CLUB_IDS.alpha, short_name: "Alpha" },
    ]);

    // Bravo is onboarding/preview, not publicly accessible, so anon sees no
    // rows for it even though the row exists.
    const bravoRead = await clients.anon
      .from("club_identity")
      .select("club_id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(bravoRead.error?.message).toBeUndefined();
    expect(bravoRead.data).toEqual([]);

    await clients.service
      .from("club_identity")
      .delete()
      .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
  });

  it("allows anon to read store_enabled through the existing clubs select policy", async () => {
    const update = await clients.service
      .from("clubs")
      .update({ store_enabled: true })
      .eq("id", CLUB_IDS.alpha);
    expect(update.error?.message).toBeUndefined();

    const { data, error } = await clients.anon
      .from("clubs")
      .select("id, store_enabled")
      .eq("id", CLUB_IDS.alpha);
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([{ id: CLUB_IDS.alpha, store_enabled: true }]);

    await clients.service
      .from("clubs")
      .update({ store_enabled: false })
      .eq("id", CLUB_IDS.alpha);
  });

  it.each([
    "club_members",
    "club_subscriptions",
    "stripe_events",
    "audit_events",
  ])("cannot read private %s records", async (table) => {
    const { data, error } = await clients.anon.from(table).select("*");
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([]);
  });

  it("cannot write public content", async () => {
    const { error } = await clients.anon.from("site_branding").insert({
      club_id: CLUB_IDS.alpha,
      club_logo_path: "attacker/logo.png",
    });
    expectPostgrestError(
      error,
      "42501",
      "anonymous public-content insert",
    );
  });

  it("cannot write membership records", async () => {
    const { error } = await clients.anon.from("club_members").insert({
      club_id: CLUB_IDS.alpha,
      user_id: "88888888-8888-4888-8888-888888888888",
      role: "owner",
      status: "active",
    });
    expectPostgrestError(
      error,
      "42501",
      "anonymous membership insert",
    );
  });
});
