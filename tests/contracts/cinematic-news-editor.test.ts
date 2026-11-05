import { createElement } from "react";
import { vi } from "vitest";
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyNewsDraft, newsDraftFromArticle, newsSaveRequest } from "@/lib/cinematic-news-editor";
import { ADMIN_ROUTE_MANIFEST, isAdminRouteVisible } from "@/lib/admin-route-manifest";
import { MEDIA_SURFACES } from "@/lib/storage-path";
import NewsEditorList from "@/components/admin/news/NewsEditorList";
import type { NewsEditorArticle } from "@/lib/cinematic-news";

const LA = "America/Los_Angeles";
const OP = "9b2f0a52-7d0e-4e8e-8a52-2f1c1e7b9d10";
const saved: NewsEditorArticle = {
  id: "4d5f8f8e-8c47-4a8e-9f1e-0c4a1bb0b6a1", slug: "foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc", revision: "3",
  publishedAt: "2026-11-20T20:00:00.000Z", removedAt: null,
  cover: { assetId: "7c1f3b9e-2a4d-4e8f-9b1a-5d6e7f8a9b0c", storage_bucket: "onzio-media", storage_path: "rose/news/cover.jpg", width: 2287, height: 1237 },
  content: { category: "sponsor-partner", cardHeading: "Foothill Transit", title: "Foothill Transit becomes Official Front of Jersey Sponsor of RCFC", subtitle: "Official Front of Jersey Sponsor for the 2027 Season", coverAlt: "Six lockers", paragraphs: ["First.", "Second."], actionLabel: "Partner with us", actionHref: "/community/partnership" },
};

describe("RC2027-NEWS editor", () => {
  it("turns a new article draft into a create request with a web address from the title", () => {
    const draft = { ...emptyNewsDraft("2026-11-20T12:00"), category: "community" as const, cardHeading: "Community", title: "RCFC Visits PUSD Schools!", body: "We visited.\n\nThanks to PUSD.", actionLabel: "", actionHref: "" };
    expect(draft.publishedLocal).toBe("2026-11-20T12:00");
    expect(newsSaveRequest(draft, null, LA, OP)).toEqual({ ok: true, request: {
      operationId: OP, action: "save", articleId: null, expectedRevision: "0", slug: "rcfc-visits-pusd-schools", publishedAt: "2026-11-20T20:00:00.000Z", coverAssetId: null,
      content: { category: "community", cardHeading: "Community", title: "RCFC Visits PUSD Schools!", subtitle: "", coverAlt: "", paragraphs: ["We visited.", "Thanks to PUSD."], actionLabel: "", actionHref: "" },
    } });
  });

  it("edits a saved article in club time and keeps its address, revision and cover", () => {
    const draft = newsDraftFromArticle(saved, LA);
    expect(draft).toMatchObject({ publishedLocal: "2026-11-20T12:00", body: "First.\n\nSecond.", coverAssetId: saved.cover!.assetId, coverUrl: "http://127.0.0.1:55321/storage/v1/object/public/onzio-media/rose/news/cover.jpg" });
    const result = newsSaveRequest({ ...draft, title: "A new title" }, saved, LA, OP);
    expect(result.ok && result.request).toMatchObject({ articleId: saved.id, expectedRevision: "3", slug: saved.slug, coverAssetId: saved.cover!.assetId, publishedAt: "2026-11-20T20:00:00.000Z" });
  });

  it("explains what to fix before saving", () => {
    const draft = { ...newsDraftFromArticle(saved, LA), title: " ", publishedLocal: "", body: "\n", actionHref: "javascript:alert(1)" };
    const result = newsSaveRequest(draft, saved, LA, OP);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems).toEqual({
      title: "Enter a title.", publishedLocal: "Choose the date and time.", body: "Write the article text.",
      actionHref: "Use an https link or a page on this site, like /community/partnership.",
    });
  });

  it("adds News to the admin sidebar for cinematic@2 sites only", () => {
    const news = ADMIN_ROUTE_MANIFEST.find(route => route.id === "news");
    expect(news).toMatchObject({ label: "News", href: "/admin/news", groupId: "website" });
    expect(isAdminRouteVisible(news!, { role: "owner", presentationTemplateKey: "cinematic@2", isBillingAuthorized: true, canMutateContent: true })).toBe(true);
    expect(isAdminRouteVisible(news!, { role: "admin", presentationTemplateKey: "cinematic@2", isBillingAuthorized: false, canMutateContent: true })).toBe(true);
    expect(isAdminRouteVisible(news!, { role: "owner", presentationTemplateKey: "editorial@1", isBillingAuthorized: true, canMutateContent: true })).toBe(false);
    expect(MEDIA_SURFACES).toContain("news");
  });

  it("lists shown articles with Edit and Remove, and removed ones with Restore", () => {
    const removed = { ...saved, id: "removed-id", removedAt: "2027-01-01T00:00:00.000Z", content: { ...saved.content, title: "An old story" } };
    const html = renderToStaticMarkup(createElement(NewsEditorList, { articles: [saved, removed], timeZone: LA, disabled: false, onEdit: () => {}, onRemove: () => {}, onRestore: () => {} }));
    expect(html).toContain("Foothill Transit becomes Official Front of Jersey Sponsor of RCFC");
    expect(html).toContain("Friday, Nov 20, 2026 at 12:00 PM");
    expect(html).toContain("Sponsor/Partner");
    expect(html).toMatch(/Edit<\/button>/);
    expect(html).toMatch(/Remove<\/button>/);
    expect(html).toContain("Removed from the site");
    expect(html.indexOf("Removed from the site")).toBeLessThan(html.indexOf("An old story"));
    expect(html).toMatch(/Restore<\/button>/);
    expect(renderToStaticMarkup(createElement(NewsEditorList, { articles: [], timeZone: LA, disabled: false, onEdit: () => {}, onRemove: () => {}, onRestore: () => {} }))).toContain("No articles yet.");
  });
});
