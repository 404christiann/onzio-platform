import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const cssRule = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
};

describe("pathway stage-page additions", () => {
  it("keeps the Youth Club invitation reusable, semantic, and resilient", () => {
    const component = read("components/pathway/PathwayYouthJoin.tsx");

    expect(component).not.toContain('"use client"');
    expect(component).toContain("export type PathwayYouthJoinProps");
    expect(component).toContain('headingLevel?: "h1" | "h2";');
    expect(component).toContain('className="pathway-youth-join-section"');
    expect(component).toContain('className="pathway-youth-join-list"');
    expect(component).toContain("items.map((item)");
    expect(component).toContain("item.href ? <Link");
    expect(component).toContain("const HeadingTag = headingLevel;");
    expect(component).toContain("<ResilientImage");
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(component).toContain("fallback={youthMediaFallback}");
    expect(component).not.toMatch(/Manu Ledesma|manu-ledesma-academy|Real Madrid/i);
    expect(component).not.toContain("/storage/v1/render/image/");
  });

  it("wires the four approved route stories without tenant branching", () => {
    const academy = read("app/%5Fclubs/[slug]/academy/page.tsx");
    const youth = read("app/%5Fclubs/[slug]/youth-club/page.tsx");
    const senior = read("app/%5Fclubs/[slug]/senior-club/page.tsx");
    const upsl = read("app/%5Fclubs/[slug]/upsl/page.tsx");

    expect(academy).toContain('<PathwayAcademyEditorial');
    expect(academy).toContain('{...academyContent.editorial}');
    expect(academy).toContain('headingLevel="h1"');
    expect(academy).toContain(
      '<PathwayHero {...academyContent.hero} headingLevel="h2" />',
    );
    expect(academy.indexOf("<PathwayAcademyEditorial")).toBeLessThan(
      academy.indexOf("<PathwayHero"),
    );
    expect(academy).not.toContain("PathwaySplitFeature");
    expect(academy).not.toContain("PathwaySpecList");
    expect(youth).toContain(
      '<PathwayYouthJoin {...youthClubContent.join} headingLevel="h1" />',
    );
    expect(youth).toContain(
      '<PathwayHero {...youthClubContent.hero} headingLevel="h2" />',
    );
    expect(youth.indexOf("<PathwayYouthJoin")).toBeLessThan(
      youth.indexOf("<PathwayHero"),
    );
    expect(youth).not.toContain("<PathwaySplitFeature");
    expect(youth).not.toContain("PathwaySpecList");
    expect(senior).toContain("<PathwaySeniorInterest {...seniorClubContent.interest} />");
    expect(senior).not.toContain("PathwayHero");
    expect(senior).not.toContain("<PathwaySpecList");
    expect(upsl).toContain("<PathwayUpslTryoutSpotlight {...upslContent.tryouts} />");
    expect(upsl).toContain("<PathwayUpslMatchChannelPanel");
    expect(upsl).toContain("{...upslContent.channel}");
    expect(upsl).toContain("channelName={club.name}");
    expect(upsl).toContain("src: crestUrl");
    expect(upsl).toContain("<PathwayUpslStandingsTable");
    expect(upsl).not.toContain("PathwayHero");
    expect(upsl).not.toContain("PathwayInvertedFeature");
    expect(upsl).not.toContain("PathwayNumberedSteps");

    for (const route of [academy, youth, senior, upsl]) {
      expect(route).toContain('club.presentationTemplateKey !== "pathway@1"');
      expect(route).not.toMatch(/club\.(?:slug|name)\s*===/);
    }
  });

  it("preserves Christian's supplied copy, destinations, and versioned media", () => {
    const content = read("components/pathway/content.ts");
    const senior = read("components/pathway/PathwaySeniorInterest.tsx");
    const seniorBlock = content.slice(
      content.indexOf("export const seniorClubContent"),
      content.indexOf("/* ============================ UPSL"),
    );
    const upslBlock = content.slice(
      content.indexOf("export const upslContent"),
      content.indexOf("/* ======================== UPSL PAYMENTS"),
    );
    const academyBlock = content.slice(
      content.indexOf("export const academyContent"),
      content.indexOf("/* ========================= YOUTH CLUB"),
    );
    const youthBlock = content.slice(
      content.indexOf("export const youthClubContent"),
      content.indexOf("/* ========================= SENIOR CLUB"),
    );

    expect(content).toContain('heading: "Our Academy"');
    expect(content).toContain("personalized coaching approach");
    expect(content).toContain('heading: "Join us!"');
    expect(content).toContain("Indoor teams in both Summer and Winter");
    expect(youthBlock).toContain('{ label: "Year-round training" }');
    expect(youthBlock).not.toContain(
      '{ label: "Year-round training", href: "/contact" }',
    );
    expect(youthBlock).toContain('label: "Book Training"');
    expect(youthBlock).toContain('href: "/book-training"');
    expect(youthBlock).toContain('action: "training-gateway"');
    expect(youthBlock).not.toContain("CONTACT_CTA");
    expect(academyBlock).not.toContain("Technique first, then everything else.");
    expect(academyBlock).not.toContain("Academy at a glance");
    expect(academyBlock).not.toContain('eyebrow: "Academy"');
    expect(youthBlock).not.toContain("Youth Club at a glance");
    expect(youthBlock).not.toContain('eyebrow: "Youth Club"');
    expect(content).toContain('heading: "Fall Season UPSL — Free Tryouts"');
    expect(content).toContain('date: "July 2 & July 3"');
    expect(content).toContain('time: "9:00 PM"');
    expect(content).toContain('location: "Riverside Park | Cincinnati, Ohio"');
    expect(content).toContain("Subscribe to our official YouTube channel");
    expect(content).toContain("https://www.youtube.com/@ManuLedesmaAcademy");
    expect(content).toContain('heading: "Coming soon!"');
    expect(content).toContain('formHeading: "Want to be part of it?"');
    expect(senior).toContain(
      '<h1 className="pathway-section-heading">{heading}</h1>',
    );
    expect(seniorBlock).not.toContain('eyebrow: "Senior Club"');
    expect(seniorBlock).not.toContain("The last step");
    expect(seniorBlock).not.toContain("before the league.");
    expect(upslBlock).not.toContain("United Premier Soccer League");
    expect(upslBlock).not.toContain("The pathway");
    expect(upslBlock).not.toContain("has a destination.");
    expect(upslBlock).not.toContain("Where the pathway leads");
    expect(upslBlock).not.toContain("How entry works");
    expect(upslBlock).not.toContain(
      'statusLabel: "Previous tryout schedule"',
    );
    expect(upslBlock).toContain('label: "Register Here"');
    expect(upslBlock).toContain(
      'href: "https://docs.google.com/forms/d/e/1FAIpQLSdc4zEO4hF3rDazZz2IkEpYf5hf2PKgYkAwe3uQ9cWYf0fxrA/viewform"',
    );
    expect(upslBlock).not.toContain('label: "Ask about upcoming tryouts"');
    expect(content).not.toContain('label: "Register here for free"');
    expect(content).toContain("It also offers an optional phone field.");
    expect(content).toContain("/images/pathway/academy-huddle-a9b9250f.webp");
    expect(content).toContain("/images/pathway/upsl-celebration-c31bfab4.webp");

    for (const asset of [
      "public/images/pathway/academy-huddle-a9b9250f.webp",
      "public/images/pathway/upsl-celebration-c31bfab4.webp",
    ]) {
      const absolute = resolve(process.cwd(), asset);
      expect(existsSync(absolute)).toBe(true);
      const bytes = readFileSync(absolute);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("keeps the royal editorial CSS pathway-scoped, responsive, and stable", () => {
    const css = read("styles/pathway.css");
    const fallback = read("components/pathway/PathwayImageFallback.tsx");
    const block = css.slice(css.indexOf("STAGE PAGES — ROYAL EDITORIAL"));
    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-"));

    expect(block).toContain(".pathway-academy-editorial");
    expect(block).toContain(".pathway-youth-join");
    expect(block).toContain(".pathway-upsl-spotlight");
    expect(block).toContain(".pathway-upsl-channel");
    expect(block).toContain(".pathway-senior-interest");
    expect(block).toContain(".pathway-image-fallback");
    expect(block).toContain("min-height: 720px;");
    expect(block).toContain("min-height: 760px;");
    expect(block).toContain("object-fit: cover;");
    expect(block).toContain('> [data-image-fallback="true"]');
    expect(block).toContain("@media (max-width: 980px)");
    expect(block).toContain("@media (max-width: 560px)");
    expect(block).toContain("@media (prefers-reduced-motion: reduce)");
    expect(
      cssRule(
        block,
        '[data-site-template="pathway"] .pathway-academy-editorial-media',
      ),
    ).toMatch(/min-height:\s*720px;[\s\S]*overflow:\s*hidden;/);
    expect(
      cssRule(
        block,
        '[data-site-template="pathway"] .pathway-youth-join-media',
      ),
    ).toMatch(/min-height:\s*680px;[\s\S]*overflow:\s*hidden;/);
    expect(
      cssRule(
        block,
        '[data-site-template="pathway"] .pathway-upsl-spotlight-visual',
      ),
    ).toMatch(/min-height:\s*760px;[\s\S]*overflow:\s*hidden;/);
    expect(
      cssRule(
        block,
        '[data-site-template="pathway"] .pathway-image-fallback',
      ),
    ).toMatch(/inset:\s*0;[\s\S]*min-height:\s*100%;[\s\S]*background:\s*color-mix/);
    expect(fallback).toContain('data-image-fallback="true"');
    expect(fallback).toContain('className={["pathway-image-fallback"');
    expect(fallback).not.toMatch(/rgba\(|linear-gradient|radial-gradient|#[0-9a-f]{3,8}/i);
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
    expect(block).not.toMatch(/Real Madrid|Manu Ledesma|\bMLA\b/i);
    expect(block).not.toMatch(/#(?:002b80|fc6601|077df2)/i);
    expect(block).not.toMatch(/rgba\(231\s*,\s*0\s*,\s*27/i);
    expect(block).not.toContain("100vw");
  });
});
