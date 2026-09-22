import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";

type TemplateKey = "academy@1" | "editorial@1" | "clubhouse@1";
type SlideshowVariant = "legacy" | "matchday" | "editorial" | "none";
type HomepageSection = "hero" | "photos" | "story" | "video";
type HeroEditableField =
  | "eyebrow"
  | "headline_line_one"
  | "headline_line_two"
  | "intro"
  | "primary_cta_label"
  | "primary_cta_href"
  | "secondary_cta_label"
  | "secondary_cta_href";

type SharedTarget = {
  owner: "about" | "shop" | "programs";
  editorHref: "/admin/about" | "/admin/shop" | "/admin/programs";
  surface?: "home" | "shop";
};

type HomepageCapabilities = {
  editableSections: HomepageSection[];
  heroEditableFields: HeroEditableField[];
  photoCaptionEditable: boolean;
  videoSourceEditable: boolean;
  sharedTargets: {
    storyText: null | SharedTarget;
    shop: SharedTarget;
    programs: null | SharedTarget;
  };
};

async function resolveCapabilities(
  templateKey: TemplateKey,
  slideshowVariant: SlideshowVariant = "none",
) {
  return loadContract<
    (input: {
      templateKey: TemplateKey;
      slideshowVariant: SlideshowVariant;
    }) => HomepageCapabilities
  >(
    "@/lib/homepage-editor/capabilities",
    "resolveHomepageCapabilities",
  ).then((resolve) => resolve({ templateKey, slideshowVariant }));
}

describe("homepage capability ownership contract", () => {
  it("maps Academy to hero/story editing and shared home-surface content", async () => {
    const capabilities = await resolveCapabilities("academy@1");

    expect(capabilities).toMatchObject({
      editableSections: ["hero", "story"],
      heroEditableFields: [
        "eyebrow",
        "headline_line_one",
        "headline_line_two",
        "intro",
        "primary_cta_label",
        "primary_cta_href",
        "secondary_cta_label",
        "secondary_cta_href",
      ],
      photoCaptionEditable: false,
      videoSourceEditable: false,
      sharedTargets: {
        storyText: null,
        shop: { owner: "shop", editorHref: "/admin/shop", surface: "home" },
        programs: { owner: "programs", editorHref: "/admin/programs" },
      },
    });
    expect(capabilities.editableSections).not.toContain("photos");
    expect(capabilities.editableSections).not.toContain("video");
  });

  it("maps Editorial to rendered hero/photos and About-owned story text", async () => {
    const capabilities = await resolveCapabilities("editorial@1", "editorial");

    expect(capabilities).toMatchObject({
      editableSections: ["hero", "photos"],
      heroEditableFields: [
        "headline_line_one",
        "headline_line_two",
        "intro",
        "primary_cta_label",
        "primary_cta_href",
        "secondary_cta_label",
        "secondary_cta_href",
      ],
      photoCaptionEditable: false,
      videoSourceEditable: false,
      sharedTargets: {
        storyText: { owner: "about", editorHref: "/admin/about" },
        shop: { owner: "shop", editorHref: "/admin/shop", surface: "shop" },
      },
    });
    expect(capabilities.editableSections).not.toContain("story");
    expect(capabilities.editableSections).not.toContain("video");
  });

  it("maps Clubhouse to rendered hero/photos and About-owned story text", async () => {
    const capabilities = await resolveCapabilities("clubhouse@1", "matchday");

    expect(capabilities).toMatchObject({
      editableSections: ["hero", "photos"],
      heroEditableFields: [
        "headline_line_one",
        "headline_line_two",
        "intro",
        "primary_cta_label",
        "primary_cta_href",
        "secondary_cta_label",
        "secondary_cta_href",
      ],
      photoCaptionEditable: false,
      videoSourceEditable: false,
      sharedTargets: {
        storyText: { owner: "about", editorHref: "/admin/about" },
        shop: { owner: "shop", editorHref: "/admin/shop", surface: "shop" },
      },
    });
    expect(capabilities.editableSections).not.toContain("story");
    expect(capabilities.editableSections).not.toContain("video");
  });

  it("never exposes the legacy video source as an editable homepage field", async () => {
    const capabilities = await resolveCapabilities("academy@1");
    expect(capabilities.videoSourceEditable).toBe(false);
  });

  it("keeps the legacy Rose City slideshow caption capability renderer-specific", async () => {
    const capabilities = await resolveCapabilities("clubhouse@1", "legacy");
    expect(capabilities).toMatchObject({ photoCaptionEditable: true });
  });
});
