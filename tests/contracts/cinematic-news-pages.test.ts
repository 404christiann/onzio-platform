import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  return { club: vi.fn(), identity: vi.fn(), tables: {} as Record<string, unknown[]> };
});
vi.mock("@/lib/queries", () => ({ fetchSiteSponsorLogos: vi.fn(async () => []) }));
vi.mock("@/components/cinematic/CinematicNewsPartners", () => ({ default: () => createElement("p", null, "Partner strip") }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/editorial-identity", () => ({ fetchClubIdentity: mocks.identity }));
vi.mock("@/components/cinematic/CinematicDestination", () => ({ default: ({ labelId }: { labelId: string }) => createElement("p", null, `Placeholder ${labelId}`) }));
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

vi.mock("@supabase/ssr", async importOriginal => ({
  ...(await importOriginal<typeof import("@supabase/ssr")>()),
  createServerClient: () => {
    const clubQuery = { select: () => clubQuery, eq: () => clubQuery, maybeSingle: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", slug: "alpha", lifecycle: "active", public_access: "live" } }) };
    return { auth: { getUser: async () => ({ data: { user: null } }) }, schema: () => ({ from: () => clubQuery, rpc: async () => ({ data: "live", error: null }) }) };
  },
}));

import NewsPage from "@/app/%5Fclubs/[slug]/news/page";
import NewsArticleRoute from "@/app/%5Fclubs/[slug]/news/[articleSlug]/page";
import { middleware } from "@/middleware";

const SLUG = "foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc";
const content = {
  category: "sponsor-partner", cardHeading: "Foothill Transit", title: "Foothill Transit becomes Official Front of Jersey Sponsor of RCFC",
  subtitle: "Official Front of Jersey Sponsor for the 2027 Season", coverAlt: "Six Rose City FC lockers",
  paragraphs: ["Rose City FC announce sponsorship with Foothill Transit.", "Commuting with Foothill Transit."],
  actionLabel: "Partner with us", actionHref: "/community/partnership",
};
const foothill = { id: "a1", slug: SLUG, content, cover_media_asset_id: "cover-1", published_at: "2026-11-20T20:00:00+00:00", removed_at: null };
const community = { id: "a2", slug: "rcfc-in-the-community", content: { ...content, category: "community", cardHeading: "Community", title: "RCFC visits PUSD" }, cover_media_asset_id: null, published_at: "2027-01-05T18:00:00+00:00", removed_at: null };
const removed = { id: "a3", slug: "old-story", content: { ...content, title: "A removed story" }, cover_media_asset_id: null, published_at: "2027-02-01T18:00:00+00:00", removed_at: "2027-02-02T18:00:00+00:00" };
const cover = { id: "cover-1", storage_bucket: "onzio-media", storage_path: "rose/news/cover-1.jpg", width: 2287, height: 1237 };
const params = () => Promise.resolve({ slug: "rose-city" });
const articleParams = (articleSlug: string) => Promise.resolve({ slug: "rose-city", articleSlug });

describe("RC2027-NEWS public pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    mocks.club.mockResolvedValue({ id: "rose-city-id", name: "Rose City FC", presentationTemplateKey: "cinematic@2" });
    mocks.identity.mockResolvedValue({ timeZone: "America/Los_Angeles" });
    mocks.tables = { cinematic_news_articles: [foothill, community, removed], media_assets: [cover] };
  });

  it("lists shown articles newest first as numbered cards that open each article", async () => {
    const html = renderToStaticMarkup(await NewsPage({ params: params() }));
    expect(html).toContain("RCFC News");
    for (const label of ["Sponsor/Partner", "Partner", "Community", "New Player", "News"]) expect(html).toContain(label);
    expect(html.indexOf("RCFC visits PUSD")).toBeLessThan(html.indexOf("Foothill Transit becomes Official Front"));
    expect(html).toContain(`href="/news/${SLUG}"`);
    expect(html).toContain('href="/news/rcfc-in-the-community"');
    expect(html).toContain('src="http://127.0.0.1:55321/storage/v1/object/public/onzio-media/rose/news/cover-1.jpg"');
    expect(html).toContain("RCFC in the Community");
    expect(html).not.toContain("A removed story");
    expect(html).toMatch(/news-card-number[^>]*>1</);
    expect(html).toContain("Partner strip");
  });

  it("says News is coming soon when there are no articles", async () => {
    mocks.tables.cinematic_news_articles = [removed];
    expect(renderToStaticMarkup(await NewsPage({ params: params() }))).toContain("News is coming soon.");
  });

  it("shows the article with its category, club-time date, paragraphs and button", async () => {
    mocks.tables.cinematic_news_articles = [foothill];
    const html = renderToStaticMarkup(await NewsArticleRoute({ params: articleParams(SLUG) }));
    expect(html).toContain("<h1>Foothill Transit becomes Official Front of Jersey Sponsor of RCFC</h1>");
    expect(html).toContain("Official Front of Jersey Sponsor for the 2027 Season");
    expect(html).toContain("Sponsor/Partner");
    expect(html).toContain("Friday, Nov 20, 2026 at 12:00 PM");
    expect(html).toContain("Commuting with Foothill Transit.");
    expect(html).toContain('alt="Six Rose City FC lockers"');
    expect(html).toMatch(/<a[^>]*href="\/community\/partnership"[^>]*>Partner with us<\/a>/);
    expect(html).toContain("Partner strip");
  });

  it("returns not found for an unknown or removed article and for other site designs", async () => {
    mocks.tables.cinematic_news_articles = [];
    await expect(NewsArticleRoute({ params: articleParams("missing") })).rejects.toThrow("not found");
    mocks.tables.cinematic_news_articles = [removed];
    await expect(NewsArticleRoute({ params: articleParams("old-story") })).rejects.toThrow("not found");
    mocks.club.mockResolvedValue({ id: "other", name: "Other", presentationTemplateKey: "editorial@1" });
    await expect(NewsPage({ params: params() })).rejects.toThrow("not found");
    await expect(NewsArticleRoute({ params: articleParams(SLUG) })).rejects.toThrow("not found");
  });

  it("keeps /news/injury-report on its own page, the Injury Report", async () => {
    const html = renderToStaticMarkup(await NewsArticleRoute({ params: articleParams("injury-report") }));
    expect(html).toContain("<h1>Injury Report</h1>");
    expect(html).not.toContain("news-card");
  });

  it("routes article addresses to the tenant's News pages", async () => {
    const rewrite = async (path: string) => (await middleware(new NextRequest(`http://alpha.localhost${path}`, { headers: { host: "alpha.localhost" } }))).headers.get("x-middleware-rewrite");
    expect(await rewrite(`/news/${SLUG}`)).toContain(`/_clubs/alpha/news/${SLUG}`);
    expect(await rewrite("/news/Not_A_Slug")).toBeNull();
    expect(await rewrite("/news/a/b")).toBeNull();
  });
});
