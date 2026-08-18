import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const EXPECTED_COLUMNS = [
  {
    focusLabel: "Physical readiness",
    title: "Strength & Agility Training",
    body: "Footwork drills, plyometrics, reaction work and balance training that sharpen how quickly a player changes direction. The return is speed, coordination and stability — and a body better protected against injury.",
    mediaCaption: "Agility session photography to come.",
  },
  {
    focusLabel: "Technical command",
    title: "Leveled Up Foot Skills",
    body: "Dribbling, passing, receiving, juggling, toe touches — repetition that puts the ball under a player's command, even under pressure. Better ball handling builds confidence, and confidence changes performance.",
    mediaCaption: "Foot-skills photography to come.",
  },
  {
    focusLabel: "Collective intelligence",
    title: "Teamwork & Teammates",
    body: "Soccer is decided by players working together. Sessions build the communication, coordination and trust that turn individuals into a team — one that keeps the ball, makes better decisions and backs each other up.",
    mediaCaption: "Team photography to come.",
  },
] as const;

describe("pathway Royal Training Gallery", () => {
  it("keeps semantic server markup and the asymmetric editorial heading", () => {
    const component = read("components/pathway/PathwayFeatureGrid.tsx");
    const sectionPrimitive = read("components/pathway/PathwaySection.tsx");

    expect(component).not.toContain('"use client"');
    expect(component).toContain(
      '<PathwaySection className="pathway-feature-grid-section">',
    );
    expect(sectionPrimitive).toContain("<section");
    expect(component).toContain('<ul\n        className="pathway-feature-grid"');
    expect(component).toContain("<li className=\"pathway-feature-cell\"");
    expect(component).toContain('aria-label="Training session highlights"');
    expect(component).toContain("tabIndex={0}");

    expect(component).toContain('className="pathway-feature-grid-head"');
    expect(component).toContain('className="pathway-feature-grid-kicker"');
    expect(component).toContain('className="pathway-feature-grid-rule"');
    expect(component).toContain('className="pathway-eyebrow"');
    expect(component).toContain('className="pathway-section-heading"');
    expect(component).toContain('className="pathway-section-intro"');
    expect(component).not.toContain("PathwaySectionHead");
    expect(component).not.toContain('align="center"');
  });

  it("locks the approved focus labels and preserves the existing copy order", () => {
    const content = read("components/pathway/content.ts");
    const component = read("components/pathway/PathwayFeatureGrid.tsx");
    const expectBlock = content.slice(
      content.indexOf("  expect: {"),
      content.indexOf("  partners: {"),
    );

    expect(expectBlock).toContain('eyebrow: "Inside the sessions"');
    expect(expectBlock).toContain('heading: "What your player can expect"');
    expect(component).toContain("focusLabel?: string;");
    expect(component).toContain('className="pathway-feature-focus"');

    let cursor = -1;
    for (const column of EXPECTED_COLUMNS) {
      for (const [field, value] of Object.entries(column)) {
        const next = expectBlock.indexOf(`${field}: ${JSON.stringify(value)}`, cursor + 1);
        expect(next, `${field} should retain its approved order`).toBeGreaterThan(cursor);
        cursor = next;
      }
    }

    expect(expectBlock.match(/focusLabel:/g)).toHaveLength(3);
    expect(expectBlock).not.toMatch(/focusLabel:\s*"(?:0?1|0?2|0?3)\b/);
    expect(component.indexOf("{column.focusLabel}")).toBeLessThan(
      component.indexOf("{column.title}</h3>"),
    );
  });

  it("preserves resilient direct media, honest fallbacks, and slot wiring", () => {
    const component = read("components/pathway/PathwayFeatureGrid.tsx");
    const page = read("app/%5Fclubs/[slug]/page.tsx");

    expect(component).toContain(
      'import ResilientImage from "@/components/ResilientImage"',
    );
    expect(component).toContain("<ResilientImage");
    expect(component).toContain("src={column.media.src}");
    expect(component).toContain("alt={column.media.alt}");
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(component).toContain("<PathwayMediaPlaceholder");
    expect(component).toContain("caption={column.mediaCaption}");
    expect(component.match(/(?:data-ratio|ratio)="portrait"/g)).toHaveLength(2);
    expect(component).not.toContain('from "next/image"');
    expect(component).not.toContain("/_next/image");
    expect(component).not.toContain("/storage/v1/render/image/");

    expect(page).toMatch(
      /const gridSlots = \[\s*HOME_PHOTO_SLOTS\.agility,\s*HOME_PHOTO_SLOTS\.footSkills,\s*HOME_PHOTO_SLOTS\.teamwork,\s*\]/,
    );
    expect(page).toContain("media: photos.get(gridSlots[index])");
    expect(page.indexOf("<PathwayCalmStory")).toBeLessThan(
      page.indexOf("<PathwayFeatureGrid"),
    );
    expect(page.indexOf("<PathwayFeatureGrid")).toBeLessThan(
      page.indexOf("<PathwayRail"),
    );
  });

  it("pins the scoped portrait gallery and contained mobile snap rail", () => {
    const css = read("styles/pathway.css");
    const start = css.indexOf(
      "/* ============ FEATURE GRID — ROYAL TRAINING GALLERY",
    );
    const block = css.slice(
      start,
      css.indexOf("/* ============ MISSION", start),
    );
    const sectionRule = block.match(
      /\.pathway-feature-grid-section\s*\{[^}]+\}/,
    )?.[0];
    const mediaRule = block.match(
      /\.pathway-feature-cell \.pathway-media\s*\{[^}]+\}/,
    )?.[0];
    const fallbackRule = block.match(
      /\.pathway-feature-cell \.pathway-media > \[data-image-fallback="true"\]\s*\{[^}]+\}/,
    )?.[0];
    const compactBlock = block.slice(block.indexOf("@media (max-width: 900px)"));
    const compactGridRule = compactBlock.match(
      /\.pathway-feature-grid\s*\{[^}]+\}/,
    )?.[0];
    const reducedMotionBlock = block.slice(
      block.indexOf("@media (prefers-reduced-motion: reduce)"),
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(sectionRule).toContain("overflow: hidden;");
    expect(mediaRule).toContain("aspect-ratio: 4 / 5;");
    expect(mediaRule).toContain("overflow: hidden;");
    expect(fallbackRule).toContain("width: 100% !important;");
    expect(fallbackRule).toContain("height: 100% !important;");
    expect(fallbackRule).toContain("min-height: 100% !important;");
    expect(block).toContain("@media (max-width: 900px)");
    expect(compactGridRule).toContain("overflow-x: auto;");
    expect(compactGridRule).toContain("scroll-snap-type: inline mandatory;");
    expect(compactGridRule).toContain(
      "margin-inline: calc(0px - var(--pad-x));",
    );
    expect(compactGridRule).toContain("padding: 0 var(--pad-x) 14px;");
    expect(compactBlock).toContain(".pathway-feature-grid:focus-visible");
    expect(reducedMotionBlock).toContain("transition: none;");
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(
      /Manu Ledesma|manu-ledesma-academy|\bMLA\b|Real Madrid/i,
    );
    expect(block).not.toMatch(/#(?:002b80|fc6601|077df2)/i);

    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-feature-"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });

  it("keeps the reusable component free of tenant and inspiration literals", () => {
    const component = read("components/pathway/PathwayFeatureGrid.tsx");

    expect(component).not.toMatch(/Manu Ledesma|manu-ledesma-academy|\bMLA\b/i);
    expect(component).not.toMatch(/Real Madrid/i);
    expect(component).not.toMatch(/#(?:002b80|fc6601|077df2)/i);
    expect(component).not.toMatch(/>\s*(?:0?1|0?2|0?3)\s*</);
  });
});
