import type { TemplateKey } from "@/packages/presentation";
import type { HeroFields, HomepageSection } from "./model";

export type HomepageRenderer = {
  templateKey: TemplateKey | null;
  slideshowVariant: "none" | "editorial" | "matchday" | "legacy";
  heroVariant?: "editable" | "legacy-fixed";
};

/** Derive from trusted club context; preserve the existing public branches. */
export function homepageRendererForClub(club: { presentationTemplateKey: TemplateKey | null; slug: string }): HomepageRenderer {
  const key = club.presentationTemplateKey;
  return {
    templateKey: key,
    slideshowVariant: key === "academy@1" ? "none" : key === "editorial@1" ? "editorial" : club.slug === "rose-city" ? "legacy" : "matchday",
    heroVariant: club.slug === "rose-city" && key !== "academy@1" && key !== "clubhouse@1" && key !== "editorial@1" ? "legacy-fixed" : "editable",
  };
}

export function resolveHomepageCapabilities(input: HomepageRenderer) {
  const academy = input.templateKey === "academy@1";
  const editorial = input.templateKey === "editorial@1";
  const clubhouse = input.templateKey === "clubhouse@1";
  const editableSections: HomepageSection[] = [];
  const heroEditableFields: (keyof HeroFields)[] = [];
  if (input.heroVariant !== "legacy-fixed") {
    editableSections.push("hero");
    if (!editorial && !clubhouse) heroEditableFields.push("eyebrow");
    heroEditableFields.push("headline_line_one", "headline_line_two", "intro", "primary_cta_label", "primary_cta_href", "secondary_cta_label", "secondary_cta_href");
  }
  if (!academy) editableSections.push("photos");
  if (academy) editableSections.push("story");
  if (!academy && !editorial && !clubhouse) editableSections.push("video");
  return {
    editableSections, heroEditableFields,
    photoCaptionEditable: !academy && !editorial && input.slideshowVariant === "legacy",
    videoSourceEditable: false as const,
    sharedTargets: {
      storyText: editorial || clubhouse ? { owner: "about" as const, editorHref: "/admin/about" as const } : null,
      shop: { owner: "shop" as const, editorHref: "/admin/shop" as const, surface: editorial || clubhouse ? "shop" as const : "home" as const },
      programs: academy ? { owner: "programs" as const, editorHref: "/admin/programs" as const } : null,
    },
  };
}
