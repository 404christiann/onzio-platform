import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    "club_identity",
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

describe("site template contract", () => {
  const templateClubId = "99999999-1111-4111-8111-111111111191";

  afterEach(async () => {
    await clients.service.from("clubs").delete().eq("id", templateClubId);
  });

  it("defaults new clubs to the classic template", async () => {
    await expectAllowed(
      clients.service.from("clubs").insert({
        id: templateClubId,
        slug: "template-contract",
        name: "Template Contract Club",
      }),
    );
    const { data, error } = await clients.service
      .from("clubs")
      .select("site_template")
      .eq("id", templateClubId)
      .single();
    expect(error?.message).toBeUndefined();
    expect(data?.site_template).toBe("classic");
  });

  it("accepts the editorial template", async () => {
    await expectAllowed(
      clients.service.from("clubs").insert({
        id: templateClubId,
        slug: "template-contract",
        name: "Template Contract Club",
        site_template: "editorial",
      }),
    );
    const { data } = await clients.service
      .from("clubs")
      .select("site_template")
      .eq("id", templateClubId)
      .single();
    expect(data?.site_template).toBe("editorial");
  });

  it("rejects unknown template values", async () => {
    await expectDenied(
      clients.service.from("clubs").insert({
        id: templateClubId,
        slug: "template-contract",
        name: "Template Contract Club",
        site_template: "brutalist",
      }),
    );
  });

  it("keeps every seeded club on the classic template", async () => {
    const { data, error } = await clients.service
      .from("clubs")
      .select("id, site_template")
      .in("id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
    expect(error?.message).toBeUndefined();
    expect(data).toEqual(
      expect.arrayContaining([
        { id: CLUB_IDS.alpha, site_template: "classic" },
        { id: CLUB_IDS.bravo, site_template: "classic" },
      ]),
    );
  });

  it("rejects a malformed accent color and accepts a hex accent color", async () => {
    await expectDenied(
      clients.service.from("clubs").insert({
        id: templateClubId,
        slug: "template-contract",
        name: "Template Contract Club",
        accent_color: "red",
      }),
    );
    await expectAllowed(
      clients.service.from("clubs").insert({
        id: templateClubId,
        slug: "template-contract",
        name: "Template Contract Club",
        accent_color: "#C8102E",
      }),
    );
  });
});

describe("match attendance and scorers contract", () => {
  const matchIds = [
    "99999999-2222-4222-8222-222222222291",
    "99999999-2222-4222-8222-222222222292",
  ] as const;
  const alphaSeasonId = "33333333-3333-4333-8333-333333333331";

  afterEach(async () => {
    await clients.service
      .from("matches")
      .delete()
      .in("id", [...matchIds]);
  });

  it("leaves rows written without the new columns unaffected", async () => {
    await expectAllowed(
      clients.service.from("matches").insert({
        id: matchIds[0],
        club_id: CLUB_IDS.alpha,
        season_id: alphaSeasonId,
        date: "2026-08-15",
        time: "19:00",
        opponent: "Legacy Shape FC",
      }),
    );
    const { data, error } = await clients.service
      .from("matches")
      .select("attendance, scorers")
      .eq("id", matchIds[0])
      .single();
    expect(error?.message).toBeUndefined();
    expect(data).toEqual({ attendance: null, scorers: [] });
  });

  it("accepts attendance and scorers", async () => {
    await expectAllowed(
      clients.service.from("matches").insert({
        id: matchIds[1],
        club_id: CLUB_IDS.alpha,
        season_id: alphaSeasonId,
        date: "2026-08-16",
        time: "19:00",
        opponent: "Stat Line United",
        attendance: 1250,
        scorers: [{ name: "A. Striker", minute: 27 }],
      }),
    );
    const { data } = await clients.service
      .from("matches")
      .select("attendance, scorers")
      .eq("id", matchIds[1])
      .single();
    expect(data).toEqual({
      attendance: 1250,
      scorers: [{ name: "A. Striker", minute: 27 }],
    });
  });

  it("rejects negative attendance", async () => {
    await expectDenied(
      clients.service.from("matches").insert({
        id: matchIds[1],
        club_id: CLUB_IDS.alpha,
        season_id: alphaSeasonId,
        date: "2026-08-17",
        time: "19:00",
        opponent: "Negative Crowd FC",
        attendance: -1,
      }),
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
