import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("pathway calm story", () => {
  it("uses native disclosure controls and keeps the approved story copy", () => {
    const component = read("components/pathway/PathwayCalmStory.tsx");
    const content = read("components/pathway/content.ts");
    const page = read("app/%5Fclubs/[slug]/page.tsx");

    expect(component).not.toContain('"use client"');
    expect(component).toContain("<details");
    expect(component).toContain("<summary");
    expect(component).toContain("open={index === 0}");
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(page).toContain("<PathwayCalmStory");
    expect(page).not.toContain("<PathwayInvertedFeature");

    expect(content).toContain('label: "Why the academy exists"');
    expect(content).toContain('label: "Who leads the work"');
    expect(content).toContain('label: "What players receive"');
    expect(content).not.toContain('eyebrow: "Who we are"');
  });

  it("isolates the media geometry from every accordion open state", () => {
    const css = read("styles/pathway.css");
    const calmStoryBlock = css.slice(
      css.indexOf("/* ============ CALM STORY"),
      css.indexOf("/* ============ SPLIT / INVERTED FEATURE"),
    );
    const mediaRule = css.match(
      /\.pathway-calm-story-media\s*\{[^}]+\}/,
    )?.[0];
    const sectionRule = css.match(
      /\.pathway-calm-story-section\s*\{[^}]+\}/,
    )?.[0];
    const innerRule = css.match(
      /\.pathway-calm-story-section\s*>\s*\.pathway-section-inner\s*\{[^}]+\}/,
    )?.[0];
    const cardRule = css.match(
      /\.pathway-calm-story-card\s*\{[^}]+\}/,
    )?.[0];
    const portraitRule = css.match(
      /\.pathway-calm-story-portrait\s*\{[^}]+\}/,
    )?.[0];
    const imageRule = css.match(
      /\.pathway-calm-story-image\s*\{[^}]+\}/,
    )?.[0];
    const openRules = [...css.matchAll(/[^{}]*\[open\][^{]*\{[^}]*\}/g)].map(
      ([rule]) => rule,
    );

    expect(sectionRule).toContain("padding: 0;");
    expect(innerRule).toContain("width: 100%;");
    expect(innerRule).toContain("margin-inline: 0;");
    expect(cardRule).toContain("width: 100%;");
    expect(cardRule).toContain("border: 0;");
    expect(cardRule).toContain("border-radius: 0;");
    expect(cardRule).toContain("box-shadow: none;");
    expect(mediaRule).toContain("align-self: stretch;");
    expect(mediaRule).toContain("min-height: clamp(600px, 56vw, 720px);");
    expect(mediaRule).toContain("overflow: hidden;");
    expect(mediaRule).not.toContain("\n  height:");
    expect(portraitRule).toContain("position: absolute;");
    expect(portraitRule).toContain("inset: 0;");
    expect(portraitRule).toContain("height: 100%;");
    expect(imageRule).toContain("width: 100%;");
    expect(imageRule).toContain("height: 100%;");
    expect(imageRule).toContain("object-fit: cover;");
    expect(imageRule).toContain("object-position: 54% center;");
    expect(imageRule).toContain("transform: none;");
    expect(imageRule).toContain("transition: none;");
    expect(css).toContain("min-height: clamp(400px, 65vw, 560px);");
    expect(css).toContain("min-height: clamp(330px, 92vw, 430px);");
    expect(openRules).toHaveLength(1);
    expect(openRules[0]).toContain("pathway-calm-story-icon");
    expect(openRules[0]).not.toMatch(/media|portrait|image/);
    expect(calmStoryBlock).not.toContain("rgba(0, 43, 128");

    const calmStorySelectorLines = calmStoryBlock
      .split("\n")
      .filter((line) => line.includes(".pathway-calm-story-"));
    expect(calmStorySelectorLines.length).toBeGreaterThan(0);
    expect(
      calmStorySelectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });
});
