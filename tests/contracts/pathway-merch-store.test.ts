import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const readBytes = (path: string) =>
  readFileSync(resolve(process.cwd(), path));

const MERCH_ASSETS = [
  "public/images/pathway/match-black-33c55d27.webp",
  "public/images/pathway/match-orange-38e98dfc.webp",
  "public/images/pathway/training-black-f7b23c23.webp",
  "public/images/pathway/training-orange-6159ef5a.webp",
] as const;

const DIAZA_ASSET = "public/images/pathway/diaza-mentality-b219504f.png";

describe("pathway merch store", () => {
  it("replaces the generic price-card route with the dedicated collection", () => {
    const route = read("app/%5Fclubs/[slug]/merch/page.tsx");

    expect(route).toContain(
      'import PathwayMerchStore from "@/components/pathway/PathwayMerchStore";',
    );
    expect(route).toContain("<PathwayMerchStore {...merchContent} />");
    expect(route).not.toContain("PathwayHero");
    expect(route).not.toContain("PathwayPriceCards");
    expect(route).toContain('club.presentationTemplateKey !== "pathway@1"');
  });

  it("renders two independent, keyboard-native color selectors", () => {
    const component = read("components/pathway/PathwayMerchStore.tsx");

    expect(component).toContain('"use client"');
    expect(component).toContain("collections.map((collection, index)");
    expect(component).toMatch(
      /useState\(\s*collection\.variants\[0\]\?\.id \?\? "",\s*\)/,
    );
    expect(component).toContain('role="tablist"');
    expect(component).toContain('role="tab"');
    expect(component).toContain("aria-selected={variant.id === selectedVariant.id}");
    expect(component).toContain(
      "aria-labelledby={`pathway-merch-${collection.id}-${selectedVariant.id}-tab`}",
    );
    expect(component).toContain("setSelectedVariantId(variant.id)");
    expect(component).toContain(
      "tabIndex={variant.id === selectedVariant.id ? 0 : -1}",
    );
    expect(component).toContain(
      "onKeyDown={(event) => selectAdjacentVariant(event, variant.id)}",
    );
    expect(component).toContain('event.key === "ArrowRight"');
    expect(component).toContain('event.key === "ArrowLeft"');
    expect(component).toContain('event.key === "Home"');
    expect(component).toContain('event.key === "End"');
    expect(component).toContain("event.preventDefault()");
    expect(component).toContain('role="tabpanel"');
    expect(component).toContain('aria-live="polite"');
    expect(component).not.toContain("pathway-merch-swatch");
  });

  it("uses resilient direct image delivery and an intentional failed-image state", () => {
    const component = read("components/pathway/PathwayMerchStore.tsx");

    expect(component).toContain(
      'import ResilientImage from "@/components/ResilientImage";',
    );
    expect(component).toContain(
      'import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";',
    );
    expect(component).toContain('imageDeliveryProps("shop-photo")');
    expect(component).toContain("src={selectedVariant.image.src}");
    expect(component).toContain("alt={selectedVariant.image.alt}");
    expect(component).toContain("fallback={");
    expect(component).toContain("<PathwayImageFallback");
    expect(component).toContain('sizes="(max-width: 900px) 100vw, 62vw"');
  });

  it("closes with the accessible DIAZA mentality statement and resilient logo", () => {
    const component = read("components/pathway/PathwayMerchStore.tsx");
    const content = read("components/pathway/content.ts");

    expect(content).toContain('heading: "#DIAZAMENTALITY"');
    expect(content).toContain(
      '"It’s a term we came up with for our teams; it stands for family, strength, leadership, daily improvement, and conquering obstacles."',
    );
    expect(content).toContain(
      'src: "/images/pathway/diaza-mentality-b219504f.png"',
    );
    expect(component).toContain('className="pathway-merch-mentality"');
    expect(component).toContain(
      'aria-labelledby="pathway-merch-mentality-heading"',
    );
    expect(component).toContain('id="pathway-merch-mentality-heading"');
    expect(component).toContain('alt={mentality.image.alt}');
    expect(component).toContain('label="DIAZA logo unavailable"');
    expect(component).toContain('imageDeliveryProps("small-graphic")');
    expect(component.indexOf('className="pathway-merch-mentality"')).toBeGreaterThan(
      component.indexOf('className="pathway-merch-note"'),
    );
  });

  it("ships exactly the supplied match and training colorways without invented commerce", () => {
    const component = read("components/pathway/PathwayMerchStore.tsx");
    const content = read("components/pathway/content.ts");

    expect(content).toContain("PathwayMerchStoreProps");
    expect(content).toContain('id: "match-jerseys"');
    expect(content).toContain('id: "training-jerseys"');
    expect(content.match(/color: "orange"/g)).toHaveLength(2);
    expect(content.match(/color: "black"/g)).toHaveLength(2);
    for (const asset of MERCH_ASSETS) {
      expect(content).toContain(asset.replace("public", ""));
    }

    const purchaseUrls = [
      "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-upsl-home-jersey",
      "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-upsl-away-jersey",
      "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-away-training-jersey",
      "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-home-training-jersey",
    ];
    expect(content.match(/label: "Buy Now"/g)).toHaveLength(4);
    for (const href of purchaseUrls) {
      expect(content).toContain(`href: "${href}"`);
    }
    expect(component).toContain("href={selectedVariant.cta.href}");
    expect(component).toContain("{selectedVariant.cta.label}");
    expect(component).toContain('target="_blank"');
    expect(component).toContain('rel="noopener noreferrer"');
    expect(component).not.toContain("collection.cta");
    expect(component).not.toContain('from "next/link"');

    const merchBlock = content.slice(
      content.indexOf("/* ============================ MERCH"),
      content.indexOf("/* ============================ ABOUT"),
    );
    expect(merchBlock).not.toMatch(
      /\$[0-9]|\bprice\s*:|checkout|cart|add to cart/i,
    );
  });

  it("keeps every supplied asset as a valid versioned WebP", () => {
    for (const asset of MERCH_ASSETS) {
      const bytes = readBytes(asset);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(bytes.length).toBeGreaterThan(50_000);
    }
  });

  it("keeps the supplied DIAZA mark as the exact versioned RGBA PNG", () => {
    const bytes = readBytes(DIAZA_ASSET);

    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1448);
    expect(bytes.readUInt32BE(20)).toBe(1086);
    expect(bytes[25]).toBe(6);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "b219504fa3bc6655cfe79317dbd18224690f7d4af091af6262cb2e39f0260231",
    );
  });

  it("keeps the presentation pathway-scoped, responsive, and motion-safe", () => {
    const css = read("styles/pathway.css");
    const start = css.indexOf("/* Pathway merch store");
    const end = css.indexOf("/* End pathway merch store", start);
    const block = css.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain(
      '[data-site-template="pathway"] .pathway-merch-page {',
    );
    expect(block).toContain(
      '[data-site-template="pathway"] .pathway-merch-collection {',
    );
    expect(block).toContain(
      '[data-site-template="pathway"] .pathway-merch-tab[aria-selected="true"] {',
    );
    expect(block).toContain("font-size: 15.5px;");
    expect(block).toContain("font-size: clamp(3.7rem, 6.4vw, 7rem);");
    expect(block).toContain("min-width: 190px;");
    expect(block).toContain("min-height: 66px;");
    expect(block).toContain("--store-product-stage: clamp(560px, 72svh, 760px);");
    expect(block).toContain("grid-template-columns: minmax(0, 1.12fr) minmax(360px, 0.88fr);");
    expect(block).toContain("width: min(100%, 960px);");
    expect(block).toContain("background: #fff;");
    expect(block).toContain("overflow: hidden;");
    expect(block).toContain("border-radius: clamp(24px, 2.8vw, 42px);");
    expect(block).toContain('#training-jerseys-heading {');
    expect(block).toContain("white-space: nowrap;");
    expect(block).toContain("font-size: clamp(2.15rem, 3.3vw, 4.15rem);");
    expect(block).toContain("min-height: 78px;");
    expect(block).toContain("border-radius: 18px;");
    expect(block).toContain("@media (max-width: 1120px)");
    expect(block).toContain("@media (max-width: 720px)");
    expect(block).toContain("@media (max-width: 540px)");
    expect(block).toContain("@media (prefers-reduced-motion: reduce)");
    expect(block).toContain(
      ".pathway-merch-mentality {\n  width: min(100%, 1640px);",
    );
    expect(block).toContain(
      "grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);",
    );
    expect(block).toContain("color: rgb(255 255 255 / 78%);");
    expect(block).toContain("object-fit: contain;");
    expect(block).not.toContain(".pathway-merch-mentality::before");

    const selectors = block
      .split("\n")
      .filter((line) => line.includes(".pathway-merch") && line.includes("{"));
    expect(selectors.length).toBeGreaterThan(20);
    expect(
      selectors.every((line) => line.includes('[data-site-template="pathway"]')),
    ).toBe(true);
  });
});
