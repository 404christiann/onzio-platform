import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicShop, { type CinematicShopProps } from "@/components/cinematic/CinematicShop";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { publicKit } from "@/lib/shop-editor/model";

function props(): CinematicShopProps {
  const section = { eyebrow: "Rose City FC match home 2027", title: "City of the Roses", description: "Represent Pasadena", bullet_points: ["Any name & number", "League patch"], store_note: "", cta_label: "Buy now", cta_link: "https://example.com/kit" };
  const home = publicKit(section, [{ rowId: "home", assetId: null, url: "/lead.png", order: 0 }], "shop", "home");
  const away = publicKit({ ...section, eyebrow: "Rose City FC match away 2027", title: "Thorn Edition", description: "Away from home", cta_link: "https://example.com/away-kit" }, [{ rowId: "away", assetId: null, url: "/away.png", order: 0 }], "shop", "away");
  const third = publicKit({ ...section, eyebrow: "Foothill Transit 2027", title: "Going Good Places", description: "Foothill Transit Edition", bullet_points: ["Foothill crest"], cta_link: "https://example.com/third-kit" }, [{ rowId: "third", assetId: null, url: "/third.png", order: 0 }], "shop", "third");
  const row = (variant: "home" | "away" | "third") => [{ id: `row-${variant}`, kit_variant: variant, url: `/row-${variant}.png`, sort_order: 0, created_at: "" }];
  return {
    kits: { home, away, third }, photoRows: { home: row("home"), away: row("away"), third: row("third") },
    purchase: { id: 1, heading: "Jersey information", cards: [
      { label: "BTS video", title: "Watch it come to life", body: "Select the option at checkout." },
      { label: "Purchase in store", title: "Niky’s Sports Pasadena", body: "Customize in store." },
      { label: "Shipping with care", title: "Front door delivery", body: "Shipping at checkout." },
    ], cta_eyebrow: "RCFC thanks you", cta_text: "You help fund the team.", cta_label: "Buy now", cta_link: "https://example.com/footer", updated_at: "" },
    presentation: {
      ...EMPTY_CINEMATIC_SHOP_CONTENT, mapVisible: true, mapUrl: "/route-map.jpg", mapAlt: "Route map", mapHeading: "Map view",
      editions: [
        { label: "Home jersey", price: "$115", line: "City of the Roses Authentic RCFC Jersey", link: "" },
        { label: "Away jersey", price: "$115", line: "Thorn Edition Authentic RCFC Jersey", link: "https://example.com/away-option" },
        { label: "Foothill Transit Edition jersey", price: "$115", line: "Foothill Transit Edition RCFC Jersey", link: "" },
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
  it("shows Select your jersey over three option pills in kit order, with the Home kit and its line first", () => {
    const html = render(props());
    expect(html).toContain('<h2 class="shop-options-heading">Select your jersey</h2>');
    expect(html).toContain('role="group" aria-label="Jersey selection"');
    const pills = [...html.matchAll(/<button type="button" class="(shop-option shop-option-\d)" aria-pressed="(true|false)">([^<]*)<\/button>/g)].map(match => [match[1], match[2], match[3]]);
    expect(pills).toEqual([
      ["shop-option shop-option-1", "true", "Home jersey $115"],
      ["shop-option shop-option-2", "false", "Away jersey $115"],
      ["shop-option shop-option-3", "false", "Foothill Transit Edition jersey $115"],
    ]);
    expect(html).toContain("City of the Roses</h1>");
    expect(html).toContain('aria-live="polite">City of the Roses Authentic RCFC Jersey</p>');
    expect(html).not.toContain("Thorn Edition Authentic RCFC Jersey");
    // The Home option has no link of its own, so Buy now keeps the Home kit's link.
    expect(html).toContain('href="https://example.com/kit"');
    expect(html).toContain('src="/row-home.png"');
    expect(html).not.toContain('class="shop-variants"');
    expect(html.indexOf("City of the Roses</h1>")).toBeLessThan(html.indexOf("Rose City FC match home 2027"));
    expect(html.indexOf("shop-rule")).toBeLessThan(html.indexOf("Select your jersey"));
    expect(html.indexOf("Select your jersey")).toBeLessThan(html.indexOf("Represent Pasadena"));
    expect(html).toContain(">Includes<");
  });

  it("uses the owner's heading over the pills", () => {
    const value = props(); value.presentation.editionsHeading = "Pick your kit";
    const html = render(value);
    expect(html).toContain('<h2 class="shop-options-heading">Pick your kit</h2>');
    expect(html).not.toContain("Select your jersey");
  });

  it("switches the whole kit, the line and the Buy link when the second or third option is chosen", () => {
    // A pill click calls choose(option.variant); the chosen kit then drives every section, as here.
    const away = render({ ...props(), selectedVariant: "away" });
    expect(away).toMatch(/class="shop-option shop-option-2" aria-pressed="true"/);
    expect(away).toMatch(/class="shop-option shop-option-1" aria-pressed="false"/);
    for (const text of ["Thorn Edition</h1>", "Rose City FC match away 2027", "Away from home", "Thorn Edition Authentic RCFC Jersey", 'src="/away.png"', 'src="/row-away.png"', 'href="https://example.com/away-option"']) expect(away).toContain(text);
    expect(away).not.toContain("City of the Roses Authentic RCFC Jersey");
    expect(away).not.toContain('src="/row-home.png"');
    const third = render({ ...props(), selectedVariant: "third" });
    expect(third).toMatch(/class="shop-option shop-option-3" aria-pressed="true"/);
    // The Foothill option has no link of its own, so Buy now uses the Third kit's link.
    for (const text of ["Going Good Places</h1>", "Foothill Transit 2027", "Foothill Transit Edition</p>", "Foothill crest", "Foothill Transit Edition RCFC Jersey", 'src="/third.png"', 'src="/row-third.png"', 'href="https://example.com/third-kit"']) expect(third).toContain(text);
    expect(third).not.toContain("Thorn Edition</h1>");
    const source = readFileSync(resolve(process.cwd(), "components/cinematic/CinematicShop.tsx"), "utf8");
    expect(source).toContain("onClick={() => choose(item.variant)}");
    expect(source).toContain("const choose = (value: ShopKitVariant) => { setChosen(value); onVariantChange?.(value); };");
  });

  it("hides an option publicly until its kit exists, and starts on the first option shown", () => {
    const noThird = props(); noThird.kits.third = { section: null, photos: [] };
    const html = render(noThird);
    expect(html).toContain("shop-option-2");
    expect(html).not.toContain("shop-option-3");
    expect(html).not.toContain("Foothill Transit Edition jersey $115");
    const noHome = props(); noHome.kits.home = { section: null, photos: [] };
    const awayFirst = render(noHome);
    expect(awayFirst).not.toContain("shop-option-1");
    expect(awayFirst).toMatch(/class="shop-option shop-option-2" aria-pressed="true"/);
    expect(awayFirst).toContain("Thorn Edition</h1>");
    expect(awayFirst).toContain('href="https://example.com/away-option"');
    // Editors see every option so each kit stays reachable.
    expect(render({ ...noThird, editing: true })).toContain("shop-option-3");
  });

  it("shows the editor's selected kit, including the Third kit, and selects a kit tab from an option", () => {
    const html = render({ ...props(), editing: true, selectedVariant: "third" });
    expect(html).toContain("Going Good Places</h1>");
    expect(html).toMatch(/class="shop-option shop-option-3" aria-pressed="true"/);
    expect(html).toContain('src="/row-third.png"');
  });

  it("skips a blank option publicly but keeps it reachable for editors", () => {
    const value = props(); value.presentation.editions[1] = { label: " ", price: "", line: "Thorn Edition Authentic RCFC Jersey", link: "" };
    const html = render(value);
    expect(html).not.toContain("shop-option-2");
    expect(html).toContain("shop-option-1");
    expect(html).toContain("shop-option-3");
    expect(html).not.toMatch(/class="shop-option[^"]*" aria-pressed="(true|false)"><\/button>/);
    const editing = render({ ...value, editing: true, selectedVariant: "away" });
    expect(editing).toMatch(/class="shop-option shop-option-2" aria-pressed="true">Add a label<\/button>/);
    // A price alone is enough to show the option.
    value.presentation.editions[1] = { label: "", price: "$115", line: "", link: "" };
    expect(render(value)).toMatch(/class="shop-option shop-option-2" aria-pressed="false">\$115<\/button>/);
  });

  it("keeps a long label inside its pill, and lays the desktop pills flush with the copy column", () => {
    const css = readFileSync(resolve(process.cwd(), "components/cinematic/shop.css"), "utf8").replace(/\r\n/g, "\n");
    const pill = css.match(/\.cinematic-site \.shop-option\{[^}]*\}/)![0];
    for (const rule of ["flex:0 0 auto", "max-width:100%", "white-space:normal"]) expect(pill).toContain(rule);
    expect(css.slice(css.indexOf("Rose City jersey options"))).not.toContain("nowrap");
    const desktop = css.slice(css.indexOf("@media(min-width:1025px){\n .cinematic-site .shop-update .shop-feature"));
    expect(desktop).toContain(".shop-update .shop-jersey-options{width:fit-content;max-width:100%;margin:0}");
    expect(desktop).toContain(".shop-update .shop-options{justify-content:flex-start;");
    expect(desktop).toContain(".shop-update .shop-copy h1{font-size:min(5.15vw,99px)");
  });

  it("keeps Home/Away for a Shop with no jersey options yet", () => {
    const plain = props(); plain.presentation.editions = [];
    const html = render(plain);
    expect(html).toContain('aria-label="Kit selection"');
    expect(html).toContain(">Away<");
    expect(html).not.toContain("$115");
    expect(html).not.toContain("Select your jersey");
    expect(html).not.toContain("Going Good Places");
    const editing = render({ ...plain, editing: true });
    expect(editing).toContain(">Away<");
    expect(editing).toContain("Add jersey options");
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
