import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubTimeZoneProvider } from "@/components/ClubTimeZoneProvider";
import type { ClubContext } from "@/lib/club-context";

// RC-MATCH-AREA: seeded with the server's read, the Match Summary page renders the match on first paint and does not
// fetch it again in the browser. The server renderer never runs effects, so the effect is captured and run by hand
// after the render, the way the browser would after hydration.
const mocks = vi.hoisted(() => ({ fixture: vi.fn(), identity: vi.fn(), branding: vi.fn() }));
vi.mock("@/lib/queries", () => ({ fetchFixtureById: mocks.fixture, fetchClubBranding: mocks.branding }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: mocks.identity }));
const effects = vi.hoisted(() => ({ captured: [] as Array<{ effect: () => unknown; deps?: readonly unknown[] }> }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => unknown, deps?: readonly unknown[]) => { effects.captured.push({ effect, deps }); } };
});
import CinematicMatchSummaryPage from "@/components/cinematic/CinematicMatchSummaryPage";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const FIXTURE_ID = "baf199e2-bea4-5fc7-840f-e1dc59fefb4d";
const club: ClubContext = { id: CLUB_ID, slug: "rose-city", name: "Rose City FC", primaryDomain: "rose-city.localhost", lifecycle: "active", publicAccess: "live", kind: "test", stripePriceId: null, tier: "pro", role: null, primaryColor: "#E73C2E", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true, publicPageVisibility: {} };
const fixture = { id: FIXTURE_ID, date: "2027-05-02", time: "19:45:00", opponent: "Ocelot FC", home: true, venue: "Robinson Stadium", city: "Pasadena", state: "CA", competition: "UPSL", roseCityScore: 2, opponentScore: 1 };

function render(timeZone: string, props: Partial<React.ComponentProps<typeof CinematicMatchSummaryPage>> = {}) {
  return renderToStaticMarkup(createElement(ClubContextProvider, { club, children:
    createElement(ClubTimeZoneProvider, { timeZone, children:
      createElement(ClubBrandingProvider, { initialBranding: { logoPath: "/logo.webp", inverseLogoPath: "", footerTagline: "" }, children:
        createElement(CinematicMatchSummaryPage, { fixtureId: FIXTURE_ID, ...props }) }) }) }));
}
/** Runs the page's data effect (the one keyed on this club and match); the branding provider's own effect is another. */
function runMatchEffect() {
  const data = effects.captured.splice(0).filter(({ deps }) => deps?.includes(`${CLUB_ID}:${FIXTURE_ID}`));
  expect(data).toHaveLength(1);
  const cleanup = data[0].effect();
  if (typeof cleanup === "function") cleanup();
}

beforeEach(() => {
  vi.clearAllMocks();
  effects.captured.splice(0);
  mocks.fixture.mockResolvedValue(fixture);
  mocks.identity.mockResolvedValue({ initials: "RCFC" });
});

describe("the Match Summary page with server data", () => {
  it("does not fetch the match or the club label again after hydration", () => {
    render("America/Los_Angeles", { initial: { data: { fixture, clubLabel: "RCFC" }, failed: false } });
    runMatchEffect();
    expect(mocks.fixture).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
  });

  it("does not fetch again after a failed server read either; Try again is what retries", () => {
    render("America/Los_Angeles", { initial: { data: null, failed: true } });
    runMatchEffect();
    expect(mocks.fixture).not.toHaveBeenCalled();
  });

  it("fetches in the browser when nothing was served (the control)", () => {
    render("America/Los_Angeles");
    runMatchEffect();
    expect(mocks.fixture).toHaveBeenCalledWith(FIXTURE_ID, CLUB_ID);
    expect(mocks.identity).toHaveBeenCalledWith(CLUB_ID);
  });

  it("does not refetch when only the time zone changes: it is read at render, not stored with the match", () => {
    const first = render("America/Los_Angeles", { initial: { data: { fixture, clubLabel: "RCFC" }, failed: false } });
    const second = render("America/New_York", { initial: { data: { fixture, clubLabel: "RCFC" }, failed: false } });
    expect(first).toContain("7:45PM PT");
    expect(second).toContain("7:45PM ET");
    const keys = effects.captured.map(({ deps }) => deps).filter((deps) => deps?.includes(`${CLUB_ID}:${FIXTURE_ID}`));
    expect(keys.length).toBeGreaterThan(0);
    for (const deps of keys) expect(deps).not.toContain("America/New_York");
  });
});
