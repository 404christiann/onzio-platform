import type { TemplateKey } from "@/packages/presentation";
import type { HomepageSaveRequest } from "./contract";
import type { HeroFields, HomepageSection, PieceId } from "./model";

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

type SaveSections = HomepageSaveRequest["sections"];
type FieldsBinding<S extends "hero" | "story" | "video"> = Readonly<{
  kind: "fields";
  section: S;
  fields: readonly (keyof NonNullable<SaveSections[S]>)[];
}>;

type ShopSource =
  | Readonly<{ surface: "home"; variants: readonly ["home"] }>
  | Readonly<{ surface: "shop"; variants: readonly ["home", "third", "away"] }>;

export type HomepageBinding =
  | FieldsBinding<"hero"> | FieldsBinding<"story"> | FieldsBinding<"video">
  | Readonly<{
      kind: "photos";
      section: "photos";
      fields: readonly (keyof NonNullable<SaveSections["photos"]>)[];
    }>
  | Readonly<{ kind: "shortcut"; owner: "about"; editorHref: "/admin/about" }>
  | Readonly<{ kind: "shortcut"; owner: "programs"; editorHref: "/admin/programs" }>
  | Readonly<{ kind: "shortcut"; owner: "shop"; editorHref: "/admin/shop"; source: ShopSource }>;

export type HomepageBindingIdentity = Readonly<{ key: string; revision: number }>;
export type HomepageBindings = HomepageBindingIdentity & Readonly<{
  elements: Readonly<Partial<Record<Exclude<PieceId, "story">, HomepageBinding>>>;
}>;

const LEGACY_BINDING_PROFILES = {
  homepageStory: { key: "legacy/homepage-story/home-kit", hero: "full-hero", captions: false },
  aboutStory: { key: "legacy/about-story/shop-kits", hero: "compact-hero", captions: true },
  video: { key: "legacy/video/home-kit", hero: "full-hero", captions: true },
} as const;

const knownBindingKeys = new Set(Object.values(LEGACY_BINDING_PROFILES).flatMap(profile =>
  [profile.hero, "fixed-hero"].flatMap(hero =>
    (profile.captions ? ["caption", "no-caption"] : ["no-caption"]).map(caption => `${profile.key}/${hero}/${caption}`),
  ),
));

/** Equal known keys and positive semantic revisions describe the same edit meaning, not save authorization or freshness. */
export function sameHomepageBindingMeaning(
  before: HomepageBindingIdentity | null | undefined,
  after: HomepageBindingIdentity | null | undefined,
): boolean {
  return !!before && !!after && knownBindingKeys.has(before.key) && before.key === after.key &&
    Number.isSafeInteger(before.revision) && before.revision > 0 && before.revision === after.revision;
}

/** Code-owned legacy projection. Bump the semantic revision when targets, ownership, fields or interpretation change. */
export function resolveHomepageBindings({ capabilities }: {
  capabilities: ReturnType<typeof resolveHomepageCapabilities>;
}): HomepageBindings {
  const hero = capabilities.editableSections.includes("hero");
  const story = capabilities.editableSections.includes("story");
  const profile = story ? LEGACY_BINDING_PROFILES.homepageStory :
    capabilities.sharedTargets.storyText ? LEGACY_BINDING_PROFILES.aboutStory : LEGACY_BINDING_PROFILES.video;
  const elements: HomepageBindings["elements"] = {
    ...(hero ? {
      ...(capabilities.heroEditableFields.includes("eyebrow") ? {
        "hero.eyebrow": { kind: "fields", section: "hero", fields: ["eyebrow"] },
      } : {}),
      "hero.heading": { kind: "fields", section: "hero", fields: ["headline_line_one", "headline_line_two"] },
      "hero.intro": { kind: "fields", section: "hero", fields: ["intro"] },
      "hero.cta": { kind: "fields", section: "hero", fields: ["primary_cta_label", "primary_cta_href", "secondary_cta_label", "secondary_cta_href"] },
    } : {}),
    ...(capabilities.editableSections.includes("photos") ? {
      photos: { kind: "photos", section: "photos", fields: capabilities.photoCaptionEditable ? ["items", "seasonLabel"] : ["items"] },
    } : {}),
    ...(story ? {
      "story.text": { kind: "fields", section: "story", fields: ["visible", "heading", "bodyPrimary", "bodySecondary"] },
      "story.cta": { kind: "fields", section: "story", fields: ["visible", "ctaLabel"] },
    } : {}),
    ...(capabilities.editableSections.includes("video") ? {
      video: { kind: "fields", section: "video", fields: ["visible", "eyebrow", "title", "description", "video_title", "caption"] },
    } : {}),
    ...(capabilities.sharedTargets.storyText ? {
      "shared.story": { kind: "shortcut", ...capabilities.sharedTargets.storyText },
    } : {}),
    "shared.shop": {
      kind: "shortcut", owner: "shop", editorHref: "/admin/shop",
      source: capabilities.sharedTargets.shop.surface === "shop" ?
        { surface: "shop", variants: ["home", "third", "away"] } : { surface: "home", variants: ["home"] },
    },
    ...(capabilities.sharedTargets.programs ? {
      "shared.programs": { kind: "shortcut", ...capabilities.sharedTargets.programs },
    } : {}),
  };
  return {
    key: `${profile.key}/${hero ? profile.hero : "fixed-hero"}/${capabilities.photoCaptionEditable ? "caption" : "no-caption"}`,
    revision: 1,
    elements,
  };
}
