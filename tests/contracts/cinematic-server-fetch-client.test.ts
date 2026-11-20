import { describe, expect, it, vi } from "vitest";

// The default (browser) client must never be touched when a client is passed.
vi.mock("@/lib/supabase", () => ({
  supabase: new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`default browser client used (${String(prop)})`);
      },
    },
  ),
}));

import {
  fetchActiveSeason,
  fetchFixtureById,
  fetchHomepageContent,
  fetchRoster,
  fetchSchedule,
  fetchShopKitContent,
  fetchShopKitVariants,
  fetchShopCarouselPhotos,
  fetchSiteSponsorLogos,
} from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { fetchCinematicShopContent, fetchCinematicShopPurchase } from "@/lib/cinematic-shop-query";

const CLUB_ID = "00000000-0000-4000-8000-000000000001";
const ASSET_ID = "00000000-0000-4000-8000-0000000000aa";

const ROWS: Record<string, unknown[]> = {
  seasons: [{ id: "season-1", label: "2027", active: true }],
};

/** A chainable, thenable stand-in for the Supabase client that records every `.from(table)`. */
function fakeClient() {
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      const rows = ROWS[table] ?? [];
      const single =
        table === "cinematic_shop_content"
          ? { content: { ...EMPTY_CINEMATIC_SHOP_CONTENT }, map_media_asset_id: ASSET_ID }
          : table === "matches"
            ? { id: "fixture-1", club_id: CLUB_ID, date: "2027-05-02", time: "19:45:00", opponent: "Ocelot FC", home: true }
            : null;
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "is", "order", "limit"]) {
        builder[method] = () => builder;
      }
      builder.maybeSingle = () => Promise.resolve({ data: single, error: null });
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows, error: null });
      return builder;
    },
  };
  return { client: client as never, tables };
}

describe("cinematic data fetchers accept a request-scoped client", () => {
  it("fetchActiveSeason", async () => {
    const { client, tables } = fakeClient();
    await fetchActiveSeason(CLUB_ID, client);
    expect(tables).toContain("seasons");
  });

  it("fetchSchedule", async () => {
    const { client, tables } = fakeClient();
    await fetchSchedule(undefined, CLUB_ID, client);
    expect(tables).toContain("matches");
  });

  it("fetchFixtureById", async () => {
    const { client, tables } = fakeClient();
    await expect(fetchFixtureById("fixture-1", CLUB_ID, client)).resolves.toMatchObject({ id: "fixture-1", opponent: "Ocelot FC" });
    expect(tables).toContain("matches");
  });

  it("fetchRoster (including the active-players helper)", async () => {
    const { client, tables } = fakeClient();
    await fetchRoster(undefined, CLUB_ID, { includeActivePlayersWithoutSeasonStats: true }, client);
    expect(tables).toEqual(
      expect.arrayContaining([
        "seasons",
        "player_season_totals",
        "goalkeeper_season_totals",
        "players",
        "player_photos",
      ]),
    );
    const plain = fakeClient();
    await fetchRoster("season-1", CLUB_ID, {}, plain.client);
    expect(plain.tables).toEqual(expect.arrayContaining(["seasons", "players", "player_photos"]));
  });

  it("fetchHomepageContent (including the hero)", async () => {
    const { client, tables } = fakeClient();
    await fetchHomepageContent(CLUB_ID, client);
    expect(tables).toEqual(
      expect.arrayContaining([
        "homepage_hero_content",
        "homepage_slideshow_photos",
        "homepage_slideshow_settings",
        "behind_the_rose_section",
      ]),
    );
  });

  it("fetchShopKitContent and fetchShopKitVariants", async () => {
    const one = fakeClient();
    await fetchShopKitContent("home", "home", CLUB_ID, one.client);
    expect(one.tables).toEqual(expect.arrayContaining(["shop_kit_section", "shop_kit_photos"]));
    const many = fakeClient();
    await fetchShopKitVariants("home", CLUB_ID, many.client);
    expect(many.tables.filter((t) => t === "shop_kit_section")).toHaveLength(3);
  });

  it("fetchShopCarouselPhotos", async () => {
    const { client, tables } = fakeClient();
    await fetchShopCarouselPhotos("home", CLUB_ID, client);
    expect(tables).toContain("shop_carousel_photos");
  });

  it("fetchSiteSponsorLogos", async () => {
    const { client, tables } = fakeClient();
    await fetchSiteSponsorLogos("carousel", CLUB_ID, client);
    expect(tables).toContain("site_sponsor_logos");
  });

  it("fetchClubIdentity", async () => {
    const { client, tables } = fakeClient();
    await fetchClubIdentity(CLUB_ID, client);
    expect(tables).toContain("club_identity");
  });

  it("fetchCinematicShopPurchase", async () => {
    const { client, tables } = fakeClient();
    await fetchCinematicShopPurchase(CLUB_ID, client);
    expect(tables).toContain("shop_purchase_details");
  });

  it("fetchCinematicShopContent (including the media asset lookup)", async () => {
    const { client, tables } = fakeClient();
    await fetchCinematicShopContent(CLUB_ID, client);
    expect(tables).toEqual(expect.arrayContaining(["cinematic_shop_content", "media_assets"]));
  });
});
