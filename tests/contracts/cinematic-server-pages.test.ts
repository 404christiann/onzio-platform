import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import type { ClubContext } from "@/lib/club-context";
import type { DBShopKitSection } from "@/lib/db-types";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";

// RC-CLS-B: seeded with server data the client pages render the real page on first paint, with no Loading line.
vi.mock("@/lib/queries", () => ({ fetchClubBranding: vi.fn(), fetchFixtureById: vi.fn(), fetchRoster: vi.fn(), fetchActiveSeason: vi.fn(), fetchSchedule: vi.fn(), fetchShopKitVariants: vi.fn(), fetchShopCarouselPhotos: vi.fn(), fetchSiteSponsorLogos: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
vi.mock("@/lib/cinematic-shop-query", () => ({ fetchCinematicShopPurchase: vi.fn(), fetchCinematicShopContent: vi.fn() }));
import CinematicMatchSummaryPage from "@/components/cinematic/CinematicMatchSummaryPage";
import CinematicRosterPage from "@/components/cinematic/CinematicRosterPage";
import CinematicSchedulePage from "@/components/cinematic/CinematicSchedulePage";
import CinematicShopPage from "@/components/cinematic/CinematicShopPage";

const club: ClubContext = { id: "11111111-1111-4111-8111-111111111111", slug: "sample", name: "Sample Club", primaryDomain: "sample.localhost", lifecycle: "active", publicAccess: "live", kind: "test", stripePriceId: null, tier: "pro", role: null, primaryColor: "#ff0018", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true };
const render = (child: React.ReactElement) => renderToStaticMarkup(createElement(ClubContextProvider, { club, children:
  createElement(ClubBrandingProvider, { initialBranding: { logoPath: "/logo.webp", inverseLogoPath: "/logo.webp", footerTagline: "Sample City" }, children: child }) }));
const section: DBShopKitSection = { id: "kit-1", surface: "shop", kit_variant: "home", updated_at: "", eyebrow: "New kit", title: "Seeded kit title", description: "d", bullet_points: [], store_note: "", cta_label: "", cta_link: "" };

describe("seeded cinematic client pages", () => {
  it("Roster shows the squad, not the loading line", () => {
    const roster = { seasonId: "s", seasonLabel: "2027", goalkeepers: [], defenders: [], midfielders: [], forwards: [] };
    const html = render(createElement(CinematicRosterPage, { initial: { roster, failed: false } }));
    expect(html).toContain("The Squad");
    expect(html).not.toContain("Loading the squad");
  });
  it("Roster shows the unavailable message when the server read failed", () => {
    expect(render(createElement(CinematicRosterPage, { initial: { roster: null, failed: true } }))).toContain("The squad is temporarily unavailable. Please try again.");
  });
  it("Schedule shows fixtures and uses the server clock for the Next badge", () => {
    const fixtures = [
      { id: "a", date: "2027-01-01", time: "19:00", opponent: "Past FC", home: true, venue: "Park" },
      { id: "b", date: "2027-03-01", time: "19:00", opponent: "Future FC", home: false, venue: "Away" },
    ];
    const data = { fixtures, seasonLabel: "2027", timeZone: "UTC" };
    const html = render(createElement(CinematicSchedulePage, { initial: { data, failed: false, nowIso: "2027-02-01T00:00:00.000Z" } }));
    expect(html).toContain("Future FC");
    expect(html).not.toContain("Loading fixtures");
    expect(html.match(/next-badge/g)).toHaveLength(1);
    // RC-SAM-FIXES: the next match leads, then played matches newest first.
    expect(html.indexOf("next-badge")).toBeLessThan(html.indexOf("Past FC"));
    expect(html).toContain("Past FC");
  });
  it("Schedule keeps its alert and retry button on a failed server read", () => {
    const html = render(createElement(CinematicSchedulePage, { initial: { data: null, failed: true, nowIso: "2027-02-01T00:00:00.000Z" } }));
    expect(html).toContain("The schedule is temporarily unavailable.");
    expect(html).toContain("Try again");
  });
  it("Match Summary shows the played match, not the loading line, in the club's saved time zone", () => {
    const fixture = { id: "m1", date: "2027-05-02", time: "19:45:00", opponent: "Ocelot FC", home: true, venue: "Robinson Stadium", city: "Pasadena", state: "CA", competition: "UPSL", roseCityScore: 2, opponentScore: 1 };
    const html = render(createElement(CinematicMatchSummaryPage, { fixtureId: "m1", initial: { data: { fixture, clubLabel: "RCFC" }, failed: false } }));
    expect(html).toContain("Match Summary");
    expect(html).toContain("Ocelot FC");
    expect(html).toContain("7:45PM PT");
    expect(html).not.toContain("Loading match");
  });
  it("Match Summary says it could not find a match the server did not return", () => {
    const html = render(createElement(CinematicMatchSummaryPage, { fixtureId: "m1", initial: { data: { fixture: null, clubLabel: "RCFC" }, failed: false } }));
    expect(html).toContain("We couldn’t find this match.");
    expect(html).not.toContain("Loading match");
  });
  it("Match Summary keeps its alert and retry button on a failed server read", () => {
    const html = render(createElement(CinematicMatchSummaryPage, { fixtureId: "m1", initial: { data: null, failed: true } }));
    expect(html).toContain("This match summary is temporarily unavailable.");
    expect(html).toContain("Try again");
  });
  it("Match Summary still loads in the browser when nothing was served (admin or client-only use)", () => {
    expect(render(createElement(CinematicMatchSummaryPage, { fixtureId: "m1" }))).toContain("Loading match…");
  });
  it("Shop shows the kit, not the loading line", () => {
    const kit = { section, photos: [] };
    const content = { kits: { home: kit, away: { section: null, photos: [] }, third: { section: null, photos: [] } }, photoRows: { home: [], away: [], third: [] }, purchase: null, presentation: EMPTY_CINEMATIC_SHOP_CONTENT, sponsors: [] };
    const html = render(createElement(CinematicShopPage, { initial: { content, failed: false } }));
    expect(html).toContain("Seeded kit title");
    expect(html).not.toContain("Loading shop");
  });
  it("Shop shows the unavailable message when the server read failed", () => {
    expect(render(createElement(CinematicShopPage, { initial: { content: null, failed: true } }))).toContain("Shop is temporarily unavailable. Please try again.");
  });
});
