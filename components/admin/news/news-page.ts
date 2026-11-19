import {
  NEWS_LIMITS, newsCategory, newsLocalToInstant, splitNewsParagraphs,
  type NewsArticleSave, type NewsCategory, type NewsEditorArticle,
} from "@/lib/cinematic-news";
import {
  emptyNewsDraft, newsDraftFromArticle, newsSaveRequest, type NewsDraft, type NewsDraftProblems,
} from "@/lib/cinematic-news-editor";
import { mediaAssetUrl } from "@/lib/media-assets";
import type { PageSaveFailure } from "@/components/admin/ui/editor-kit";

/** One article being edited on this page. Existing articles have `article`; a new one has null and a `new-N` key. */
export type NewsEntry = { key: string; article: NewsEditorArticle | null; draft: NewsDraft; original: string };

/** One request the page Save sends, with the name the notices use for it. */
export type NewsSaveItem = { key: string; title: string; request: NewsArticleSave };

export const NEWS_SECTIONS = [
  { id: "details", title: "Details" },
  { id: "photo", title: "Cover photo" },
  { id: "article", title: "Article" },
] as const;
export type NewsSectionId = (typeof NEWS_SECTIONS)[number]["id"];

export const draftFingerprint = (draft: NewsDraft) => JSON.stringify(draft);

export function entryForArticle(article: NewsEditorArticle, timeZone: string): NewsEntry {
  const draft = newsDraftFromArticle(article, timeZone);
  return { key: article.id, article, draft, original: draftFingerprint(draft) };
}

export function entryForNew(key: string, publishedLocal: string): NewsEntry {
  const draft = emptyNewsDraft(publishedLocal);
  return { key, article: null, draft, original: draftFingerprint(draft) };
}

export const entryChanged = (entry: NewsEntry) => draftFingerprint(entry.draft) !== entry.original;

export const changedEntries = (entries: Readonly<Record<string, NewsEntry>>) => Object.values(entries).filter(entryChanged);

/** What a card or a notice calls an article. */
export function entryTitle(entry: NewsEntry): string {
  return entry.draft.title.trim() || entry.article?.content.title || "New article";
}

/**
 * One request per changed article, built by the same builder the old editor used, so the same edits give the
 * same payload. Existing articles come first in the list's order (`order` lists existing articles only), then new ones. Any invalid article stops the
 * whole plan before anything is sent.
 */
export function buildSavePlan(
  entries: readonly NewsEntry[], order: readonly string[], timeZone: string, operationId: () => string,
): { ok: true; items: NewsSaveItem[] } | { ok: false; key: string; title: string; problems: NewsDraftProblems } {
  const rank = (entry: NewsEntry) => { const index = order.indexOf(entry.key); return index === -1 ? order.length : index; };
  const items: NewsSaveItem[] = [];
  for (const entry of [...entries].sort((a, b) => rank(a) - rank(b))) {
    const built = newsSaveRequest(entry.draft, entry.article, timeZone, operationId());
    if (!built.ok) return { ok: false, key: entry.key, title: entryTitle(entry), problems: built.problems };
    items.push({ key: entry.key, title: entryTitle(entry), request: built.request });
  }
  return { ok: true, items };
}

/** A card on the page: an article as saved, or as edited, or a new unsaved one. */
export type NewsCardItem = {
  key: string; article: NewsEditorArticle | null; draft: NewsDraft; removed: boolean; changed: boolean; isNew: boolean;
  publishedAt: string; title: string; slug: string | null; coverUrl: string;
};

/** Newest first, using each article's edited date, so a card sits where it will be once saved. */
export function newsCards(articles: readonly NewsEditorArticle[], entries: Readonly<Record<string, NewsEntry>>, timeZone: string): NewsCardItem[] {
  const cards: NewsCardItem[] = articles.map(article => {
    const entry = entries[article.id];
    const draft = entry?.draft ?? newsDraftFromArticle(article, timeZone);
    return {
      key: article.id, article, draft, removed: !!article.removedAt, changed: !!entry && entryChanged(entry), isNew: false,
      publishedAt: newsLocalToInstant(draft.publishedLocal, timeZone) ?? article.publishedAt,
      title: draft.title.trim() || article.content.title, slug: article.slug, coverUrl: draft.coverUrl,
    };
  });
  for (const entry of Object.values(entries)) if (!entry.article) cards.push({
    key: entry.key, article: null, draft: entry.draft, removed: false, changed: true, isNew: true,
    publishedAt: newsLocalToInstant(entry.draft.publishedLocal, timeZone) ?? new Date().toISOString(),
    title: entryTitle(entry), slug: null, coverUrl: entry.draft.coverUrl,
  });
  return cards.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.key.localeCompare(b.key));
}

export type NewsFilter = { query: string; category: "all" | NewsCategory; showRemoved: boolean };
export const DEFAULT_NEWS_FILTER: NewsFilter = { query: "", category: "all", showRemoved: true };

export function filterNewsCards(cards: readonly NewsCardItem[], filter: NewsFilter): NewsCardItem[] {
  const query = filter.query.trim().toLowerCase();
  return cards.filter(card => (filter.showRemoved || !card.removed)
    && (filter.category === "all" || card.draft.category === filter.category)
    && (!query || `${card.title} ${card.draft.cardHeading}`.toLowerCase().includes(query)));
}

/** The article text the preview shows: the same split the save uses. */
export const draftParagraphs = (draft: NewsDraft) => splitNewsParagraphs(draft.body);

/** The first paragraph that is over its limit, or null. */
export function overlongParagraph(draft: NewsDraft): { index: number; length: number } | null {
  const paragraphs = draftParagraphs(draft);
  const index = paragraphs.findIndex(text => text.length > NEWS_LIMITS.paragraph);
  return index === -1 ? null : { index, length: paragraphs[index].length };
}

/** What the preview needs for one draft: the same shape the public components take. */
export function previewArticle(card: Pick<NewsCardItem, "key" | "draft" | "publishedAt">, slug: string) {
  const { draft } = card;
  return {
    id: card.key, slug, publishedAt: card.publishedAt,
    content: {
      category: draft.category, cardHeading: draft.cardHeading || "Card heading", title: draft.title || "Article title", subtitle: draft.subtitle,
      coverAlt: draft.coverAlt, paragraphs: draftParagraphs(draft), actionLabel: draft.actionLabel, actionHref: draft.actionHref,
    },
    cover: draft.coverUrl ? { url: draft.coverUrl, width: 2287, height: 1237 } : null,
  };
}

export const coverUrlOf = (article: NewsEditorArticle) => (article.cover ? mediaAssetUrl(article.cover) : "");

export const categoryColor = (key: NewsCategory) => newsCategory(key).color;

/** The Save button's failure look: retry wins over conflict wins over error. */
export function newsPageFailure(flags: { pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveFailure | null {
  if (flags.pending) return "retry";
  if (flags.conflict) return "conflict";
  return flags.saveFailed ? "error" : null;
}

/** Closing the dialog drops an article nobody changed, but never while a photo is still uploading into it. */
export const dropOnClose = (entry: NewsEntry | undefined, uploading: boolean) => !!entry && !uploading && !entryChanged(entry);

/** Puts a finished upload into its article. `landed` is false when the article is gone, so the caller retires the asset. */
export function landCover(entries: Readonly<Record<string, NewsEntry>>, key: string, coverAssetId: string, coverUrl: string):
  { entries: Record<string, NewsEntry>; landed: boolean } {
  const entry = entries[key];
  if (!entry) return { entries: { ...entries }, landed: false };
  return { entries: { ...entries, [key]: { ...entry, draft: { ...entry.draft, coverAssetId, coverUrl } } }, landed: true };
}

/** What one save request came back as, reduced to what the page needs. */
export type NewsSendResult =
  | { status: "committed"; article: NewsEditorArticle }
  | { status: "uncertain" | "conflict" | "rejected"; message: string };

/**
 * The requests for one page Save. A pending request (an earlier save that was not confirmed, or an immediate
 * remove/restore) goes first, exactly as it was built, so Retry reuses its operation id. An unconfirmed save's
 * own article is left out of the rebuilt plan; after a pending remove or restore nothing else is sent.
 */
export function planPageSave(
  pending: NewsSaveItem | null, changed: readonly NewsEntry[], order: readonly string[], timeZone: string, operationId: () => string,
): { ok: true; items: NewsSaveItem[] } | { ok: false; key: string; title: string; problems: NewsDraftProblems } {
  const rest = pending ? (pending.request.action === "save" ? changed.filter(entry => entry.key !== pending.key) : []) : changed;
  const plan = buildSavePlan(rest, order, timeZone, operationId);
  if (!plan.ok) return plan;
  return { ok: true, items: [...(pending ? [pending] : []), ...plan.items] };
}

/** Sends the items one after another and stops at the first that is not committed. Earlier ones stay saved. */
export async function runSaveItems(
  items: readonly NewsSaveItem[], send: (item: NewsSaveItem) => Promise<NewsSendResult>, onCommitted: (item: NewsSaveItem, article: NewsEditorArticle) => void,
): Promise<{ done: number; total: number; failure: { item: NewsSaveItem; result: Exclude<NewsSendResult, { status: "committed" }> } | null }> {
  let done = 0;
  for (const item of items) {
    const result = await send(item);
    if (result.status !== "committed") return { done, total: items.length, failure: { item, result } };
    onCommitted(item, result.article);
    done += 1;
  }
  return { done, total: items.length, failure: null };
}

/** "Saved 1 of 3. " in front of the failure notice when some articles went through first. */
export const savedPrefix = (done: number, total: number) => (done ? `Saved ${done} of ${total}. ` : "");

/** After "Load latest and keep my edits": only each article and its baseline change; the edits stay as typed. */
export function rebaseEntries(entries: Readonly<Record<string, NewsEntry>>, latest: readonly NewsEditorArticle[], timeZone: string): Record<string, NewsEntry> {
  const byId = new Map(latest.map(article => [article.id, article]));
  return Object.fromEntries(Object.entries(entries).map(([key, entry]) => {
    const fresh = entry.article ? byId.get(entry.article.id) : undefined;
    return [key, fresh ? { ...entry, article: fresh, original: draftFingerprint(newsDraftFromArticle(fresh, timeZone)) } : entry];
  }));
}
