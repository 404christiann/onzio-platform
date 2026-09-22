import { describe, expect, it } from "vitest";
import { homepageRendererForClub, resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";

describe("homepage existing fallback renderer capabilities", () => {
  it.each(["cinematic@1", "heritage@1", null] as const)("maps %s to the existing generic page without inventing a story section", key => {
    const renderer = homepageRendererForClub({ presentationTemplateKey: key, slug: "alpha" });
    const capability = resolveHomepageCapabilities(renderer);
    expect(renderer).toEqual({ templateKey: key, slideshowVariant: "matchday", heroVariant: "editable" });
    expect(capability.editableSections).toEqual(["hero", "photos", "video"]);
    expect(capability.heroEditableFields).toHaveLength(8);
    expect(capability.photoCaptionEditable).toBe(false);
    expect(capability.sharedTargets.storyText).toBeNull();
    expect(capability.sharedTargets.shop.surface).toBe("home");
  });
  it.each(["cinematic@1", "heritage@1", null] as const)("preserves the Rose City fixed hero and legacy caption with %s", key => {
    const capability = resolveHomepageCapabilities(homepageRendererForClub({ presentationTemplateKey: key, slug: "rose-city" }));
    expect(capability.editableSections).toEqual(["photos", "video"]);
    expect(capability.heroEditableFields).toEqual([]);
    expect(capability.photoCaptionEditable).toBe(true);
  });
  it.each(["academy@1", "clubhouse@1", "editorial@1"] as const)("lets %s take precedence over the Rose City fixed-hero fallback", key => {
    const renderer = homepageRendererForClub({ presentationTemplateKey: key, slug: "rose-city" });
    expect(renderer.heroVariant).toBe("editable");
    expect(resolveHomepageCapabilities(renderer).editableSections).toContain("hero");
    expect(resolveHomepageCapabilities(renderer).photoCaptionEditable).toBe(key === "clubhouse@1");
  });
});
