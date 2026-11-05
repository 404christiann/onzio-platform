import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicShop, { type CinematicShopProps } from "@/components/cinematic/CinematicShop";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { publicKit } from "@/lib/shop-editor/model";

function props(): CinematicShopProps {
  const section = { eyebrow: "Rose City FC match home 2027", title: "City of the Roses", description: "Represent Pasadena", bullet_points: ["Any name & number", "League patch"], store_note: "", cta_label: "Buy now", cta_link: "https://example.com/kit" };
  const home = publicKit(section, [{ rowId: "home", assetId: null, url: "/lead.png", order: 0 }], "shop", "home");
  const away = publicKit({ ...section, title: "Thorn Edition" }, [{ rowId: "away", assetId: null, url: "/away.png", order: 0 }], "shop", "away");
  return {
    kits: { home, away, third: { section: null, photos: [] } }, photoRows: { home: [], away: [], third: [] },
    purchase: { id: 1, heading: "Jersey information", cards: [
      { label: "BTS video", title: "Watch it come to life", body: "Select the option at checkout." },
      { label: "Purchase in store", title: "Niky’s Sports Pasadena", body: "Customize in store." },
      { label: "Shipping with care", title: "Front door delivery", body: "Shipping at checkout." },
    ], cta_eyebrow: "RCFC thanks you", cta_text: "You help fund the team.", cta_label: "Buy now", cta_link: "https://example.com/footer", updated_at: "" },
    presentation: {
      ...EMPTY_CINEMATIC_SHOP_CONTENT, mapVisible: true, mapUrl: "/route-map.jpg", mapAlt: "Route map", mapHeading: "Map view",
      editions: [
        { label: "Authentic jersey", price: "$115", line: "City of the Roses Authentic RCFC Jersey", link: "" },
        { label: "Replica jersey", price: "$95", line: "City of the Roses Replica RCFC Jersey", link: "https://example.com/replica" },
      ],
      detailsHeading: "Jersey details",
      details: [
        { assetId: null, alt: "", title: "Player edition", body: "Same jersey the first team wears." },
        { assetId: "97a51639-b15d-4ac4-8097-12aaac91ec09", alt: "Crest close-up", title: "3D silicon & satin crest", body: "Premium crest.", url: "/crest.webp" },
      ],
      cardIcons: ["video", "jersey", ""],
      attributes: ["Color: Rose Parade Red", "100% Polyester"],
      sizeChart: { heading: "Size chart", columns: ["S", "M"], rows: [{ label: "Chest (in)", values: ["35 - 37.5", "37.5 - 41"] }], note: "In inches" },
    },
    sponsors: [], treatments: {},
  };
}
const render = (value: CinematicShopProps) => renderToStaticMarkup(createElement(CinematicShop, value));

describe("RC2027 Shop update public page", () => {
  it("shows Authentic and Replica prices in place of Home/Away, with the selected edition's line and Buy link", () => {
    const html = render(props());
    expect(html).toContain("Authentic jersey $115");
    expect(html).toContain("Replica jersey $95");
    expect(html).toContain("City of the Roses Authentic RCFC Jersey");
    expect(html).not.toContain("City of the Roses Replica RCFC Jersey");
    expect(html).not.toContain(">Away<");
    // The Authentic edition has no link of its own, so Buy now keeps the kit's link.
    expect(html).toContain('href="https://example.com/kit"');
    expect(html.indexOf("City of the Roses</h1>")).toBeLessThan(html.indexOf("Rose City FC match home 2027"));
    expect(html).toContain(">Includes<");
  });

  it("keeps Home/Away for an editor, and for a Shop with no prices yet", () => {
    expect(render({ ...props(), editing: true })).toContain(">Away<");
    const plain = props(); plain.presentation.editions = [];
    const html = render(plain);
    expect(html).toContain(">Away<");
    expect(html).not.toContain("$115");
  });

  it("shows Jersey Details tiles, with a white box until a photo is added", () => {
    const html = render(props());
    for (const text of ["Jersey details", "Player edition", "Same jersey the first team wears.", "3D silicon &amp; satin crest"]) expect(html).toContain(text);
    expect(html).toContain('aria-label="Player edition photo coming soon"');
    expect(html).toContain('src="/crest.webp"');
    expect(html).toContain('alt="Crest close-up"');
  });

  it("shows Sam's card icons, the care line, the size chart and the Map view heading", () => {
    const html = render(props());
    expect(html).toContain('class="shop-info-icon video"');
    expect(html).toContain('src="/rose-city/icons/jersey.png"');
    expect(html.match(/shop-info-icon/g)).toHaveLength(2);
    for (const text of ["Color: Rose Parade Red", "100% Polyester", "Size chart", "Chest (in)", "37.5 - 41", "In inches", "Map view"]) expect(html).toContain(text);
    expect(html).toContain('src="/route-map.jpg"');
  });

  it("hides new sections the owner has left empty, and offers them to the editor", () => {
    const empty = props();
    empty.presentation = { ...empty.presentation, detailsHeading: "", details: [], attributes: [], sizeChart: { heading: "", columns: [], rows: [], note: "" }, mapHeading: "" };
    const html = render(empty);
    expect(html).not.toContain("shop-jersey-details");
    expect(html).not.toContain("shop-attributes");
    expect(html).not.toContain("shop-size");
    const editing = render({ ...empty, editing: true });
    expect(editing).toContain('data-shop-editor-target="details"');
    expect(editing).toContain('data-shop-editor-target="sizeChart"');
  });
});
