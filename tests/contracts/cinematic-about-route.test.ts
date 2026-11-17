import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
const mocks = vi.hoisted(() => ({ club: vi.fn(), content: vi.fn(), sponsors: vi.fn(), schema: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/queries", () => ({ fetchAboutClubContent: mocks.content, fetchSiteSponsorLogos: mocks.sponsors }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/components/cinematic/CinematicAbout", () => ({ default: ({ content }: { content: { hero_title: string } }) => createElement("div", { "data-renderer": "cinematic2" }, content.hero_title) }));
vi.mock("@/components/sites/diverse-city/AcademyAboutPage", () => ({ default: ({ content }: { content: { hero_title: string } }) => createElement("div", { "data-renderer": "academy" }, content.hero_title) }));
vi.mock("@/components/ClubhouseAboutPage", () => ({ default: ({ content }: { content: { hero_title: string } }) => createElement("div", { "data-renderer": "clubhouse" }, content.hero_title) }));
import TenantAboutPage from "@/app/%5Fclubs/[slug]/club/about/page";
beforeEach(() => { vi.clearAllMocks(); mocks.schema.mockReturnValue(mocks.trusted); mocks.content.mockResolvedValue({ about: { ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "Tenant authored" } }); mocks.sponsors.mockResolvedValue([]); });
it("uses tenant server content and isolates the new About renderer to cinematic@2", async () => {
  // editorial@1 is retired, so it falls back to the shared About renderer like the other retired designs.
  for (const [template, renderer] of [["cinematic@2", "cinematic2"], ["cinematic@1", "academy"], ["academy@1", "academy"], ["heritage@1", "academy"], ["clubhouse@1", "clubhouse"], ["editorial@1", "academy"]]) {
    mocks.club.mockResolvedValue({ id: "tenant", presentationTemplateKey: template });
    const html = renderToStaticMarkup(await TenantAboutPage({ params: Promise.resolve({ slug: "tenant" }) }));
    expect(html).toContain(`data-renderer="${renderer}"`); expect(html).toContain("Tenant authored");
    expect(mocks.content).toHaveBeenLastCalledWith("tenant", mocks.trusted); expect(mocks.schema).toHaveBeenLastCalledWith("onzio");
  }
});
