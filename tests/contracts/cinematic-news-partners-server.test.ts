import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-CLS: the News pages end with the partner strip. It fetched its sponsors in the browser and rendered nothing until
// they arrived, so the footer moved (production: 0.067 at 1440, up to 0.125 at 390). The News routes now load the
// sponsors on the server and the strip renders them on first paint without refetching.
const CLUB_ID = "00000000-0000-4000-8000-000000000001";
const club = { id: CLUB_ID, slug: "rose-city", name: "Rose City FC", presentationTemplateKey: "cinematic@2" };
const logo = { id: "logo-1", name: "Tepito Coffee", logo_url: "https://example.test/tepito.webp" };
const serverClient = { marker: "request-client" };

const mocks = vi.hoisted(() => ({
  sponsors: vi.fn(), club: vi.fn(), articles: vi.fn(), article: vi.fn(), identity: vi.fn(), injury: vi.fn(),
  effects: [] as Array<{ effect: () => unknown; deps?: readonly unknown[] }>,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // The server renderer never runs effects; capture them so the test can run the strip's fetch effect by hand.
  return { ...actual, useEffect: (effect: () => unknown, deps?: readonly unknown[]) => { mocks.effects.push({ effect, deps }); } };
});
vi.mock("@/lib/queries", () => ({ fetchSiteSponsorLogos: mocks.sponsors }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => serverClient }) }));
vi.mock("@/lib/cinematic-news-query", () => ({ fetchNewsArticles: mocks.articles, fetchNewsArticle: mocks.article }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: mocks.identity }));
vi.mock("@/lib/cinematic-injury-report-query", () => ({ fetchInjuryReport: mocks.injury }));
vi.mock("@/components/cinematic/CinematicInjuryReport", () => ({ default: () => null }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => club }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null, loading: false }) }));
vi.mock("@/components/cinematic/CinematicSponsors", () => ({
  default: ({ sponsors }: { sponsors: Array<{ name: string }> }) => createElement("p", null, `Partners: ${sponsors.map((s) => s.name).join(",") || "none"}`),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

import NewsPage from "@/app/%5Fclubs/[slug]/news/page";
import NewsArticlePage from "@/app/%5Fclubs/[slug]/news/[articleSlug]/page";
import CinematicNewsPartners from "@/components/cinematic/CinematicNewsPartners";

/** Renders an element tree whose async server components resolve the way the server resolves them. */
async function resolveAsync(node: unknown): Promise<unknown> {
  if (!node || typeof node !== "object" || !("type" in node)) return node;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    return resolveAsync(await (element.type as (p: unknown) => Promise<unknown>)(element.props));
  }
  const children = element.props?.children;
  if (children === undefined) return node;
  const resolved = Array.isArray(children) ? await Promise.all(children.map(resolveAsync)) : await resolveAsync(children);
  return { ...element, props: { ...element.props, children: resolved } };
}
const html = async (page: Promise<unknown>) => renderToStaticMarkup((await resolveAsync(await page)) as React.ReactElement);
function runStripEffect() {
  const strip = mocks.effects.splice(0).filter(({ deps }) => deps?.includes(CLUB_ID));
  expect(strip).toHaveLength(1);
  const cleanup = strip[0].effect();
  if (typeof cleanup === "function") cleanup();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effects.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.club.mockResolvedValue(club);
  mocks.sponsors.mockResolvedValue([logo]);
  mocks.articles.mockResolvedValue([]);
  mocks.identity.mockResolvedValue({ timeZone: "America/Los_Angeles" });
  mocks.injury.mockResolvedValue(null);
});

describe("News partner strip loads on the server", () => {
  it("the News list reads the carousel sponsors with the request client and shows them on first paint", async () => {
    const markup = await html(NewsPage({ params: Promise.resolve({ slug: "rose-city" }) }));
    expect(mocks.sponsors).toHaveBeenCalledWith("carousel", CLUB_ID, serverClient);
    expect(markup).toContain("Partners: Tepito Coffee");
    mocks.sponsors.mockClear();
    runStripEffect();
    expect(mocks.sponsors).not.toHaveBeenCalled();
  });

  it("the Injury Report page does the same", async () => {
    const markup = await html(NewsArticlePage({ params: Promise.resolve({ slug: "rose-city", articleSlug: "injury-report" }) }));
    expect(mocks.sponsors).toHaveBeenCalledWith("carousel", CLUB_ID, serverClient);
    expect(markup).toContain("Partners: Tepito Coffee");
  });

  it("a News article does the same", async () => {
    mocks.article.mockResolvedValue({ id: "a1", slug: "kit-launch", publishedAt: "2027-01-01T18:00:00Z", cover: null, content: { title: "Kit launch", subtitle: "", category: "news", coverAlt: "", paragraphs: [], actionLabel: "", actionHref: "" } });
    const markup = await html(NewsArticlePage({ params: Promise.resolve({ slug: "rose-city", articleSlug: "kit-launch" }) }));
    expect(mocks.sponsors).toHaveBeenCalledWith("carousel", CLUB_ID, serverClient);
    expect(markup).toContain("Partners: Tepito Coffee");
  });

  it("a failed server read falls back to the browser fetch instead of breaking the page", async () => {
    mocks.sponsors.mockRejectedValueOnce(new Error("boom"));
    const markup = await html(NewsPage({ params: Promise.resolve({ slug: "rose-city" }) }));
    expect(markup).toContain("News is coming soon.");
    mocks.sponsors.mockClear();
    runStripEffect();
    expect(mocks.sponsors).toHaveBeenCalledWith("carousel", CLUB_ID);
  });

  it("the strip without server sponsors (admin previews) still fetches in the browser", () => {
    renderToStaticMarkup(createElement(CinematicNewsPartners));
    runStripEffect();
    expect(mocks.sponsors).toHaveBeenCalledWith("carousel", CLUB_ID);
  });
});
