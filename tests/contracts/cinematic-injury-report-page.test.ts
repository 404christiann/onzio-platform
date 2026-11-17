import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  return { club: vi.fn(), tables: {} as Record<string, unknown[]> };
});
vi.mock("@/lib/queries", () => ({ fetchSiteSponsorLogos: vi.fn(async () => []) }));
vi.mock("@/components/cinematic/CinematicNewsPartners", () => ({ default: () => createElement("p", null, "Partner strip") }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn(async () => null) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

/** A stand-in for the trusted server client: every filter chains, awaiting returns the table's rows. */
function table(name: string) {
  const rows = () => ({ data: mocks.tables[name] ?? [], error: null });
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order", "limit"]) builder[method] = () => builder;
  builder.maybeSingle = async () => ({ data: (mocks.tables[name] ?? [])[0] ?? null, error: null });
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
  return builder;
}
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({ from: table }) }) }));

import NewsArticleRoute from "@/app/%5Fclubs/[slug]/news/[articleSlug]/page";

const params = () => Promise.resolve({ slug: "rose-city", articleSlug: "injury-report" });
const render = async () => renderToStaticMarkup(await NewsArticleRoute({ params: params() }));
const page = {
  presenterName: "MVMNT CULTR", rehabHeading: "Rehab with MVMNT CULTR", quote: "Back on the field stronger than before.",
  quoteAttribution: "MVMNT CULTR rehab team", videoUrl: "", bandAlt: "Rose City FC player dribbling the ball",
};
const report = (overrides: Record<string, unknown> = {}) => ({ content: page, presenter_logo_media_asset_id: null, band_media_asset_id: "a0000000-0000-4000-8000-000000000001", ...overrides });
const players = [
  { id: "b0000000-0000-4000-8000-000000000004", name: "Chris Martinez", number: 4, position: "Defender", photo_url: "", photo_asset_id: "a0000000-0000-4000-8000-000000000002", active: true },
  { id: "b0000000-0000-4000-8000-000000000007", name: "Edgardo Artero", number: 7, position: "Midfielder", photo_url: "https://legacy.example/artero.webp", photo_asset_id: null, active: true },
  { id: "b0000000-0000-4000-8000-000000000099", name: "Former Player", number: 99, position: "Forward", photo_url: "", photo_asset_id: null, active: false },
];
const entries = [
  { id: "c0000000-0000-4000-8000-000000000002", player_id: "b0000000-0000-4000-8000-000000000007", injury: "Ankle sprain", timeline: "Day-to-day", note: "", sort_order: 0 },
  { id: "c0000000-0000-4000-8000-000000000001", player_id: "b0000000-0000-4000-8000-000000000004", injury: "Hamstring strain", timeline: "2–3 weeks", note: "Rested as a precaution.", sort_order: 1 },
  { id: "c0000000-0000-4000-8000-000000000003", player_id: "b0000000-0000-4000-8000-000000000099", injury: "Knee", timeline: "Season", note: "", sort_order: 2 },
];
const assets = [
  { id: "a0000000-0000-4000-8000-000000000001", storage_bucket: "onzio-media", storage_path: "rose/news/band-1.webp", width: 1200, height: 670 },
  { id: "a0000000-0000-4000-8000-000000000002", storage_bucket: "onzio-media", storage_path: "rose/roster/photo-4.webp", width: 2046, height: 2400 },
  { id: "a0000000-0000-4000-8000-000000000003", storage_bucket: "onzio-media", storage_path: "rose/branding/logo-1.png", width: 800, height: 160 },
];
const MEDIA = "http://127.0.0.1:55321/storage/v1/object/public/onzio-media";

describe("RC2027-INJURY-REPORT public page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.club.mockResolvedValue({ id: "rose-city-id", name: "Rose City FC", presentationTemplateKey: "cinematic@2" });
    mocks.tables = { cinematic_injury_report_content: [report()], cinematic_injury_entries: entries, players, media_assets: assets };
  });

  it("shows Sam's heading and one card per entry, in the owner's order, with the Roster player's name, number, position and photo", async () => {
    const html = await render();
    expect(html).toContain("Injury Report");
    expect(html).toContain("Presented by");
    expect(html.indexOf("Edgardo Artero")).toBeLessThan(html.indexOf("Chris Martinez"));
    expect(html).toMatch(/Chris Martinez[^]*#4[^]*Defender[^]*Hamstring strain[^]*2–3 weeks[^]*Rested as a precaution\./);
    expect(html).toMatch(/Edgardo Artero[^]*#7[^]*Midfielder[^]*Ankle sprain[^]*Day-to-day/);
    expect(html).toContain(`src="${MEDIA}/rose/roster/photo-4.webp"`);
    expect(html).toContain('src="https://legacy.example/artero.webp"');
    expect(html).not.toContain("Placeholder");
    expect(html).toContain("Partner strip");
  });

  it("hides an entry whose player is no longer active on the Roster", async () => {
    const html = await render();
    expect(html).not.toContain("Former Player");
    expect(html).not.toContain("Season");
  });

  it("shows the No current injuries card when there are no entries to show", async () => {
    mocks.tables.cinematic_injury_entries = [entries[2]];
    const html = await render();
    expect(html).toContain("No current injuries");
    expect(html).toContain("Every player is available for selection.");
    expect(html).not.toContain("injury-list");
  });

  it("shows the partner's name as text until a logo is uploaded, then the logo", async () => {
    let html = await render();
    expect(html).toMatch(/injury-presenter-name[^>]*>MVMNT CULTR</);
    mocks.tables.cinematic_injury_report_content = [report({ presenter_logo_media_asset_id: "a0000000-0000-4000-8000-000000000003" })];
    html = await render();
    expect(html).toContain(`src="${MEDIA}/rose/branding/logo-1.png"`);
    expect(html).toContain('alt="MVMNT CULTR"');
    expect(html).not.toContain("injury-presenter-name");
  });

  it("shows the photo band, the Rehab heading and the quote, and hides a blank quote and a missing band", async () => {
    let html = await render();
    expect(html).toContain(`src="${MEDIA}/rose/news/band-1.webp"`);
    expect(html).toContain('alt="Rose City FC player dribbling the ball"');
    expect(html).toContain("Rehab with MVMNT CULTR");
    expect(html).toContain("Back on the field stronger than before.");
    expect(html).toContain("MVMNT CULTR rehab team");
    mocks.tables.cinematic_injury_report_content = [report({ content: { ...page, quote: "" }, band_media_asset_id: null })];
    html = await render();
    expect(html).not.toContain("injury-quote");
    expect(html).not.toContain("injury-band");
  });

  it("shows Coming soon without a video link and a play button with one, loading nothing from YouTube first", async () => {
    let html = await render();
    expect(html).toContain("Coming soon");
    expect(html).not.toContain("<iframe");
    mocks.tables.cinematic_injury_report_content = [report({ content: { ...page, videoUrl: "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0" } })];
    html = await render();
    expect(html).toMatch(/<button[^>]*aria-label="Play Rehab with MVMNT CULTR video"/);
    expect(html).not.toContain("Coming soon");
    expect(html).not.toContain("<iframe");
  });

  it("shows the starting page when the owner has never saved it", async () => {
    mocks.tables = { players, media_assets: assets };
    const html = await render();
    expect(html).toContain("Rehab with MVMNT CULTR");
    expect(html).toContain("No current injuries");
    expect(html).toContain("Coming soon");
  });

  it("is not found for other website designs", async () => {
    mocks.club.mockResolvedValue({ id: "other", name: "Other", presentationTemplateKey: "editorial@1" });
    await expect(render()).rejects.toThrow("not found");
  });
});
