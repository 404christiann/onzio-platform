import { describe, expect, it } from "vitest";
import { cinematicShopContentSchema, EMPTY_CINEMATIC_SHOP_CONTENT, MAX_SHOP_EDITIONS, SHOP_EDITION_VARIANTS, shopContentOnly } from "@/lib/cinematic-shop-content";

const assetId = "97a51639-b15d-4ac4-8097-12aaac91ec09";
// Shop settings saved before RC2027-SHOP-UPDATE carry only these keys.
const stored = {
  mapAssetId: null, mapAlt: "", mapVisible: true, mapCrop: null, sponsorsHeading: "Powered by our partners", sponsorsVisible: true,
  homeLabel: "Home", awayLabel: "Away", galleryLabel: "Kit photos", emptyMessage: "Soon", leadScale: 80, leadTop: 5,
};
const sam = {
  ...stored,
  editions: [
    { label: "Authentic jersey", price: "$115", line: "City of the Roses Authentic RCFC Jersey", link: "https://www.nikys-sports.com/authentic" },
    { label: "Replica jersey", price: "$95", line: "City of the Roses Replica RCFC Jersey", link: "" },
  ],
  detailsHeading: "Jersey details",
  details: [{ assetId: null, alt: "", title: "Player edition", body: "Our Authentic jersey is the same jersey worn by the first team." }],
  cardIcons: ["video", "jersey", "shipping-box", "no-access"],
  attributes: ["Color: Rose Parade Red", "100% Polyester"],
  sizeChart: { heading: "Size chart", columns: ["S", "M"], rows: [{ label: "Chest (in)", values: ["35 - 37.5", "37.5 - 41"] }], note: "In inches" },
  mapHeading: "Map view",
};

describe("RC2027 Shop update content rules", () => {
  it("loads settings saved before the update with every new section empty", () => {
    const parsed = cinematicShopContentSchema.parse(stored);
    expect(parsed).toMatchObject({ editions: [], detailsHeading: "", details: [], cardIcons: [], attributes: [], mapHeading: "" });
    // The jersey-options heading stays absent rather than defaulting, so it is never sent unless used.
    expect(parsed).not.toHaveProperty("editionsHeading");
    expect(parsed.sizeChart).toEqual({ heading: "", columns: [], rows: [], note: "" });
    expect(cinematicShopContentSchema.parse(EMPTY_CINEMATIC_SHOP_CONTENT)).toEqual(EMPTY_CINEMATIC_SHOP_CONTENT);
  });

  it("accepts Sam's prices, detail tiles, card icons, care line and size chart", () => {
    const parsed = cinematicShopContentSchema.parse({ ...sam, details: [{ ...sam.details[0], assetId }] });
    expect(parsed.editions.map(edition => edition.price)).toEqual(["$115", "$95"]);
    expect(parsed.details[0]).toEqual({ assetId, alt: "", title: "Player edition", body: sam.details[0].body });
    expect(parsed.sizeChart.rows[0].values).toEqual(["35 - 37.5", "37.5 - 41"]);
  });

  it("rejects values the page cannot show safely", () => {
    const edition = sam.editions[0], detail = sam.details[0];
    for (const change of [
      { editions: [edition, edition, edition, edition] },
      { editionsHeading: "x".repeat(81) },
      { editionsHeading: 3 },
      { editions: [{ ...edition, link: "javascript:alert(1)" }] },
      { editions: [{ ...edition, price: "x".repeat(41) }] },
      { details: Array.from({ length: 7 }, () => detail) },
      { details: [{ ...detail, title: "x".repeat(81) }] },
      { details: [{ ...detail, assetId: "not-a-photo-id" }] },
      { details: [{ ...detail, url: "https://foreign.example/photo.png" }] },
      { cardIcons: ["heart"] },
      { cardIcons: ["video", "jersey", "shipping-box", "no-access", "video"] },
      { attributes: Array.from({ length: 9 }, () => "Machine wash cold") },
      { sizeChart: { ...sam.sizeChart, rows: [{ label: "Chest (in)", values: ["35 - 37.5"] }] } },
      { sizeChart: { ...sam.sizeChart, columns: Array.from({ length: 9 }, () => "S") } },
    ]) expect(cinematicShopContentSchema.safeParse({ ...sam, ...change }).success, JSON.stringify(change).slice(0, 80)).toBe(false);
  });

  it("accepts three jersey options, one per kit, and an optional heading over them", () => {
    const foothill = { label: "Foothill Transit Edition jersey", price: "$115", line: "Foothill Transit Edition RCFC Jersey", link: "" };
    const parsed = cinematicShopContentSchema.parse({ ...sam, editions: [...sam.editions, foothill] });
    expect(parsed.editions).toHaveLength(MAX_SHOP_EDITIONS);
    expect(MAX_SHOP_EDITIONS).toBe(3);
    expect(SHOP_EDITION_VARIANTS).toEqual(["home", "away", "third"]);
    expect(parsed.editionsHeading).toBeUndefined();
    expect(cinematicShopContentSchema.parse({ ...sam, editionsHeading: "x".repeat(80) }).editionsHeading).toHaveLength(80);
    expect(cinematicShopContentSchema.parse({ ...sam, editionsHeading: "" }).editionsHeading).toBe("");
    expect(EMPTY_CINEMATIC_SHOP_CONTENT).not.toHaveProperty("editionsHeading");
    expect(shopContentOnly({ ...parsed, editionsHeading: "Pick a kit" }).editionsHeading).toBe("Pick a kit");
    // A blank heading is left out of the saved settings.
    for (const blank of ["", "   ", undefined]) expect(shopContentOnly({ ...parsed, editionsHeading: blank })).not.toHaveProperty("editionsHeading");
  });

  it("never saves photo addresses resolved for display", () => {
    const content = shopContentOnly({ ...cinematicShopContentSchema.parse(sam), details: [{ ...sam.details[0], url: "https://spoof.example/a.png", width: 10, height: 10 }], mapUrl: "https://spoof.example/map.png" });
    expect(content.details[0]).toEqual(sam.details[0]);
    expect(content).not.toHaveProperty("mapUrl");
    expect(cinematicShopContentSchema.safeParse(content).success).toBe(true);
  });
});
