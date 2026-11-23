import { editTarget, editTargetRowId, resolveEditTarget, type EditTargetId, type ResolvedEditTarget } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { NEWS_SECTIONS, type NewsSectionId } from "./news-page";

/**
 * Click-to-field for the News editor (UI-PREVIEW-CLICK-LIST-2). The ids are declared in EDIT_TARGET_REGISTRY ("news"): the
 * registry's sections are the dialog's sections (details, photo, article) and every field is keyed by the article's id, because
 * the registry is static and the article is not. NewsArticleFields stamps the same ids on the dialog controls, and
 * newsCardStamps puts them on the public nodes inside one article's card preview only (never on the public page).
 *
 * A card shows four things: the card heading and the category band (Details), the title (Details) and the cover photo (Cover
 * photo). The page heading, category legend and list number belong to the whole News page and are hidden in the card. The
 * date, subtitle, photo description, article text and button are only on the article page, so they have a control and no node
 * on a card; the dialog's own preview of the article stays inert.
 */
export type NewsField = "category" | "cardHeading" | "publishedLocal" | "title" | "subtitle" | "cover" | "coverAlt" | "body" | "actionLabel" | "actionHref";

/** The dialog section each field lives in. A click opens that section, not always Details. */
export const NEWS_FIELD_SECTION: Readonly<Record<NewsField, NewsSectionId>> = {
  category: "details", cardHeading: "details", publishedLocal: "details", title: "details", subtitle: "details",
  cover: "photo", coverAlt: "photo",
  body: "article", actionLabel: "article", actionHref: "article",
};

export const newsTarget = (articleKey: string, field: NewsField): EditTargetId => editTarget("news", NEWS_FIELD_SECTION[field], field, articleKey);

/** The dialog section a declared News target opens, or undefined for no target (or one that is not News's): the dialog opens on Details. */
export function newsSectionOf(target: string | undefined): NewsSectionId | undefined {
  const resolved = resolveEditTarget(target);
  return resolved?.editor === "news" ? NEWS_SECTIONS.find(section => section.id === resolved.section)?.id : undefined;
}

/** Whether a declared field belongs to the card for this article: only its own article's fields count. */
export function newsOwnsTarget(articleKey: string, target: ResolvedEditTarget): boolean {
  return target.editor === "news" && target.row === editTargetRowId(articleKey);
}

const fixed = (id: EditTargetId) => () => id;

/** Where one article's fields show on its card (CinematicNewsList with that one article), keyed by the article's id. */
export function newsCardStamps(articleKey: string): EditTargetStamp[] {
  return [
    { selector: ".news-item > h2", target: fixed(newsTarget(articleKey, "cardHeading")) },
    { selector: ".news-card-title", target: fixed(newsTarget(articleKey, "title")) },
    { selector: ".news-card-cover", target: fixed(newsTarget(articleKey, "cover")) },
    { selector: ".news-card-band", target: fixed(newsTarget(articleKey, "category")) },
  ];
}

/** One stamps array per article card, by the article's id. Depends only on the ids, never on what is typed, so typing never rebuilds it. */
export function newsStampsByCard(articleKeys: readonly string[]): Map<string, EditTargetStamp[]> {
  return new Map(articleKeys.map(key => [key, newsCardStamps(key)]));
}
