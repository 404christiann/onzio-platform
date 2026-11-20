import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-TZ: Rose City (cinematic@2) has no onzio.club_identity row, so pages that took the
// time zone from the identity fell back to "UTC" ("8:00PM UTC"). They use the club's own
// time zone (onzio.clubs.time_zone) instead.

const mocks = vi.hoisted(() => ({
  fixtures: [] as unknown[],
  zone: vi.fn(async () => "America/Los_Angeles"),
}));
vi.mock("@/lib/public-club-time-zone", () => ({ readPublicClubTimeZone: mocks.zone }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn(async () => null) }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({}) }) }));
vi.mock("@/lib/queries", () => ({
  fetchActiveSeason: vi.fn(async () => ({ id: "season-1", label: "2027" })),
  fetchSchedule: vi.fn(async () => mocks.fixtures),
  fetchHomepageContent: vi.fn(async () => null),
  fetchShopKitContent: vi.fn(async () => null),
  fetchSiteSponsorLogos: vi.fn(async () => []),
}));

import RoseCitySchedulePage from "@/components/sites/rose-city/RoseCitySchedulePage";
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";
import { loadCinematicHomeData } from "@/components/cinematic/cinematic-home-data";

const fixture = {
  id: "f1", date: "2027-06-10", time: "20:00", home: true, opponent: "Opponent", venue: "Robinson Stadium",
  city: "Portland", state: "OR", roseCityScore: null, opponentScore: null,
};
const club = { id: "club-1", slug: "rose-city" } as never;

beforeEach(() => { mocks.fixtures = [fixture]; mocks.zone.mockClear(); });

describe("cinematic pages use the club time zone, not the identity's", () => {
  it("the Rose City schedule server page passes the club's zone and kickoffs read Pacific, not UTC", async () => {
    const element = await RoseCitySchedulePage({ club });
    const initial = (element.props as { initial: { data: { timeZone: string } } }).initial;
    expect(mocks.zone).toHaveBeenCalledWith("club-1");
    expect(initial.data.timeZone).toBe("America/Los_Angeles");
    const html = renderToStaticMarkup(createElement(CinematicSchedule, { schedule: initial.data as never, initialNow: new Date("2027-01-01T00:00:00Z") }));
    expect(html).toContain("8:00PM PT");
    expect(html).not.toContain("UTC");
  });

  it("the home data picks the next match in the club's zone", async () => {
    // 05:00 UTC on 10 June is still 22:00 on 9 June in Los Angeles, so a 02:00 home match on the 10th is upcoming.
    mocks.fixtures = [{ ...fixture, time: "02:00" }];
    const data = await loadCinematicHomeData("club-1", {} as never, new Date("2027-06-10T05:00:00Z"));
    expect(mocks.zone).toHaveBeenCalledWith("club-1");
    expect(data.fixture?.id).toBe("f1");
  });

  it("no cinematic or admin source falls back to the identity's time zone or UTC", () => {
    const files = [
      "components/cinematic/CinematicSchedulePage.tsx",
      "components/cinematic/CinematicMatchSummaryPage.tsx",
      "components/cinematic/CinematicStadium.tsx",
      "components/cinematic/CinematicKnowBeforeYouGo.tsx",
      "components/cinematic/CinematicTickets.tsx",
      "components/cinematic/CinematicChickFilA.tsx",
      "components/cinematic/CinematicHome.tsx",
      "components/cinematic/cinematic-home-data.ts",
      "components/admin/news/CinematicNewsEditor.tsx",
      "components/sites/rose-city/RoseCitySchedulePage.tsx",
      "app/%5Fclubs/[slug]/news/[articleSlug]/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("identity?.timeZone");
      expect(source, file).not.toMatch(/timeZone \|\| "UTC"/);
    }
  });
});
