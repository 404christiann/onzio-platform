import type { DBAboutPageContent, DBClubLogoPageContent } from "@/lib/db-types";
import {
  DEFAULT_ABOUT_PAGE_CONTENT,
  normalizeAboutValues,
  normalizeClubLogoColorCards,
  normalizeClubLogoFeatures,
  normalizeStoryParagraphs,
} from "@/lib/about-content";

export type AboutPageSave =
  | { page: "about"; content: DBAboutPageContent }
  | { page: "logo"; content: DBClubLogoPageContent };

/** Build exactly one public page row from the selected page's draft. */
export function prepareAboutPageSave(input: {
  page: "about" | "logo";
  about: DBAboutPageContent;
  logo: DBClubLogoPageContent;
  academy: boolean;
  now: string;
}): AboutPageSave {
  if (input.page === "about") {
    return {
      page: "about",
      content: {
        ...input.about,
        hero_title: input.about.hero_title.trim() || DEFAULT_ABOUT_PAGE_CONTENT.hero_title,
        story_paragraphs: normalizeStoryParagraphs(input.about.story_paragraphs, []),
        values_heading: input.about.values_heading.trim() || DEFAULT_ABOUT_PAGE_CONTENT.values_heading,
        values: normalizeAboutValues(input.about.values, []),
        closing_text: input.about.closing_text.trim(),
        closing_cta_label: input.about.closing_cta_label.trim(),
        closing_cta_href: input.academy ? "/schedule" : input.about.closing_cta_href.trim(),
        updated_at: input.now,
      },
    };
  }
  return {
    page: "logo",
    content: {
      ...input.logo,
      features: normalizeClubLogoFeatures(input.logo.features, []),
      color_cards: normalizeClubLogoColorCards(input.logo.color_cards, []),
      updated_at: input.now,
    },
  };
}

/** Strip legacy row metadata before sending the selected page to the server. */
export function aboutPageEditableContent(prepared: AboutPageSave) {
  if (prepared.page === "about") {
    const { hero_title, story_paragraphs, feature_image_url, values_heading, values, closing_text, closing_cta_label, closing_cta_href } = prepared.content;
    return { hero_title, story_paragraphs, feature_image_url, values_heading, values, closing_text, closing_cta_label, closing_cta_href };
  }
  const { annotated_image_url, map_image_url, features, color_cards } = prepared.content;
  return { annotated_image_url, map_image_url, features, color_cards };
}
