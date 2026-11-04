import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DBClubLogoPageContent } from "@/lib/db-types";
import { EMPTY_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ name: "Synthetic Club", presentationTemplateKey: "cinematic@2" }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ fallbackVariant: _fallbackVariant, ...props }: Record<string, unknown>) => createElement("img", props) }));
import CinematicCrest from "@/components/cinematic/CinematicCrest";

describe("cinematic@2 Crest editor/public parity", () => {
  const content: DBClubLogoPageContent = { ...EMPTY_CLUB_LOGO_PAGE_CONTENT,
    annotated_image_url: "/images/diagram.png", map_image_url: "/images/map.png",
    features: Array.from({ length: 6 }, (_, i) => ({ title: `Custom feature ${i}`, description: `Edited meaning ${i}`, patch_url: `/images/patch-${i}.png`, icon_url: `/images/icon-${i}.png`, icon_size: 68, icon_scale: 1 })),
    color_cards: [{ label: "Custom blue", image_url: "/images/blue.png" }],
  };
  it("renders tenant-authored copy/media and stable indexed editor targets", () => {
    const html = renderToStaticMarkup(createElement(CinematicCrest, { content }));
    for (let i = 0; i < 6; i++) {
      expect(html).toContain(`Custom feature ${i}`); expect(html).toContain(`Edited meaning ${i}`);
      expect(html).toContain(`data-about-editor-section="features" data-about-editor-index="${i}"`);
      expect(html).toContain(`src="/images/icon-${i}.png"`);
    }
    expect(html).toContain('alt="Custom blue official brand color"');
    expect(html).toContain('data-about-editor-index="1" class="identity-map"');
    expect(html).not.toContain("Pasadena"); expect(html).not.toContain("Rose City");
    expect(html).not.toContain("/_next/image"); expect(html).not.toContain("render/image");
  });
  it("uses the same populated markup in admin without duplicate chrome", () => {
    expect(renderToStaticMarkup(createElement(CinematicCrest, { content, editorEmptySections: true })))
      .toBe(renderToStaticMarkup(createElement(CinematicCrest, { content })));
  });
  it("keeps empty tenant data empty and exposes first authoring targets only in admin", () => {
    const publicHtml = renderToStaticMarkup(createElement(CinematicCrest, { content: EMPTY_CLUB_LOGO_PAGE_CONTENT }));
    expect(publicHtml).not.toContain("Add the first crest feature"); expect(publicHtml).not.toContain("identity-place");
    expect(publicHtml).not.toContain('class="crest-diagram"');
    const colorsOnly = renderToStaticMarkup(createElement(CinematicCrest, { content: { ...EMPTY_CLUB_LOGO_PAGE_CONTENT, color_cards: content.color_cards } }));
    expect(colorsOnly).toContain("Custom blue"); expect(colorsOnly).not.toContain('class="identity-map"');
    const editorHtml = renderToStaticMarkup(createElement(CinematicCrest, { content: EMPTY_CLUB_LOGO_PAGE_CONTENT, editorEmptySections: true }));
    expect(editorHtml).toContain("Add the first crest feature"); expect(editorHtml).toContain("Add the first color card");
    expect(editorHtml).toContain('data-about-editor-section="images" data-about-editor-index="0"');
  });
});
