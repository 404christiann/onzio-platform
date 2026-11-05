import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CinematicPolicyContent } from "@/lib/cinematic-policies-content";

const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), content: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/cinematic-policies-query", () => ({ fetchCinematicPolicyContent: mocks.content }));
vi.mock("@/components/cinematic/CinematicDestination", () => ({ default: ({ labelId }: { labelId: string }) => createElement("p", null, `Placeholder ${labelId}`) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
import GuidelinesPage from "@/app/%5Fclubs/[slug]/stadium/guidelines/page";
import FanCodePage from "@/app/%5Fclubs/[slug]/stadium/fan-code/page";

const content: CinematicPolicyContent = {
  guidelines: {
    title: "Stadium Guidelines", subtitle: "& FAQ’s", heading: "Guidelines", rows: [
      { id: "bags", heading: "Bags & Backpacks", blocks: [] },
      { id: "accessibility", heading: "Accessibility", blocks: [
        { kind: "subheading", text: "Parking" },
        { kind: "paragraph", text: "ADA parking is located within Robinson Stadium." },
      ] },
      { id: "animals", heading: "Animals", blocks: [{ kind: "paragraph", text: "Robinson Stadium has a no-pet policy." }] },
    ],
  },
  fanCode: { title: "Fan Code of Conduct", subtitle: "", heading: "Code of Conduct", rows: [{ id: "respect", heading: "Respect", blocks: [{ kind: "paragraph", text: "Cheer for your team." }] }] },
};
const params = Promise.resolve({ slug: "rose-city" });
const render = async (page: typeof GuidelinesPage) => renderToStaticMarkup(await page({ params }));
const rows = (html: string) => html.match(/<details[^>]*>/g) ?? [];

describe("cinematic Stadium Guidelines and Fan Code of Conduct pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schema.mockReturnValue(mocks.trusted);
    mocks.content.mockResolvedValue(content);
    mocks.club.mockResolvedValue({ id: "rose-city-id", presentationTemplateKey: "cinematic@2" });
  });
  it("renders the owner's Stadium Guidelines record from the trusted tenant", async () => {
    const html = await render(GuidelinesPage);
    expect(mocks.content).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
    expect(html).toContain("<h1>Stadium Guidelines</h1>");
    expect(html).toContain("&amp; FAQ’s");
    expect(html).toContain(">Guidelines</h2>");
    expect(html).toContain("<h4>Parking</h4>");
    expect(html).toContain("<p>ADA parking is located within Robinson Stadium.</p>");
    expect(html).not.toContain("Fan Code of Conduct");
  });
  it("shows every row in the owner's order, with 'Details coming soon.' for a row without an answer", async () => {
    const html = await render(GuidelinesPage);
    expect(rows(html)).toHaveLength(3);
    expect(html.indexOf("Bags &amp; Backpacks")).toBeLessThan(html.indexOf("Accessibility"));
    expect(html.match(/Details coming soon\./g)).toHaveLength(1);
  });
  it("starts every row that has an answer open, as Sam's reference shows", async () => {
    const opened = rows(await render(GuidelinesPage)).map(tag => / open=""/.test(tag));
    expect(opened).toEqual([false, true, true]);
  });
  it("renders the Fan Code of Conduct record on its own route, hiding a blank red line", async () => {
    const html = await render(FanCodePage);
    expect(html).toContain("<h1>Fan Code of Conduct</h1>");
    expect(html).toContain(">Code of Conduct</h2>");
    expect(html).toContain("Cheer for your team.");
    expect(html).not.toContain("FAQ");
  });
  it("keeps the existing placeholder for a cinematic club that has no saved policies", async () => {
    mocks.content.mockResolvedValue(null);
    expect(await render(GuidelinesPage)).toContain("Placeholder stadium-guidelines");
    expect(await render(FanCodePage)).toContain("Placeholder fan-code");
  });
  it("returns not found for other website designs without reading policy content", async () => {
    mocks.club.mockResolvedValue({ id: "editorial-id", presentationTemplateKey: "editorial@1" });
    await expect(render(GuidelinesPage)).rejects.toThrow("not found");
    await expect(render(FanCodePage)).rejects.toThrow("not found");
    expect(mocks.content).not.toHaveBeenCalled();
  });
});
