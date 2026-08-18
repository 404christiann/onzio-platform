import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const CAROUSEL_ASSETS = [
  "public/images/pathway/carousel-development-pathway-0c0bbcd7.webp",
  "public/images/pathway/carousel-looking-ahead-1a7f0175.webp",
  "public/images/pathway/carousel-coaching-philosophy-39574da7.webp",
  "public/images/pathway/carousel-consistency-515ae11b.webp",
  "public/images/pathway/carousel-cincinnati-growth-48aa6132.webp",
  "public/images/pathway/carousel-meet-manu-d454a169.webp",
  "public/images/pathway/carousel-player-coach-e11e68ac.webp",
  "public/images/pathway/carousel-global-journey-3664408f.webp",
] as const;

const CAROUSEL_HASHES = [
  "0036edffeedf343e5ceadade41a3b258df7b9db6619c48578c2cc5c2e81ab4ba",
  "e8e377066c80f266fcc6912d7853f747b96108042837294037b2b16497fff0ba",
  "541c1ed521ee7a4aa0047b1ce12afe864c4d1a6cecb09a20eadb4e66d8a0baab",
  "9cb7480598d7eba56f3daa4932ed301b95494dee91a5ff6ed40b4ceffcaa84fa",
  "6c883b26c15089db089b5bb0628225ac02c27f3b90ba631454c92156a986861f",
  "97ecb69f5f8dc7cee4ee9bab69ba012d8f27aab80f5475cab4be74f3c2f4e2fa",
  "d9c40c8fae4d8d6d61e97d0a49032ffb296b845832930953c5c9e21898546c9a",
  "33a49271dff38c9f737dc2522a898a2aa0a8eb942bcbb0d50bc5ec9c32c9b8ee",
] as const;

describe("pathway editorial carousel", () => {
  it("renders all eight supplied posters as resilient direct media", () => {
    const component = read(
      "components/pathway/PathwayEditorialCarousel.tsx",
    );
    const content = read("components/pathway/content.ts");

    expect(component).toContain('"use client"');
    expect(component).toContain(
      'import ResilientImage from "@/components/ResilientImage"',
    );
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(component).toContain("src={photo.src}");
    expect(component).toContain("alt={photo.alt}");
    expect(component).toContain("<PathwayImageFallback");
    expect(component).not.toContain('from "next/image"');
    expect(component).not.toContain("/_next/image");
    expect(component).not.toContain("/storage/v1/render/image/");

    for (const [index, asset] of CAROUSEL_ASSETS.entries()) {
      expect(content).toContain(asset.replace("public", ""));
      expect(existsSync(resolve(process.cwd(), asset))).toBe(true);
      const bytes = readFileSync(resolve(process.cwd(), asset));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        CAROUSEL_HASHES[index],
      );
    }
    expect(content.match(/carousel-[a-z-]+-[a-f0-9]{8}\.webp/g)).toHaveLength(8);
  });

  it("auto-rotates accessibly without visible captions or controls", () => {
    const component = read(
      "components/pathway/PathwayEditorialCarousel.tsx",
    );

    expect(component).toContain('aria-roledescription="carousel"');
    expect(component).toContain('aria-roledescription="slide"');
    expect(component).toContain('aria-label="Academy story gallery"');
    expect(component).toContain("onKeyDown={handleKeyDown}");
    expect(component).toContain("onScroll={updateActiveFromScroll}");
    expect(component).toContain('event.key === "ArrowLeft"');
    expect(component).toContain('event.key === "ArrowRight"');
    expect(component).toContain('event.key === "Home"');
    expect(component).toContain('event.key === "End"');
    expect(component).toContain("const AUTO_ADVANCE_MS = 4500;");
    expect(component).toContain("window.setInterval");
    expect(component).toContain("window.clearInterval");
    expect(component).toContain("if (photos.length < 2) return;");
    expect(component).toContain("reducedMotion.matches");
    expect(component).not.toMatch(/hoverPaused|focusPaused|pointerPaused|\bpaused\b/);
    expect(component).not.toMatch(
      /onMouseEnter|onMouseLeave|onFocus|onBlur|onPointerDown|onPointerUp|onPointerCancel/,
    );
    expect(component).toContain(
      'aria-label="Automatically rotating gallery. Use arrow keys to browse."',
    );
    expect(component).not.toContain("focus or hover to pause");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).not.toContain("pathway-editorial-carousel-head");
    expect(component).not.toContain("pathway-editorial-carousel-controls");
    expect(component).not.toContain("pathway-editorial-carousel-counter");
    expect(component).not.toContain("pathway-editorial-carousel-progress");
    expect(component).not.toContain("pathway-editorial-carousel-arrows");
    expect(component).not.toContain("aria-live");
    expect(component).not.toContain("<header");
    expect(component).not.toContain("<figcaption");
    expect(component).not.toContain("<button");
  });

  it("places the gallery immediately after the leader editorial on About only", () => {
    const home = read("app/%5Fclubs/[slug]/page.tsx");
    const about = read("app/%5Fclubs/[slug]/about/page.tsx");
    const content = read("components/pathway/content.ts");

    expect(about).toContain(
      'import PathwayEditorialCarousel from "@/components/pathway/PathwayEditorialCarousel"',
    );
    expect(about).toContain(
      "<PathwayEditorialCarousel {...aboutContent.carousel} />",
    );
    expect(about.indexOf("<PathwayAboutEditorial")).toBeLessThan(
      about.indexOf("<PathwayEditorialCarousel"),
    );
    expect(home).not.toContain("PathwayEditorialCarousel");
    expect(home).not.toContain("homeContent.carousel");
    expect(content).not.toContain('heading: "Inside the academy."');
    expect(content).not.toContain(
      "A closer look at the people, work and pathway behind the badge.",
    );
  });

  it("keeps the portrait rail scoped, uncropped, responsive, and motion-safe", () => {
    const css = read("styles/pathway.css");
    const start = css.indexOf("/* ============ EDITORIAL CAROUSEL");
    const end = css.indexOf("/* ============ MISSION", start);
    const block = css.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain(".pathway-editorial-carousel-viewport");
    expect(block).toContain("overflow-x: auto;");
    expect(block).toContain("scroll-snap-type: x mandatory;");
    expect(block).toContain("scrollbar-width: none;");
    expect(block).toContain(".pathway-editorial-carousel-slide");
    expect(block).toContain("scroll-snap-align: center;");
    expect(block).toContain("aspect-ratio: 4 / 5;");
    expect(block).toContain("object-fit: cover;");
    expect(block).toContain("@media (max-width: 700px)");
    expect(block).toContain("@media (prefers-reduced-motion: reduce)");
    expect(block).not.toContain(".pathway-editorial-carousel-head");
    expect(block).not.toContain(".pathway-editorial-carousel-controls");
    expect(block).not.toContain(".pathway-editorial-carousel-counter");
    expect(block).not.toContain(".pathway-editorial-carousel-progress");
    expect(block).not.toContain(".pathway-editorial-carousel-arrows");
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(/#(?:002b80|fc6601|077df2)/i);

    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-editorial-carousel"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });

  it("keeps the reusable component free of tenant and inspiration literals", () => {
    const component = read(
      "components/pathway/PathwayEditorialCarousel.tsx",
    );

    expect(component).not.toMatch(
      /Manu Ledesma|manu-ledesma-academy|\bMLA\b|Real Madrid/i,
    );
    expect(component).not.toMatch(/#(?:002b80|fc6601|077df2)/i);
  });
});
