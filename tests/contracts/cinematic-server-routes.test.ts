import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-CLS-B: the cinematic@2 Roster, Schedule and Shop routes fetch on the server and hand the data to the
// presentational page, so the first paint is the real page (no "Loading…" line that later pushes the footer down).
const mocks = vi.hoisted(() => ({
  club: vi.fn(), schema: vi.fn(), trusted: { tag: "trusted" },
  roster: vi.fn(), season: vi.fn(), schedule: vi.fn(), kits: vi.fn(), photos: vi.fn(), sponsors: vi.fn(),
  identity: vi.fn(), purchase: vi.fn(), content: vi.fn(),
}));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/queries", () => ({
  fetchRoster: mocks.roster, fetchActiveSeason: mocks.season, fetchSchedule: mocks.schedule,
  fetchShopKitVariants: mocks.kits, fetchShopCarouselPhotos: mocks.photos, fetchSiteSponsorLogos: mocks.sponsors,
}));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: mocks.identity }));
vi.mock("@/lib/cinematic-shop-query", () => ({ fetchCinematicShopPurchase: mocks.purchase, fetchCinematicShopContent: mocks.content }));
const { stub } = vi.hoisted(() => ({ stub: async (name: string) => { const { createElement: h } = await import("react"); return { default: (props: { initial?: unknown }) => h("div", { "data-page": name, "data-initial": JSON.stringify(props.initial ?? null) }) }; } }));
vi.mock("@/components/cinematic/CinematicRosterPage", () => stub("cinematic-roster"));
vi.mock("@/components/cinematic/CinematicSchedulePage", () => stub("cinematic-schedule"));
vi.mock("@/components/cinematic/CinematicShopPage", () => stub("cinematic-shop"));
vi.mock("@/app/(public)/roster/page", () => stub("public-roster"));
vi.mock("@/app/(public)/schedule/page", () => stub("public-schedule"));
vi.mock("@/app/(public)/shop/page", () => stub("public-shop"));
import RosterRoute from "@/app/%5Fclubs/[slug]/roster/page";
import ScheduleRoute from "@/app/%5Fclubs/[slug]/schedule/page";
import ShopRoute from "@/app/%5Fclubs/[slug]/shop/page";

const params = { params: Promise.resolve({ slug: "tenant" }) };
const cinematic = { id: "tenant-id", presentationTemplateKey: "cinematic@2", storeEnabled: true };
const html = async (route: (p: typeof params) => Promise<React.ReactElement>) => renderToStaticMarkup(await route(params));
const parse = (markup: string) => JSON.parse(/data-initial="([^"]*)"/.exec(markup)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'")) as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.schema.mockReturnValue(mocks.trusted);
  mocks.club.mockResolvedValue(cinematic);
  mocks.roster.mockResolvedValue({ seasonId: "s", seasonLabel: "2027", goalkeepers: [], defenders: [], midfielders: [], forwards: [] });
  mocks.season.mockResolvedValue({ id: "season-1", label: "2027" });
  mocks.schedule.mockResolvedValue([{ id: "f1", date: "2027-05-01", time: "19:00", opponent: "Rivals", home: true, venue: "Park" }]);
  mocks.identity.mockResolvedValue({ timeZone: "America/Los_Angeles" });
  mocks.kits.mockResolvedValue({ home: { section: null, photos: [] }, away: { section: null, photos: [] }, third: { section: null, photos: [] } });
  mocks.photos.mockResolvedValue([]);
  mocks.sponsors.mockResolvedValue([]);
  mocks.purchase.mockResolvedValue(null);
  mocks.content.mockResolvedValue({ tag: "presentation" });
});

describe("cinematic@2 Roster route", () => {
  it("fetches on the server with the request client and hands the roster to the page", async () => {
    const markup = await html(RosterRoute);
    expect(markup).toContain('data-page="cinematic-roster"');
    expect(mocks.schema).toHaveBeenCalledWith("onzio");
    expect(mocks.roster).toHaveBeenCalledWith(undefined, "tenant-id", {}, mocks.trusted);
    expect(parse(markup)).toMatchObject({ failed: false, roster: { seasonLabel: "2027" } });
  });
  it("passes a failed read as data instead of crashing", async () => {
    mocks.roster.mockRejectedValue(new Error("boom"));
    expect(parse(await html(RosterRoute))).toEqual({ failed: true, roster: null });
  });
  it.each(["clubhouse@1", "heritage@1", "cinematic@1"])("renders the existing client page for %s and fetches nothing", async (template) => {
    mocks.club.mockResolvedValue({ ...cinematic, presentationTemplateKey: template });
    expect(await html(RosterRoute)).toContain('data-page="public-roster"');
    expect(mocks.roster).not.toHaveBeenCalled();
  });
});

describe("cinematic@2 Schedule route", () => {
  it("fetches season, identity and fixtures on the server and passes the server clock", async () => {
    const markup = await html(ScheduleRoute);
    expect(markup).toContain('data-page="cinematic-schedule"');
    expect(mocks.season).toHaveBeenCalledWith("tenant-id", mocks.trusted);
    expect(mocks.identity).toHaveBeenCalledWith("tenant-id", mocks.trusted);
    expect(mocks.schedule).toHaveBeenCalledWith("season-1", "tenant-id", mocks.trusted);
    const initial = parse(markup);
    expect(initial.failed).toBe(false);
    expect(initial.data).toMatchObject({ seasonLabel: "2027", timeZone: "America/Los_Angeles", fixtures: [{ opponent: "Rivals" }] });
    expect(Number.isNaN(Date.parse(initial.nowIso))).toBe(false);
  });
  it("matches the client page defaults with no active season or time zone", async () => {
    mocks.season.mockResolvedValue(null); mocks.identity.mockResolvedValue(null);
    const initial = parse(await html(ScheduleRoute));
    expect(initial.data).toEqual({ fixtures: [], seasonLabel: "Current", timeZone: "UTC" });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("passes a failed read as data", async () => {
    mocks.schedule.mockRejectedValue(new Error("boom"));
    expect(parse(await html(ScheduleRoute))).toMatchObject({ failed: true, data: null });
  });
  it("leaves other templates on the existing client page", async () => {
    mocks.club.mockResolvedValue({ ...cinematic, presentationTemplateKey: "clubhouse@1" });
    expect(await html(ScheduleRoute)).toContain('data-page="public-schedule"');
    expect(mocks.season).not.toHaveBeenCalled();
  });
});

describe("cinematic@2 Shop route", () => {
  it("fetches the same seven reads with the request client", async () => {
    const markup = await html(ShopRoute);
    expect(markup).toContain('data-page="cinematic-shop"');
    expect(mocks.kits).toHaveBeenCalledWith("shop", "tenant-id", mocks.trusted);
    for (const variant of ["home", "away", "third"]) expect(mocks.photos).toHaveBeenCalledWith(variant, "tenant-id", mocks.trusted);
    expect(mocks.purchase).toHaveBeenCalledWith("tenant-id", mocks.trusted);
    expect(mocks.content).toHaveBeenCalledWith("tenant-id", mocks.trusted);
    expect(mocks.sponsors).toHaveBeenCalledWith("carousel", "tenant-id", mocks.trusted);
    expect(parse(markup)).toMatchObject({ failed: false, content: { presentation: { tag: "presentation" }, photoRows: { home: [], away: [], third: [] } } });
  });
  it("still returns 404 when the store switch is off, before any fetch", async () => {
    mocks.club.mockResolvedValue({ ...cinematic, storeEnabled: false });
    await expect(html(ShopRoute)).rejects.toThrow();
    expect(mocks.kits).not.toHaveBeenCalled();
  });
  it("passes a failed read as data", async () => {
    mocks.kits.mockRejectedValue(new Error("boom"));
    expect(parse(await html(ShopRoute))).toEqual({ failed: true, content: null });
  });
  it("leaves other templates on the existing client page", async () => {
    mocks.club.mockResolvedValue({ ...cinematic, presentationTemplateKey: "heritage@1" });
    expect(await html(ShopRoute)).toContain('data-page="public-shop"');
    expect(mocks.kits).not.toHaveBeenCalled();
  });
});
