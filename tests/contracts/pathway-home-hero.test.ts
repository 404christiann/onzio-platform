import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const INNER_PATHWAY_ROUTES = [
  "app/%5Fclubs/[slug]/academy/page.tsx",
  "app/%5Fclubs/[slug]/contact/page.tsx",
  "app/%5Fclubs/[slug]/upsl-payments/page.tsx",
  "app/%5Fclubs/[slug]/winter-5v5/page.tsx",
  "app/%5Fclubs/[slug]/youth-club/page.tsx",
] as const;

const EDITORIAL_ROUTES_WITHOUT_SHARED_HERO = [
  ["app/%5Fclubs/[slug]/about/page.tsx", "PathwayAboutEditorial"],
  ["app/%5Fclubs/[slug]/senior-club/page.tsx", "PathwaySeniorInterest"],
  ["app/%5Fclubs/[slug]/upsl/page.tsx", "PathwayUpslTryoutSpotlight"],
] as const;

describe("pathway Home Club Editorial hero", () => {
  it("preserves the Home media contract and the approved route-specific compositions", () => {
    const page = read("app/%5Fclubs/[slug]/page.tsx");
    const content = read("components/pathway/content.ts");
    const sharedHero = read("components/pathway/PathwayHero.tsx");
    const homeHero = read("components/pathway/PathwayHomeHero.tsx");

    expect(page).toContain('presentationTemplateKey === "pathway@1"');
    expect(page).toContain("<PathwayHomeHero");
    expect(page).toContain(
      "media={photos.get(HOME_PHOTO_SLOTS.heroBackground)}",
    );
    expect(page).toContain("<PathwayCalmStory");
    expect(content).toContain("hero: PathwayHomeHeroProps;");
    expect(content).toContain('headlineTop: "One club."');
    expect(content).toContain('headlineBottom: "Every stage of the game."');
    const heroBlock = content.slice(
      content.indexOf("  hero: {"),
      content.indexOf("  leader: {"),
    );
    expect(heroBlock).not.toContain("secondaryCta");
    expect(heroBlock).not.toContain("See the pathway");
    expect(content).not.toContain("Choose how the club story enters the frame.");
    expect(content).not.toContain('label: "Whole club"');
    expect(content).not.toContain('label: "Next generation"');
    expect(homeHero).not.toContain('"use client"');
    expect(homeHero).toContain("<h1");
    expect(sharedHero).not.toContain("PathwayHomeHero");

    for (const route of INNER_PATHWAY_ROUTES) {
      const source = read(route);
      expect(source).toContain("<PathwayHero");
      expect(source).not.toContain("PathwayHomeHero");
    }

    for (const [route, pageHeadingComponent] of EDITORIAL_ROUTES_WITHOUT_SHARED_HERO) {
      const source = read(route);
      expect(source).toContain(pageHeadingComponent);
      expect(source).not.toContain("PathwayHero");
      expect(source).not.toContain("PathwayHomeHero");
    }

    const trainingPage = read("app/%5Fclubs/[slug]/book-training/page.tsx");
    expect(trainingPage).toContain('<PathwayTrainingGateway mode="page" />');
    expect(trainingPage).not.toContain("<PathwayHero");
    expect(trainingPage).not.toContain("PathwayHomeHero");

    const merchPage = read("app/%5Fclubs/[slug]/merch/page.tsx");
    expect(merchPage).toContain("<PathwayMerchStore");
    expect(merchPage).not.toContain("<PathwayHero");
    expect(merchPage).not.toContain("PathwayHomeHero");
  });

  it("keeps the real hero photograph on resilient direct delivery", () => {
    const component = read(
      "components/pathway/PathwayHomeHeroMedia.tsx",
    );

    expect(component).not.toContain('"use client"');
    expect(component).toContain("<ResilientImage");
    expect(component).toContain("src={media.src}");
    expect(component).toContain("alt={media.alt}");
    expect(component).toContain("fill");
    expect(component).toContain("priority");
    expect(component).toContain('imageDeliveryProps("hero-photo")');
    expect(component).toContain("<ImageFallback");
    expect(component).toContain("fallback={");
    expect(component).toContain('label="Club photograph unavailable"');
    expect(component).toContain('data-pathway-home-hero-photo="true"');
    expect(component).not.toContain('from "next/image"');
    expect(component).not.toContain("<img");
    expect(component).not.toContain("data:image/");
    expect(component).not.toContain("home-hero.png");
    expect(component).not.toContain("/_next/image");
    expect(component).not.toContain("/storage/v1/render/image/");
    expect(component).not.toContain("/Users/");
  });

  it("keeps a fixed full-bleed Whole-club composition without leaking CSS", () => {
    const component = read(
      "components/pathway/PathwayHomeHeroMedia.tsx",
    );
    const css = read("styles/pathway.css");
    const block = css.slice(
      css.indexOf("/* ============ HOME HERO — CLUB EDITORIAL"),
      css.indexOf("/* ============ HERO ============", css.indexOf("HOME HERO")),
    );
    const frameRule = block.match(
      /\.pathway-home-hero-frame\s*\{[^}]+\}/,
    )?.[0];
    const sectionRule = block.match(
      /\.pathway-home-hero\s*\{[^}]+\}/,
    )?.[0];
    const mediaRule = block.match(
      /\.pathway-home-hero-media\s*\{[^}]+\}/,
    )?.[0];
    const imageRule = block.match(
      /\.pathway-home-hero-image\s*\{[^}]+\}/,
    )?.[0];
    expect(component).not.toContain('role="group"');
    expect(component).not.toContain("aria-pressed");
    expect(component).not.toContain("<button");
    expect(component).not.toContain("data-view");
    expect(sectionRule).toContain("padding: 0;");
    expect(frameRule).toContain("width: 100%;");
    expect(frameRule).toContain("min-height: 680px;");
    expect(frameRule).toContain("overflow: hidden;");
    expect(frameRule).toContain("border-radius: 0;");
    expect(frameRule).toContain("box-shadow: none;");
    expect(mediaRule).toContain("min-height: 680px;");
    expect(mediaRule).toContain("overflow: hidden;");
    expect(mediaRule).not.toMatch(/transform|transition/);
    expect(imageRule).toContain("width: 100%;");
    expect(imageRule).toContain("height: 100%;");
    expect(imageRule).toContain("object-fit: cover;");
    expect(imageRule).toContain("object-position: 50% 52%;");
    expect(imageRule).toContain("transform: scale(1);");
    expect(imageRule).toContain("transition: none;");
    expect(block).toContain("@media (max-width: 900px)");
    expect(block).toContain("@media (max-width: 620px)");
    expect(block).toContain("grid-template-areas:");
    expect(block).toContain('"media"');
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(/#002b80|#fc6601|rgba\(0,\s*43,\s*128/i);

    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-home-hero"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });
});
