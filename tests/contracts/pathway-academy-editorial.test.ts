import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("pathway Academy editorial section", () => {
  it("exposes tenant-owned editorial copy and media through a neutral API", () => {
    const component = read(
      "components/pathway/PathwayAcademyEditorial.tsx",
    );

    expect(component).toContain("export type PathwayAcademyEditorialProps");
    expect(component).toContain("eyebrow?: string;");
    expect(component).toContain("heading: string;");
    expect(component).toContain('headingLevel?: "h1" | "h2";');
    expect(component).toContain("body: string[];");
    expect(component).toContain("media?: PathwayAcademyEditorialMedia;");
    expect(component).toContain("src: string;");
    expect(component).toContain("alt: string;");
    expect(component).not.toMatch(
      /Manu Ledesma|manu-ledesma-academy|\bMLA\b|Real Madrid/i,
    );
    expect(component).not.toMatch(/#(?:002b80|fc6601|077df2)/i);
  });

  it("keeps the editorial split semantic and server rendered", () => {
    const component = read(
      "components/pathway/PathwayAcademyEditorial.tsx",
    );

    expect(component).not.toContain('"use client"');
    expect(component).toContain(
      '<PathwaySection className="pathway-academy-editorial-section">',
    );
    expect(component).toContain(
      '<article className="pathway-academy-editorial">',
    );
    expect(component).toContain(
      '<header className="pathway-academy-editorial-head">',
    );
    expect(component).toContain("const HeadingTag = headingLevel;");
    expect(component).toContain(
      '<HeadingTag className="pathway-section-heading">',
    );
    expect(component).toContain(
      '<div className="pathway-academy-editorial-body">',
    );
    expect(component).toContain("body.map((paragraph)");
    expect(component).toContain("<p key={paragraph}>{paragraph}</p>");
    expect(component).toContain("<figure");
    expect(component).toContain(
      'className="pathway-academy-editorial-media"',
    );
    expect(component).toContain('aria-hidden="true"');
  });

  it("uses resilient direct delivery and one honest non-collapsing fallback", () => {
    const component = read(
      "components/pathway/PathwayAcademyEditorial.tsx",
    );

    expect(component).toContain(
      'import ResilientImage from "@/components/ResilientImage"',
    );
    expect(component).toContain("<ResilientImage");
    expect(component).toContain("src={media.src}");
    expect(component).toContain("alt={media.alt}");
    expect(component).toContain("fill");
    expect(component).toContain("priority");
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(component).toContain("<PathwayImageFallback");
    expect(component).toContain('label="Academy photograph unavailable"');
    expect(component).toContain("fallback={academyMediaFallback}");
    expect(component).toContain('data-image-state={media ? "provided" : "missing"}');
    expect(component.match(/academyMediaFallback/g)).toHaveLength(3);
    expect(component).not.toContain('from "next/image"');
    expect(component).not.toContain("/_next/image");
    expect(component).not.toContain("/storage/v1/render/image/");
    expect(component).not.toContain("/Users/");
  });

  it("uses the supplied Academy photograph as a versioned direct asset", () => {
    const content = read("components/pathway/content.ts");
    const assetPath = "public/images/pathway/academy-session-4558c673.webp";
    const bytes = readFileSync(resolve(process.cwd(), assetPath));

    expect(content).toContain("/images/pathway/academy-session-4558c673.webp");
    expect(content).toContain(
      "Academy players listen to their coach during a field session.",
    );
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "2893d6003ba411f971e4b4188b44ab964b3f0f4ce78ba6e9410c81d053b58d60",
    );
  });
});
