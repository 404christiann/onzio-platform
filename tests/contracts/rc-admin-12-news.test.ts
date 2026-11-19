import { createElement } from "react";
import { vi } from "vitest";
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewsCards } from "@/components/admin/news/NewsCards";
import {
  DEFAULT_NEWS_FILTER, buildSavePlan, changedEntries, entryChanged, entryForArticle, entryForNew, filterNewsCards, newsCards, newsPageFailure, overlongParagraph,
} from "@/components/admin/news/news-page";
import { NEWS_LIMITS, type NewsEditorArticle } from "@/lib/cinematic-news";
import { newsSaveRequest } from "@/lib/cinematic-news-editor";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));

const LA = "America/Los_Angeles";
const article = (id: string, title: string, publishedAt: string, extra: Partial<NewsEditorArticle> = {}): NewsEditorArticle => ({
  id, slug: title.toLowerCase().replace(/\W+/g, "-"), revision: "3", publishedAt, removedAt: null, cover: null,
  content: { category: "news", cardHeading: "Heading", title, subtitle: "", coverAlt: "", paragraphs: ["One.", "Two."], actionLabel: "", actionHref: "" }, ...extra,
});
const A = article("11111111-1111-4111-8111-111111111111", "Alpha", "2026-11-20T20:00:00.000Z");
const B = article("22222222-2222-4222-8222-222222222222", "Beta", "2026-11-18T20:00:00.000Z", { removedAt: "2026-11-19T00:00:00.000Z" });
const C = article("33333333-3333-4333-8333-333333333333", "Gamma", "2026-11-25T20:00:00.000Z");
const ids = (n: number) => () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`;

describe("RC-ADMIN-12 News page Save", () => {
  it("an opened article nobody edited is not saved", () => {
    const entry = entryForArticle(A, LA);
    expect(entryChanged(entry)).toBe(false);
    expect(changedEntries({ [entry.key]: entry })).toEqual([]);
    expect(entryChanged(entryForNew("new-1", "2026-11-20T12:00"))).toBe(false);
  });

  it("sends the same payload per article as the old editor's builder", () => {
    const entry = entryForArticle(A, LA);
    entry.draft = { ...entry.draft, title: "Alpha, edited" };
    const plan = buildSavePlan([entry], [A.id], LA, ids(1));
    const direct = newsSaveRequest(entry.draft, A, LA, "00000000-0000-4000-8000-000000000001");
    expect(plan.ok && direct.ok && plan.items).toEqual([{ key: A.id, title: "Alpha, edited", request: direct.ok && direct.request }]);
    expect(plan.ok && plan.items[0].request).toMatchObject({ action: "save", articleId: A.id, expectedRevision: "3", slug: A.slug });
  });

  it("saves every edited article, each with its own revision and operation id, in list order, new ones last", () => {
    const a = entryForArticle(A, LA), c = entryForArticle(C, LA), fresh = entryForNew("new-1", "2026-11-21T12:00");
    a.draft = { ...a.draft, title: "A2" }; c.draft = { ...c.draft, title: "C2" };
    fresh.draft = { ...fresh.draft, cardHeading: "Community", title: "Brand new", body: "Hello." };
    const plan = buildSavePlan([fresh, a, c], [C.id, A.id], LA, ids(1));
    expect(plan.ok && plan.items.map(item => item.key)).toEqual([C.id, A.id, "new-1"]);
    expect(plan.ok && plan.items.map(item => (item.request as { expectedRevision: string }).expectedRevision)).toEqual(["3", "3", "0"]);
    expect(plan.ok && new Set(plan.items.map(item => item.request.operationId)).size).toBe(3);
    expect(plan.ok && plan.items[2].request).toMatchObject({ articleId: null, slug: "brand-new" });
  });

  it("stops before sending anything when one article is invalid, and names it", () => {
    const a = entryForArticle(A, LA), c = entryForArticle(C, LA);
    a.draft = { ...a.draft, title: "A2" }; c.draft = { ...c.draft, title: " " };
    const plan = buildSavePlan([a, c], [C.id, A.id], LA, ids(1));
    expect(plan).toMatchObject({ ok: false, key: C.id, problems: { title: "Enter a title." } });
  });

  it("maps pending, conflict and error onto the page Save, retry first", () => {
    expect(newsPageFailure({ pending: true, conflict: true, saveFailed: true })).toBe("retry");
    expect(newsPageFailure({ pending: false, conflict: true, saveFailed: true })).toBe("conflict");
    expect(newsPageFailure({ pending: false, conflict: false, saveFailed: true })).toBe("error");
    expect(newsPageFailure({ pending: false, conflict: false, saveFailed: false })).toBeNull();
  });

  it("flags the first paragraph over its limit, and no total cap", () => {
    const base = entryForArticle(A, LA).draft;
    expect(overlongParagraph({ ...base, body: `ok\n${"x".repeat(NEWS_LIMITS.paragraph + 1)}` })).toEqual({ index: 1, length: NEWS_LIMITS.paragraph + 1 });
    expect(overlongParagraph({ ...base, body: Array.from({ length: 5 }, () => "x".repeat(NEWS_LIMITS.paragraph)).join("\n") })).toBeNull();
  });
});

describe("RC-ADMIN-12 News cards", () => {
  const cards = newsCards([A, B, C], {}, LA);

  it("lists newest first and keeps removed articles", () => {
    expect(cards.map(card => card.title)).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(cards.map(card => card.removed)).toEqual([false, false, true]);
  });

  it("puts an unsaved new article in date order, marked as not saved", () => {
    const fresh = entryForNew("new-1", "2026-11-22T12:00");
    fresh.draft = { ...fresh.draft, title: "Fresh" };
    const list = newsCards([A, C], { "new-1": fresh }, LA);
    expect(list.map(card => card.title)).toEqual(["Gamma", "Fresh", "Alpha"]);
    expect(list[1]).toMatchObject({ isNew: true, changed: true, article: null });
  });

  it("filters by search, category and removed", () => {
    expect(filterNewsCards(cards, { ...DEFAULT_NEWS_FILTER, showRemoved: false }).map(card => card.title)).toEqual(["Gamma", "Alpha"]);
    expect(filterNewsCards(cards, { ...DEFAULT_NEWS_FILTER, query: "alp" }).map(card => card.title)).toEqual(["Alpha"]);
    expect(filterNewsCards(cards, { ...DEFAULT_NEWS_FILTER, category: "partner" })).toEqual([]);
  });

  it("shows Live and Removed markers; only live cards have Edit controls; removed ones have Restore", () => {
    const html = renderToStaticMarkup(createElement(NewsCards, { cards, shared: null, timeZone: LA, locked: false, onEdit: () => {}, onRemove: () => {}, onRestore: () => {}, onDiscard: () => {} }));
    expect(html.match(/>Live</g)).toHaveLength(2);
    expect(html.match(/>Removed</g)).toHaveLength(1);
    expect(html).toContain('aria-label="Restore Beta"');
    expect(html).not.toContain('aria-label="Edit Beta');
    expect(html.match(/data-kit-edit/g)).toHaveLength(4);
    expect(html).toContain("Nov 20, 2026");
  });

  it("holds every control while a save runs", () => {
    const html = renderToStaticMarkup(createElement(NewsCards, { cards, shared: null, timeZone: LA, locked: true, onEdit: () => {}, onRemove: () => {}, onRestore: () => {}, onDiscard: () => {} }));
    expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*aria-label="(Edit|Restore|More actions)/);
  });
});
