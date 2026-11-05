import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterCinematicPartnersContent, type CinematicPartnersContent } from "@/lib/cinematic-partners-content";
import CinematicPartners from "@/components/cinematic/CinematicPartners";

const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), partners: vi.fn(), sponsors: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/cinematic-partners-query", () => ({ fetchCinematicPartners: mocks.partners }));
vi.mock("@/lib/queries", () => ({ fetchSiteSponsorLogos: mocks.sponsors }));
vi.mock("@/components/cinematic/CinematicDestination", () => ({ default: ({ labelId }: { labelId: string }) => createElement("p", null, `Destination ${labelId}`) }));
vi.mock("@/app/(public)/sponsors/page", () => ({ default: () => createElement("p", null, "Existing sponsors page") }));
vi.mock("@/components/AcademySponsorsPage", () => ({ default: () => createElement("p", null, "Academy sponsors page") }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
import SponsorsRoute from "@/app/%5Fclubs/[slug]/sponsors/page";
import PartnershipRoute from "@/app/%5Fclubs/[slug]/community/partnership/page";

const FOOTHILL = "11111111-1111-4111-8111-111111111111";
const TPA = "22222222-2222-4222-8222-222222222222";
function content(): CinematicPartnersContent {
  const value = starterCinematicPartnersContent();
  value.pages.partners.intro = "We are proud to collaborate with amazing partners.";
  value.pages.opportunities.intro = "RCFC has several partnership opportunities.";
  value.partners = [
    { id: "a1a1a1a1-0000-4000-8000-000000000001", name: "Foothill Transit", role: "Main partner & front of jersey sponsor", logoAssetId: FOOTHILL, tone: "original" },
    { id: "a1a1a1a1-0000-4000-8000-000000000002", name: "The Packshot Agency", role: "Official marketing partner", logoAssetId: TPA, tone: "grey" },
    { id: "a1a1a1a1-0000-4000-8000-000000000003", name: "MVMNT CULTR", role: "Official sports recovery partner", logoAssetId: null, tone: "original" },
  ];
  return value;
}
const logoUrls = { [FOOTHILL]: "https://media.example/foothill.webp", [TPA]: "https://media.example/tpa.webp" };
const render = (page: "partners" | "opportunities", value = content()) =>
  renderToStaticMarkup(createElement(CinematicPartners, { page, content: value, logoUrls }));

describe("cinematic Partners public pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schema.mockReturnValue(mocks.trusted);
    mocks.partners.mockResolvedValue({ content: content(), logoUrls });
  });

  it("renders Club Partners in the owner's order with roles and logos", () => {
    const html = render("partners");
    expect(html).toContain("<h1");
    expect(html).toContain("Club Partners");
    expect(html).toContain("Fueled by our amazing partners");
    expect(html).toContain("We are proud to collaborate with amazing partners.");
    expect(html.indexOf("Foothill Transit")).toBeLessThan(html.indexOf("The Packshot Agency"));
    expect(html.indexOf("The Packshot Agency")).toBeLessThan(html.indexOf("MVMNT CULTR"));
    expect(html).toContain('src="https://media.example/foothill.webp"');
    expect(html).toContain('alt="Foothill Transit"');
    expect(html).toContain("Main partner &amp; front of jersey sponsor");
  });

  it("darkens a white logo by its saved tone", () => {
    const html = render("partners");
    expect(html).toMatch(/class="partner-card partner-tone-grey"[^]*?tpa\.webp/);
    expect(html).toMatch(/partner-tone-original[^]*?foothill\.webp/);
  });

  it("labels a partner whose logo is still missing", () => {
    const html = render("partners");
    expect(html).toContain("MVMNT CULTR");
    expect(html).toContain("Original logo pending");
    expect((html.match(/<img /g) ?? []).length).toBe(2);
  });

  it("links the Club Partners button to Partnership Opportunities", () => {
    const html = render("partners");
    expect(html).toContain("Interested in becoming a sponsor or partner?");
    expect(html).toContain('href="/community/partnership"');
  });

  it("shows the Partnership Opportunities copy and hides its button until a link is saved", () => {
    const html = render("opportunities");
    expect(html).toContain("Partnership Opportunities");
    expect(html).toContain("RCFC has several partnership opportunities.");
    expect(html).not.toContain("<a ");
    const linked = content();
    linked.pages.opportunities.ctaHref = "mailto:partners@example.com";
    expect(render("opportunities", linked)).toContain('href="mailto:partners@example.com"');
  });

  it("omits an empty intro and an empty partner list", () => {
    const value = starterCinematicPartnersContent();
    const html = render("partners", value);
    expect(html).not.toContain("partner-intro");
    expect(html).not.toContain("partner-grid");
  });

  it("serves the cinematic@2 /sponsors page from the trusted tenant's partners", async () => {
    mocks.club.mockResolvedValue({ id: "rose-city-id", name: "Rose City FC", presentationTemplateKey: "cinematic@2" });
    const html = renderToStaticMarkup(await SponsorsRoute({ params: Promise.resolve({ slug: "rose-city" }) }));
    expect(html).toContain("Club Partners");
    expect(html).toContain("Foothill Transit");
    expect(mocks.partners).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
  });

  it("keeps the existing /sponsors page for an unseeded cinematic@2 club and other designs", async () => {
    mocks.partners.mockResolvedValue(null);
    mocks.club.mockResolvedValue({ id: "empty-id", name: "Empty", presentationTemplateKey: "cinematic@2" });
    expect(renderToStaticMarkup(await SponsorsRoute({ params: Promise.resolve({ slug: "empty" }) }))).toContain("Existing sponsors page");
    mocks.club.mockResolvedValue({ id: "club-id", name: "Clubhouse", presentationTemplateKey: "clubhouse@1" });
    expect(renderToStaticMarkup(await SponsorsRoute({ params: Promise.resolve({ slug: "clubhouse" }) }))).toContain("Existing sponsors page");
    mocks.sponsors.mockResolvedValue([]);
    mocks.club.mockResolvedValue({ id: "academy-id", name: "Academy", presentationTemplateKey: "academy@1" });
    expect(renderToStaticMarkup(await SponsorsRoute({ params: Promise.resolve({ slug: "academy" }) }))).toContain("Academy sponsors page");
    expect(mocks.partners).toHaveBeenCalledTimes(1);
  });

  it("serves /community/partnership for cinematic@2 only", async () => {
    mocks.club.mockResolvedValue({ id: "rose-city-id", name: "Rose City FC", presentationTemplateKey: "cinematic@2" });
    expect(renderToStaticMarkup(await PartnershipRoute({ params: Promise.resolve({ slug: "rose-city" }) }))).toContain("Partnership Opportunities");
    mocks.partners.mockResolvedValue(null);
    expect(renderToStaticMarkup(await PartnershipRoute({ params: Promise.resolve({ slug: "rose-city" }) }))).toContain("Destination partnership");
    mocks.club.mockResolvedValue({ id: "academy-id", name: "Academy", presentationTemplateKey: "academy@1" });
    await expect(PartnershipRoute({ params: Promise.resolve({ slug: "academy" }) })).rejects.toThrow("not found");
  });
});
