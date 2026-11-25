import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABOUT_IMAGE_RULES } from "@/components/admin/about/rose-city/about-sections";
import { imageFileIssue, imageHint } from "@/components/admin/ui/adminImageFiles";

const MB = 1024 * 1024;
const file = (name: string, type: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type });

describe("About and Club Logo image field rules", () => {
  it("tells people graphics are PNG or WebP up to 5 MB and photos JPG, PNG or WebP up to 15 MB", () => {
    expect(imageHint(ABOUT_IMAGE_RULES.graphic)).toBe("PNG or WebP up to 5 MB");
    expect(imageHint(ABOUT_IMAGE_RULES.photo)).toBe("JPG, PNG or WebP up to 15 MB");
  });

  it("refuses a JPG on a graphic field before it uploads", async () => {
    await expect(imageFileIssue(file("crest.jpg", "image/jpeg", 1000), ABOUT_IMAGE_RULES.graphic))
      .resolves.toBe("“crest.jpg” is not a supported image. Use PNG or WebP.");
  });

  it("refuses a graphic over 5 MB before it uploads", async () => {
    await expect(imageFileIssue(file("map.png", "image/png", 5 * MB + 1), ABOUT_IMAGE_RULES.graphic))
      .resolves.toBe("“map.png” is too large. The limit is 5 MB.");
  });

  it("refuses a photo over 15 MB before it uploads", async () => {
    await expect(imageFileIssue(file("story.jpg", "image/jpeg", 15 * MB + 1), ABOUT_IMAGE_RULES.photo))
      .resolves.toBe("“story.jpg” is too large. The limit is 15 MB.");
  });

  it("gives the crest, map, patch, icon and swatch the graphic rules and the feature image the photo rules", () => {
    const source = readFileSync("components/admin/about/rose-city/AboutSectionFields.tsx", "utf8");
    const rulesFor = (label: string) => new RegExp(`label="${label}"[^\\n]*\\{\\.\\.\\.ABOUT_IMAGE_RULES\\.(\\w+)\\}`).exec(source)?.[1];
    expect(rulesFor("Feature image")).toBe("photo");
    for (const label of ["Annotated crest image", "Map image", "Patch", "Icon", "Swatch image"]) {
      expect(rulesFor(label), label).toBe("graphic");
    }
  });
});
