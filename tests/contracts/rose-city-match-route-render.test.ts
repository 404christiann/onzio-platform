import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubTimeZoneProvider } from "@/components/ClubTimeZoneProvider";
import type { ClubContext } from "@/lib/club-context";

// RC-MATCH-AREA: the real route, site page and cinematic page, inside the providers the tenant layout supplies.
// Only the data layer is replaced. Whatever Host the request carries, a cinematic@2 club's match renders the Match
// Summary on first paint; every other club renders what it always did.
const mocks = vi.hoisted(() => ({ club: vi.fn(), byHost: vi.fn(), fixture: vi.fn(), identity: vi.fn() }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club, getClubContext: mocks.byHost }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "onzio-platform-git-rc-sam-example.vercel.app" }) }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({}) }) }));
vi.mock("@/lib/queries", () => ({ fetchFixtureById: mocks.fixture, fetchClubBranding: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: mocks.identity }));
import MatchRoute from "@/app/%5Fclubs/[slug]/schedule/[fixtureId]/page";

const FIXTURE_ID = "baf199e2-bea4-5fc7-840f-e1dc59fefb4d";
const club = (patch: Partial<ClubContext>): ClubContext => ({ id: "11111111-1111-4111-8111-111111111111", slug: "rose-city", name: "Rose City FC", primaryDomain: "rose-city.localhost", lifecycle: "active", publicAccess: "live", kind: "test", stripePriceId: null, tier: "pro", role: null, primaryColor: "#E73C2E", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true, publicPageVisibility: {}, ...patch });
const played = { id: FIXTURE_ID, date: "2027-05-02", time: "19:45:00", opponent: "Ocelot FC", opponentLogoUrl: null, home: true, venue: "Robinson Stadium", address: "1570 E Colorado Blvd", city: "Pasadena", state: "CA", competition: "UPSL Premier Regular Season", roseCityScore: 2, opponentScore: 1, attendance: 1356, scorers: [], replayVideoUrl: "", summary: null };

async function resolveAsync(node: React.ReactElement): Promise<React.ReactElement> {
  const type = node.type as unknown;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolveAsync(await (type as (props: unknown) => Promise<React.ReactElement>)(node.props));
  }
  return node;
}
async function render(current: ClubContext, timeZone = "America/Los_Angeles") {
  mocks.club.mockResolvedValue(current);
  const page = await resolveAsync(await MatchRoute({ params: Promise.resolve({ slug: current.slug, fixtureId: FIXTURE_ID }) }));
  return renderToStaticMarkup(createElement(ClubContextProvider, { club: current, children:
    createElement(ClubTimeZoneProvider, { timeZone, children:
      createElement(ClubBrandingProvider, { initialBranding: { logoPath: "/logo.webp", inverseLogoPath: "", footerTagline: "" }, children: page }) }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // rc-sam: no club_domains row for the preview host.
  mocks.byHost.mockRejectedValue(new Error("UNKNOWN_TENANT"));
  mocks.fixture.mockResolvedValue(played);
  mocks.identity.mockResolvedValue({ initials: "RCFC" });
});

describe("Rose City's match page on first paint", () => {
  it("is the Match Summary with the score, with no loading line and no Clubhouse message", async () => {
    const markup = await render(club({}));
    expect(markup).toContain("Match Summary");
    expect(markup).toContain("Ocelot FC");
    expect(markup).toContain("UPSL Premier Regular Season");
    expect(markup).toContain("Robinson Stadium");
    expect(markup).not.toContain("Match area unavailable");
    expect(markup).not.toContain("Loading match");
  });

  it("shows the kickoff in the club's saved time zone", async () => {
    expect(await render(club({}), "America/Los_Angeles")).toContain("7:45PM PT");
    expect(await render(club({}), "America/New_York")).toContain("7:45PM ET");
  });

  it("says it could not find a match that is not this club's", async () => {
    mocks.fixture.mockResolvedValue(null);
    const markup = await render(club({}));
    expect(markup).toContain("We couldn’t find this match.");
    expect(markup).toContain('href="/schedule"');
  });

  it("keeps the retry button when the server read failed", async () => {
    mocks.fixture.mockRejectedValue(new Error("boom"));
    const markup = await render(club({}));
    expect(markup).toContain("This match summary is temporarily unavailable.");
    expect(markup).toContain("Try again");
  });
});

describe("another club's match page", () => {
  it("is unchanged: Diverse City still gets the shared page's message", async () => {
    const markup = await render(club({ slug: "diverse-city", name: "Diverse City FC", presentationTemplateKey: "academy@1" }));
    expect(markup).toContain("Match area unavailable.");
    expect(markup).not.toContain("Match Summary");
    expect(mocks.fixture).not.toHaveBeenCalled();
  });
});
