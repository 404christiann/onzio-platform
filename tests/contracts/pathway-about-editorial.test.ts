import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { aboutContent } from "@/components/pathway/content";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const readBytes = (path: string) =>
  readFileSync(resolve(process.cwd(), path));

const ABOUT_ASSET =
  "public/images/pathway/about-leader-108a1c42.webp";

describe("pathway About editorial", () => {
  it("renders the leader editorial followed immediately by the carousel", () => {
    const route = read("app/%5Fclubs/[slug]/about/page.tsx");

    expect(route).toContain(
      'import PathwayAboutEditorial from "@/components/pathway/PathwayAboutEditorial";',
    );
    expect(route).toContain(
      "<PathwayAboutEditorial {...aboutContent.editorial} />",
    );
    expect(route).toContain(
      'import PathwayEditorialCarousel from "@/components/pathway/PathwayEditorialCarousel";',
    );
    expect(route).toContain(
      "<PathwayEditorialCarousel {...aboutContent.carousel} />",
    );
    expect(route.indexOf("<PathwayAboutEditorial")).toBeLessThan(
      route.indexOf("<PathwayEditorialCarousel"),
    );
    expect(route).not.toContain("PathwayHero");
    expect(route).not.toContain("PathwaySplitFeature");
    expect(route).toContain('club.presentationTemplateKey !== "pathway@1"');
    expect(route).not.toMatch(/club\.(?:slug|name)\s*===/);
  });

  it("renders a semantic server-side leader letter and resilient portrait", () => {
    const component = read(
      "components/pathway/PathwayAboutEditorial.tsx",
    );

    expect(component).not.toContain('"use client"');
    expect(component).toContain("export type PathwayAboutEditorialProps");
    expect(component).toContain(
      'aria-labelledby="pathway-about-leader-heading"',
    );
    expect(component).toContain('id="pathway-about-leader-heading"');
    expect(component).toContain(
      '<h1 id="pathway-about-leader-heading">{leader.heading}</h1>',
    );
    expect(component).not.toContain("pathway-about-leader-year");
    expect(component).not.toContain("leader.year");
    expect(component).not.toContain("pathway-about-story");
    expect(component).not.toContain("story.body");
    expect(component).toContain("leader.body.map((paragraph, index)");
    expect(component).toContain("<ResilientImage");
    expect(component).toContain("src={leader.media.src}");
    expect(component).toContain("alt={leader.media.alt}");
    expect(component).toContain("fill");
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(component).toContain("fallback={leaderMediaFallback}");
    expect(component).toContain('label="Leader photograph unavailable"');
    expect(component).toContain(
      'data-image-state={leader.media ? "provided" : "missing"}',
    );
    expect(component).not.toContain('from "next/image"');
    expect(component).not.toContain("<blockquote");
    expect(component).not.toContain("/storage/v1/render/image/");
    expect(component).not.toContain("/_next/image");
    expect(component).not.toContain("/Users/");
  });

  it("removes the one-club story and preserves Christian's exact seven-part leader letter", () => {
    const content = read("components/pathway/content.ts");
    const aboutBlock = content.slice(
      content.indexOf("/* ============================ ABOUT"),
      content.indexOf("/* =========================== CONTACT"),
    );

    expect(aboutBlock).not.toContain("Built around");
    expect(aboutBlock).not.toContain("one pathway.");
    expect(aboutBlock).not.toContain("One club, not four.");
    expect(aboutBlock).toContain('heading: "From our Leader"');
    expect(aboutBlock).not.toContain('year: "2026"');
    expect(aboutContent.editorial.leader.body).toEqual([
      "As we welcome 2026, I feel an even deeper sense of pride and gratitude for everything this academy represents and continues to build.",
      "Year after year, we keep growing, not just in numbers, but in purpose. More boys and girls choosing this badge, our UPSL getting wider, more families becoming part of our community, and a shared love for the game that shows up every time we step on the field. That’s what truly matters.",
      "What excites me most is the spirit behind it all: the commitment to development, the respect for the game, and the belief that soccer can leave a lasting impact beyond results.",
      "We’re building something meaningful here in Cincinnati and across the region. A culture, a pathway, and a legacy that our players will carry with them wherever they go.",
      "None of this would be possible without the players, families, coaches, and supporters who continue to trust us and believe in this project. Your confidence pushes us to raise the standard every single day.",
      "Here’s to 2026! To growth, community, hard work, and the love of the game.",
      "Let’s keep building, together.",
    ]);
    expect(aboutBlock).toContain(
      'src: "/images/pathway/about-leader-108a1c42.webp"',
    );
    expect(aboutBlock).not.toContain("Club photography to come.");
  });

  it("ships the normalized portrait as the expected versioned WebP", () => {
    const bytes = readBytes(ABOUT_ASSET);

    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(bytes.length).toBe(167_330);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "49462ac5a6747b8da33cea5e3abaca55f0e6d7de88b94bc8fbfac3b8c35db5cc",
    );
  });

  it("keeps the premium portrait-letter geometry scoped and responsive", () => {
    const css = read("styles/pathway.css");
    const start = css.indexOf("/* Pathway About — leader portrait");
    const end = css.indexOf("/* End pathway About editorial */", start);
    const block = css.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).not.toContain("pathway-about-story");
    expect(block).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(block).toContain("aspect-ratio: 1149 / 1368;");
    expect(block).not.toContain("pathway-about-leader-year");
    expect(block).not.toContain("-webkit-text-stroke");
    expect(block).toContain("object-fit: cover;");
    expect(block).toContain("object-position: 50% 50%;");
    expect(block).toContain("overflow: hidden;");
    expect(block).toContain("border-left: 4px solid var(--accent);");
    expect(block).toContain("@media (max-width: 1180px)");
    expect(block).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(block).toContain("@media (max-width: 560px)");
    expect(block).toContain("@media (prefers-reduced-motion: reduce)");
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(/#002b80|#fc6601|rgba\(0,\s*43,\s*128/i);

    const selectors = block
      .split("\n")
      .filter((line) => line.includes(".pathway-about-") && line.includes("{"));
    expect(selectors.length).toBeGreaterThan(10);
    expect(
      selectors.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });
});
