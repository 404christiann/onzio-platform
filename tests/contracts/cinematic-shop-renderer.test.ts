import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicShop, { type CinematicShopProps } from "@/components/cinematic/CinematicShop";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { publicKit } from "@/lib/shop-editor/model";

function props(): CinematicShopProps {
  const section = { eyebrow: "New kit", title: "Custom home title", description: "Written by the club", bullet_points: ["Custom bullet"], store_note: "My store", cta_label: "Order kit", cta_link: "https://example.com/kit" };
  const home = publicKit(section, [{ rowId: "home", assetId: null, url: "/lead.png", order: 0 }], "shop", "home");
  const away = publicKit({ ...section, title: "Custom away title" }, [{ rowId: "away", assetId: null, url: "/away.png", order: 0 }], "shop", "away");
  return { kits: { home, away, third: { section: null, photos: [] } }, photoRows: { home: [], away: [], third: [] }, purchase: { id: 1, heading: "My details", cards: [{ label: "My label", title: "My card", body: "My information" }], cta_eyebrow: "My footer", cta_text: "My closing text", cta_label: "Order here", cta_link: "https://example.com/footer", updated_at: "" }, presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, homeLabel: "Local", awayLabel: "Travel", mapVisible: true, mapAssetId: "97a51639-b15d-4ac4-8097-12aaac91ec09", mapUrl: "/map.png", mapAlt: "Our shop directions", mapWidth: 1200, mapHeight: 800 }, sponsors: [], treatments: {} };
}
describe("editable cinematic Shop public parity", () => {
  it("renders authored kit, detail cards, both buttons, map and tab labels", () => {
    const html = renderToStaticMarkup(createElement(CinematicShop, props()));
    for (const text of ["Custom home title", "Written by the club", "Custom bullet", "My store", "My details", "My card", "My footer", "Order kit", "Order here", "Local", "Travel", "Our shop directions"]) expect(html).toContain(text);
    expect(html).toContain('data-shop-editor-target="purchase"');
    expect(html).not.toContain("CITY OF ROSES");
  });
  it("renders the selected Away sources and hides map/sponsors when requested", () => {
    const value = props(); value.selectedVariant = "away"; value.presentation.mapVisible = false;
    const html = renderToStaticMarkup(createElement(CinematicShop, value));
    expect(html).toContain("Custom away title");
    expect(html).toContain('src="/away.png"');
    expect(html).not.toContain('src="/map.png"');
    expect(html).not.toContain("Custom home title");
  });
  it("keeps intentionally removed purchase content empty, with an authoring target only in admin", () => {
    const value = props(); value.purchase = { id: 1, heading: "", cards: [], cta_eyebrow: "", cta_text: "", cta_label: "", cta_link: "", updated_at: "" };
    expect(renderToStaticMarkup(createElement(CinematicShop, value))).not.toContain('class="shop-details"');
    expect(renderToStaticMarkup(createElement(CinematicShop, { ...value, editing: true }))).toContain("Add jersey details");
  });
  it("renders the club's empty message and cannot activate a script purchase URL", () => {
    const value = props(); value.kits.home.section = null; value.kits.away.section = null; value.presentation.emptyMessage = "Our shop opens soon";
    expect(renderToStaticMarkup(createElement(CinematicShop, value))).toContain("Our shop opens soon");
    const configured = props(); configured.kits.home.section!.cta_link = "javascript:alert(1)";
    expect(renderToStaticMarkup(createElement(CinematicShop, configured))).not.toContain('href="javascript:');
  });
});
