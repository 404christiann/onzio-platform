import {
  joinNewsParagraphs, newsArticleContentSchema, newsInstantToLocal, newsLocalToInstant, newsSlug, splitNewsParagraphs,
  type NewsArticleSave, type NewsCategory, type NewsEditorArticle, type NewsEditorSnapshot, type NewsSaveResult,
} from "@/lib/cinematic-news";
import { mediaAssetUrl } from "@/lib/media-assets";

/** The editor form for one article. The article text is one field; each line is a paragraph. */
export type NewsDraft = {
  category: NewsCategory; cardHeading: string; title: string; subtitle: string; coverAlt: string;
  body: string; actionLabel: string; actionHref: string; publishedLocal: string;
  coverAssetId: string | null; coverUrl: string;
};
export type NewsDraftProblems = Partial<Record<keyof NewsDraft, string>>;

export function emptyNewsDraft(publishedLocal: string): NewsDraft {
  return { category: "news", cardHeading: "", title: "", subtitle: "", coverAlt: "", body: "", actionLabel: "", actionHref: "", publishedLocal, coverAssetId: null, coverUrl: "" };
}

export function newsDraftFromArticle(article: NewsEditorArticle, timeZone: string): NewsDraft {
  const { paragraphs, ...content } = article.content;
  return {
    ...content, body: joinNewsParagraphs(paragraphs), publishedLocal: newsInstantToLocal(article.publishedAt, timeZone),
    coverAssetId: article.cover?.assetId ?? null, coverUrl: article.cover ? mediaAssetUrl(article.cover) : "",
  };
}

const FIELD: Record<string, keyof NewsDraft> = { paragraphs: "body" };

/** A save request for the draft, or the fields to fix. Editing keeps the saved address and revision. */
export function newsSaveRequest(draft: NewsDraft, article: NewsEditorArticle | null, timeZone: string, operationId: string):
  { ok: true; request: Extract<NewsArticleSave, { action: "save" }> } | { ok: false; problems: NewsDraftProblems } {
  const problems: NewsDraftProblems = {};
  const content = {
    category: draft.category, cardHeading: draft.cardHeading, title: draft.title, subtitle: draft.subtitle.trim(), coverAlt: draft.coverAlt.trim(),
    paragraphs: splitNewsParagraphs(draft.body), actionLabel: draft.actionLabel.trim(), actionHref: draft.actionHref.trim(),
  };
  const parsed = newsArticleContentSchema.safeParse(content);
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = FIELD[String(issue.path[0])] ?? (String(issue.path[0]) as keyof NewsDraft);
    problems[key] ??= issue.message;
  }
  const publishedAt = newsLocalToInstant(draft.publishedLocal, timeZone);
  if (!publishedAt) problems.publishedLocal = "Choose the date and time.";
  if (!parsed.success || !publishedAt) return { ok: false, problems };
  return { ok: true, request: {
    operationId, action: "save", articleId: article?.id ?? null, expectedRevision: article?.revision ?? "0",
    slug: article?.slug ?? newsSlug(draft.title), publishedAt, coverAssetId: draft.coverAssetId, content: parsed.data,
  } };
}

export async function loadNewsEditor(operationId?: string): Promise<NewsEditorSnapshot> {
  const response = await fetch(`/api/admin/cinematic-news${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Unable to load News.");
  return data;
}

/** Saves once; when the response is lost, checks whether the same operation committed. */
export async function saveNewsArticle(request: NewsArticleSave): Promise<
  { status: "committed"; result: NewsSaveResult } |
  { status: "conflict" | "rejected"; message: string } |
  { status: "uncertain"; message: string }
> {
  try {
    const response = await fetch("/api/admin/cinematic-news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const data = await response.json();
    if (response.ok) return { status: "committed", result: data };
    if (response.status >= 500) throw new Error("Save status unknown");
    return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save the article." };
  } catch {
    try {
      const loaded = await loadNewsEditor(request.operationId);
      if (loaded.operation?.status === "committed") return { status: "committed", result: loaded.operation.receipt };
    } catch {}
    return { status: "uncertain", message: "The save could not be confirmed. Retry the same save." };
  }
}
