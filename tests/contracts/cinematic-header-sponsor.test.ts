import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

const fixture = vi.hoisted(() => ({ slug: "rose-city", content: null as ReturnType<typeof defaultCinematicHomepageContent> | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/_clubs/rose-city/schedule" }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ slug: fixture.slug, name: "Test club", storeEnabled: true }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/test-crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: fixture.content }) }));
import CinematicNav from "@/components/cinematic/CinematicNav";

beforeEach(() => { fixture.slug = "rose-city"; fixture.content = defaultCinematicHomepageContent(); });
const render = () => renderToStaticMarkup(createElement(CinematicNav, {}));
const setPartner = (url: string | null, alt: string) => { fixture.content!.presentation.headerPartner = { assetId: url ? "00000000-0000-4000-8000-000000000002" : null, url, alt }; };

describe("header sponsor logo in the public header", () => {
  it("shows the owner's logo in the header and the phone menu, with the description they typed", () => {
    setPartner("https://cdn.example.test/sponsor.png", "Valley Credit Union");
    const html = render();
    expect(html).toMatch(/<div class="header-partner"[^>]*><img[^>]*src="https:\/\/cdn.example.test\/sponsor.png"[^>]*alt="Valley Credit Union"/);
    expect(html).toMatch(/<img class="phone-partner"[^>]*src="https:\/\/cdn.example.test\/sponsor.png"/);
    expect((html.match(/src="https:\/\/cdn.example.test\/sponsor.png"/g) ?? []).length).toBe(2);
  });

  it("renders nothing for the sponsor, no empty wrapper and no link, once the logo is removed", () => {
    setPartner("https://cdn.example.test/sponsor.png", "Valley Credit Union");
    expect(render()).toContain("header-partner");
    setPartner(null, "");
    const html = render();
    expect(html).not.toContain("header-partner");
    expect(html).not.toContain("phone-partner");
    expect(html).not.toContain("<img alt=");
    // The crest link and the menu stay.
    expect(html).toContain('class="crest-link"');
    expect(html).toContain('class="menu-toggle"');
  });

  it("renders nothing when only a description is left behind with no image", () => {
    setPartner(null, "Valley Credit Union");
    const html = render();
    expect(html).not.toContain("header-partner");
    expect(html).not.toContain("Valley Credit Union");
  });

  it("keeps the Foothill Transit pairing: only that exact description, only for Rose City, shows the supplied mark", () => {
    setPartner("https://cdn.example.test/foothill-upload.png", "foothill transit");
    expect((render().match(/src="\/images\/cinematic\/foothill-going-good-places.png"/g) ?? []).length).toBe(2);
    setPartner("https://cdn.example.test/foothill-upload.png", "Foothill Transit partner");
    expect(render()).not.toContain("foothill-going-good-places.png");
    expect(render()).toContain("foothill-upload.png");
    fixture.slug = "another-club";
    setPartner("https://cdn.example.test/foothill-upload.png", "Foothill Transit");
    expect(render()).not.toContain("foothill-going-good-places.png");
  });

  it("shows no Foothill mark once the logo is removed, even though the description was Foothill Transit", () => {
    setPartner(null, "Foothill Transit");
    const html = render();
    expect(html).not.toContain("foothill-going-good-places.png");
    expect(html).not.toContain("header-partner");
  });
});
