import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fixture } from "@/lib/data";
import { defaultCinematicHomepageContent, fetchCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

const CLUB_ID = "00000000-0000-4000-8000-000000000001";
const club = { id: CLUB_ID, slug: "rose-city", name: "Rose City FC", storeEnabled: true, presentationTemplateKey: "cinematic@2" };
const revamp = { ...defaultCinematicHomepageContent() };

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => club }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: revamp, loading: false }) }));
const mocks = vi.hoisted(() => ({
  fetchHomepageContent: vi.fn(), fetchSchedule: vi.fn(), fetchShopKitContent: vi.fn(), fetchSiteSponsorLogos: vi.fn(), fetchClubIdentity: vi.fn(),
  fetchHomepageHeroContent: vi.fn(), getClubContextBySlug: vi.fn(), createClient: vi.fn(),
}));
vi.mock("@/lib/queries", () => ({
  fetchHomepageContent: mocks.fetchHomepageContent, fetchSchedule: mocks.fetchSchedule, fetchShopKitContent: mocks.fetchShopKitContent,
  fetchSiteSponsorLogos: mocks.fetchSiteSponsorLogos, fetchHomepageHeroContent: mocks.fetchHomepageHeroContent,
}));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: mocks.fetchClubIdentity }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.getClubContextBySlug }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
// The server renderer never runs effects, so the no-refetch check captures them and runs them by hand after the
// render, the way the browser would after hydration. Server-side behaviour is unchanged (effects never run there).
const effects = vi.hoisted(() => ({ captured: [] as Array<{ effect: () => unknown; deps?: readonly unknown[] }> }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => unknown, deps?: readonly unknown[]) => { effects.captured.push({ effect, deps }); } };
});
/** Runs CinematicHome's data effect (the one keyed on the club id); the others need a browser (matchMedia, timers). */
function runHomeDataEffect() {
  const data = effects.captured.splice(0).filter(({ deps }) => deps?.includes(CLUB_ID));
  expect(data).toHaveLength(1);
  const cleanup = data[0].effect();
  if (typeof cleanup === "function") cleanup();
}
const clientFetchers = () => [mocks.fetchHomepageContent, mocks.fetchSchedule, mocks.fetchClubIdentity, mocks.fetchShopKitContent, mocks.fetchSiteSponsorLogos];
const homePageClient = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/components/HomePageClient", () => ({ default: homePageClient }));

import CinematicHome from "@/components/cinematic/CinematicHome";
import CinematicPhotos from "@/components/cinematic/CinematicPhotos";
import { loadCinematicHomeData } from "@/components/cinematic/cinematic-home-data";
import RoseCityHomePage from "@/components/sites/rose-city/RoseCityHomePage";
import CinematicHomeDynamic from "@/components/cinematic/CinematicHomeDynamic";
import TenantHomePage from "@/app/%5Fclubs/[slug]/page";

const fixture = (values: Partial<Fixture>): Fixture => ({ date: "2099-03-13", time: "19:45", opponent: "Visitors", home: true, venue: "Robinson Stadium", city: "Portland", state: "OR", ...values });
const serverClient = { schema: () => serverClient, marker: "request-client" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClubContextBySlug.mockResolvedValue(club);
  mocks.createClient.mockResolvedValue({ schema: () => serverClient });
  mocks.fetchHomepageHeroContent.mockResolvedValue(null);
  mocks.fetchHomepageContent.mockResolvedValue({ hero: null, slideshowPhotos: [], slideshowSettings: null, behindTheRose: null });
  mocks.fetchSchedule.mockResolvedValue([fixture({})]);
  mocks.fetchClubIdentity.mockResolvedValue({ timeZone: "America/Los_Angeles", initials: "RCFC" });
  mocks.fetchShopKitContent.mockResolvedValue({ section: null, photos: [] });
  mocks.fetchSiteSponsorLogos.mockResolvedValue([]);
});

describe("cinematic@2 home first paint", () => {
  it("Rose City's server page fetches with the request client and renders CinematicHome with the data", async () => {
    const page = await TenantHomePage({ params: Promise.resolve({ slug: "rose-city" }) });
    expect(page.type).toBe(RoseCityHomePage);
    const home = await RoseCityHomePage(page.props);
    for (const fetcher of [mocks.fetchHomepageContent, mocks.fetchShopKitContent, mocks.fetchSiteSponsorLogos, mocks.fetchSchedule, mocks.fetchClubIdentity]) {
      expect(fetcher.mock.calls[0].at(-1)).toBe(serverClient);
    }
    expect(home.type).toBe(CinematicHomeDynamic);
    expect(home.props.initialData.fixture.venue).toBe("Robinson Stadium");
    expect(home.props.initialData.clubLabel).toBe("RCFC");
  });
  it("other clubs keep the shared HomePageClient and fetch nothing extra", async () => {
    mocks.getClubContextBySlug.mockResolvedValue({ ...club, slug: "other", presentationTemplateKey: "editorial@1" });
    const page = await TenantHomePage({ params: Promise.resolve({ slug: "other" }) });
    expect(page.type).toBe(homePageClient);
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });
  it("one failed read degrades only its own section", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetchSchedule.mockRejectedValue(new Error("boom"));
    mocks.fetchShopKitContent.mockRejectedValue(new Error("boom"));
    const data = await loadCinematicHomeData(CLUB_ID, serverClient as never);
    expect(data.fixture).toBeNull();
    expect(data.shop).toBeNull();
    expect(data.homepage).not.toBeNull();
  });
  it("picks the next home fixture in the club time zone on the server", async () => {
    mocks.fetchSchedule.mockResolvedValue([fixture({ date: "2027-03-13", time: "19:00" }), fixture({ date: "2027-03-14", time: "19:00", opponent: "Next" })]);
    const data = await loadCinematicHomeData(CLUB_ID, serverClient as never, new Date("2027-03-14T03:30:00Z"));
    expect(data.fixture?.opponent).toBe("Next");
  });
  it("renders the fixture on the first render, with no loading line and no client refetch", async () => {
    const data = await loadCinematicHomeData(CLUB_ID, serverClient as never);
    for (const fetcher of clientFetchers()) fetcher.mockClear();
    effects.captured.length = 0;
    const html = renderToStaticMarkup(createElement(CinematicHome, { initialHeroContent: null, initialData: data }));
    expect(html).toContain("Friday March 13");
    expect(html).toContain("Robinson Stadium");
    expect(html).not.toContain("Loading next home match");
    runHomeDataEffect();
    for (const fetcher of clientFetchers()) expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps the loading line and the client fetch for previews that pass no server data", () => {
    effects.captured.length = 0;
    const html = renderToStaticMarkup(createElement(CinematicHome, { initialHeroContent: null }));
    expect(html).toContain("Loading next home match");
    runHomeDataEffect();
    for (const fetcher of clientFetchers()) expect(fetcher).toHaveBeenCalledWith(...(fetcher === mocks.fetchShopKitContent ? ["home", "home", CLUB_ID] : fetcher === mocks.fetchSiteSponsorLogos ? ["carousel", CLUB_ID] : fetcher === mocks.fetchSchedule ? [undefined, CLUB_ID] : [CLUB_ID]));
  });
  it("CinematicPhotos reserves the slideshow box when there are no photos", () => {
    const html = renderToStaticMarkup(createElement(CinematicPhotos, { photos: [] }));
    expect(html).toContain('class="slideshow"');
    expect(html).not.toContain("<img");
  });
  it("reads the raffle and ticket artwork dimensions from media_assets", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    const assets = [
      { id: "11111111-1111-4111-8111-111111111111", storage_bucket: "onzio-media", storage_path: "c/raffle.png", width: 1600, height: 500 },
      { id: "22222222-2222-4222-8222-222222222222", storage_bucket: "onzio-media", storage_path: "c/ticket.png", width: null, height: null },
    ];
    const row = { content: { ...defaultCinematicHomepageContent(), raffle: { alt: "Raffle" }, ticket: { alt: "Ticket", visible: true } }, raffle_media_asset_id: assets[0].id, ticket_media_asset_id: assets[1].id, presentation_config: {} };
    const selected: string[] = [];
    const chain = (result: unknown, table: string) => { const q: Record<string, unknown> = {}; for (const name of ["select", "eq", "is", "in"]) q[name] = (...args: unknown[]) => { if (name === "select") selected.push(`${table}:${args[0]}`); return q; }; q.maybeSingle = async () => ({ data: result, error: null }); q.then = (resolve: (value: unknown) => void) => resolve({ data: result, error: null }); return q; };
    const client = { from: (table: string) => chain(table === "media_assets" ? assets : row, table) };
    const content = await fetchCinematicHomepageContent(CLUB_ID, client as never);
    expect(selected.find(entry => entry.startsWith("media_assets:"))).toContain("width,height");
    expect(content.raffle).toMatchObject({ width: 1600, height: 500 });
    expect(content.ticket).toMatchObject({ width: null, height: null });
    vi.unstubAllEnvs();
  });
  it("sizes the raffle artwork from its stored dimensions on the first render, so the box exists before the image loads", () => {
    const sized = { ...revamp, raffle: { assetId: null, url: "/raffle.png", alt: "Raffle", width: 1600, height: 500 }, ticket: { assetId: null, url: "/ticket.png", alt: "Ticket", visible: true, width: 1200, height: 800 } };
    const before = { raffle: revamp.raffle, ticket: revamp.ticket };
    Object.assign(revamp, { raffle: sized.raffle, ticket: sized.ticket });
    const html = renderToStaticMarkup(createElement(CinematicHome, { initialHeroContent: null }));
    Object.assign(revamp, before);
    expect(html).toMatch(/<img[^>]*width="1600"[^>]*height="500"[^>]*>|<img[^>]*height="500"[^>]*width="1600"[^>]*>/);
    expect(html).toMatch(/<img[^>]*width="1200"[^>]*height="800"[^>]*>|<img[^>]*height="800"[^>]*width="1200"[^>]*>/);
  });
  it("HomePageClient server-renders the cinematic home and leaves every other dynamic import alone", () => {
    const source = readFileSync("components/HomePageClient.tsx", "utf8");
    expect(source).toMatch(/const CinematicHome = nextDynamic\(\(\) => import\("@\/components\/cinematic\/CinematicHome"\)\);/);
    expect(source.match(/\{ ssr: false \}/g)).toHaveLength(9);
  });
});
