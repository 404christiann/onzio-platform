import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { EMPTY_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
const mocks = vi.hoisted(() => ({ club: vi.fn(), content: vi.fn(), schema: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/queries", () => ({ fetchAboutClubContent: mocks.content }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/components/cinematic/CinematicCrest", () => ({ default: ({ content }: { content: { map_image_url: string } }) => createElement("div", { "data-renderer": "cinematic2" }, content.map_image_url) }));
vi.mock("@/components/ClubLogoPageClient", () => ({ default: ({ content }: { content: { map_image_url: string } }) => createElement("div", { "data-renderer": "legacy" }, content.map_image_url) }));
import TenantClubLogoPage from "@/app/%5Fclubs/[slug]/club/logo/page";

beforeEach(() => { vi.clearAllMocks(); mocks.schema.mockReturnValue(mocks.trusted); mocks.content.mockResolvedValue({ logo: { ...EMPTY_CLUB_LOGO_PAGE_CONTENT, map_image_url: "tenant-map" } }); });
it("uses the authenticated server schema and scopes the new renderer to cinematic@2", async () => {
  for (const template of ["cinematic@2", "cinematic@1", "clubhouse@1", "heritage@1"]) {
    mocks.club.mockResolvedValue({ id: "tenant", presentationTemplateKey: template });
    const html = renderToStaticMarkup(await TenantClubLogoPage({ params: Promise.resolve({ slug: "tenant" }) }));
    expect(html).toContain(`data-renderer="${template === "cinematic@2" ? "cinematic2" : "legacy"}"`);
    expect(html).toContain("tenant-map");
    expect(mocks.content).toHaveBeenLastCalledWith("tenant", mocks.trusted);
    expect(mocks.schema).toHaveBeenLastCalledWith("onzio");
  }
});
