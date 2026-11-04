import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";

const fixture: { content: CinematicHomepageContent } = { content: defaultCinematicHomepageContent() };
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club", name: "Rose City FC", storeEnabled: true }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png", footerTagline: "Pasadena, California" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: fixture.content }) }));
vi.mock("@/lib/queries", () => ({ fetchSiteSocialLinks: () => Promise.resolve([]) }));
const { default: CinematicFooter } = await import("@/components/cinematic/CinematicFooter");
const render = () => renderToStaticMarkup(createElement(CinematicFooter));

beforeEach(() => { fixture.content = defaultCinematicHomepageContent(); });
describe("cinematic@2 footer brand", () => {
  it("keeps the club crest, name and tagline while no footer logo is set", () => {
    const html = render();
    expect(html).toContain('src="/crest.png"');
    expect(html).toContain("<strong>Rose City FC</strong>");
    expect(html).toContain("Pasadena, California");
  });
  it("shows only the owner's footer logo, with its description, once one is set", () => {
    fixture.content.footerLogo = { assetId: "asset", url: "https://cdn.test/rcfc.webp", alt: "RCFC" };
    const html = render();
    expect(html).toContain('src="https://cdn.test/rcfc.webp"');
    expect(html).toContain('alt="RCFC"');
    expect(html).not.toContain('src="/crest.png"');
    expect(html).not.toContain("<strong>Rose City FC</strong>");
  });
  it("names the logo link for screen readers when the owner left no description", () => {
    fixture.content.footerLogo = { assetId: "asset", url: "https://cdn.test/rcfc.webp", alt: "" };
    expect(render()).toContain('alt="Rose City FC"');
  });
});
