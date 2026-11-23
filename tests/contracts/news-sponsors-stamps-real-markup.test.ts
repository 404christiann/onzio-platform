import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NEWS_IDS, NEWS_NEW_KEY, SPONSOR_KEYS, newsCardsFixture, sponsorDraftsFixture, sponsorLogoUrl } from "../fixtures/visitor-click-fixtures";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { newsCardStamps, newsOwnsTarget, newsStampsByCard, newsTarget } from "@/components/admin/news/news-edit-targets";
import { previewArticle, type NewsCardItem } from "@/components/admin/news/news-page";
import { newsCategory } from "@/lib/cinematic-news";
import type { NewsPublicArticle } from "@/lib/cinematic-news-query";
import { sponsorStamps, sponsorStampsByPlace, sponsorTarget } from "@/components/admin/sponsors/rose-city/sponsors-edit-targets";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import type { SponsorDraft } from "@/lib/sponsor-content";

/**
 * UI-PREVIEW-CLICK-LIST-2: the News card stamps and the Rose City sponsor strip stamps, run against the real public markup
 * (CinematicNewsList with one article, as the card's thumbnail renders it; CinematicSponsors fed the draft, as the carousel card
 * renders it). Each stamp must land on exactly the node that shows its field's draft text or image, the page-level parts carry
 * none, and no stamped node is, or is inside, a node the card's CSS hides.
 */
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", name: "Rose City FC" }) }));
/** URLs whose image fails to load. The mock then does what ResilientNativeImage does on failure: no alt (the strip's
 *  looping clone) renders nothing, an alt renders the fallback box instead of an img. */
const failing = new Set<string>();
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) =>
  failing.has(src) ? (alt ? createElement("div", { role: "img", "aria-label": `${alt} unavailable`, className: "image-fallback" }) : null) : createElement("img", { src, alt, className }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next/link", () => ({ default: ({ href, className, style, children }: { href: string; className?: string; style?: object; children: ReactNode }) => createElement("a", { href, className, style }, children) }));
import { CinematicNewsList } from "@/components/cinematic/CinematicNews";
import CinematicSponsors from "@/components/cinematic/CinematicSponsors";

beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });

const nodesFor = (root: StaticElement, id: string) => [...root.descendants()].filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === id);
const only = (root: StaticElement, id: string) => {
  const nodes = nodesFor(root, id);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
};
const text = (node: StaticElement) => node.textContent.replace(/\s+/g, " ").trim();
const stampedIds = (root: StaticElement) => [...root.descendants()].flatMap(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? []);
const unstamped = (root: StaticElement, selector: string) => {
  const nodes = root.querySelectorAll(selector);
  expect(nodes.length, selector).toBeGreaterThan(0);
  for (const node of nodes) expect(node.getAttribute(EDIT_TARGET_ATTRIBUTE), selector).toBeNull();
};

/* ---------------------------------------------------------------- News */
const cards = newsCardsFixture().filter(card => !card.removed);
/** A card thumbnail exactly as the editor renders it: the real News list with this one article, stamped with the card's stamps. */
function cardRoot(card: NewsCardItem, stamps = newsStampsByCard(cards.map(item => item.key))) {
  const article = previewArticle(card, card.slug ?? "preview") as NewsPublicArticle;
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null, createElement(CinematicNewsList, { articles: [article] }))));
  applyEditTargetStamps(root as unknown as ParentNode, stamps.get(card.key)!);
  return root;
}
/** What the card's CSS module hides: `.scaled :global(.x), ... { display: none }`, as selectors the strict static DOM can match. */
function hiddenInNewsCard() {
  const css = readFileSync("components/admin/news/NewsCards.module.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = css.match(/([^{}]*)\{\s*display: none;\s*\}/g)!.map(item => item.replace(/\{[\s\S]*$/, "")).find(item => item.includes(".scaled :global(.news-heading)"))!;
  return rule.split(",").map(selector => selector.trim().replace(/^\.scaled /, "").replace(/:global\(([^)]*)\)/g, "$1"));
}

describe("News: the card stamps on the real public markup", () => {
  it("each field is on exactly the node that shows it, for every card", () => {
    for (const card of cards) {
      const root = cardRoot(card), kind = newsCategory(card.draft.category);
      expect(text(only(root, newsTarget(card.key, "cardHeading")))).toBe(card.draft.cardHeading);
      expect(only(root, newsTarget(card.key, "cardHeading")).tagName).toBe("h2");
      expect(text(only(root, newsTarget(card.key, "title")))).toBe(card.draft.title);
      expect(only(root, newsTarget(card.key, "title")).classList).toContain("news-card-title");
      expect(text(only(root, newsTarget(card.key, "category")))).toContain(kind.band);
      expect(only(root, newsTarget(card.key, "category")).classList).toContain("news-card-band");
      const cover = only(root, newsTarget(card.key, "cover"));
      if (card.draft.coverUrl) { expect(cover.tagName).toBe("img"); expect(cover.getAttribute("src")).toBe(card.draft.coverUrl); }
      else { expect(cover.tagName).toBe("span"); expect(cover.classList).toContain("news-cover-empty"); }
      expect([...stampedIds(root)].sort()).toEqual((["cardHeading", "title", "cover", "category"] as const).map(field => newsTarget(card.key, field)).sort());
    }
  });

  it("an unsaved article is stamped by its own id, and every card's ids belong to it alone", () => {
    const fresh = cards.find(card => card.key === NEWS_NEW_KEY)!;
    expect(text(only(cardRoot(fresh), newsTarget(NEWS_NEW_KEY, "title")))).toBe("A brand new article");
    for (const card of cards) for (const id of stampedIds(cardRoot(card))) expect(newsOwnsTarget(card.key, resolveEditTarget(id)!), id).toBe(true);
  });

  it("the ids come from the article's id, not from what is typed or where the card sits", () => {
    const [first, second] = cards;
    const typed = { ...first, draft: { ...first.draft, title: "A different title", cardHeading: "Another heading", category: "community" as const } };
    expect([...stampedIds(cardRoot(typed))].sort()).toEqual([...stampedIds(cardRoot(first))].sort());
    expect(text(only(cardRoot(typed), newsTarget(first.key, "title")))).toBe("A different title");
    // The same article in another position of the list, or the list in reverse: each card still carries its own ids.
    const reversed = newsStampsByCard(cards.map(card => card.key).reverse());
    expect(stampedIds(cardRoot(second, reversed)).every(id => id.includes(`.row:${second.key}.`))).toBe(true);
    expect(text(only(cardRoot(first, reversed), newsTarget(first.key, "title")))).toBe(first.draft.title);
  });

  it("the page-level parts carry no stamp, and the cover without a photo is still the stamped node", () => {
    const root = cardRoot(cards[0]);
    unstamped(root, ".news-heading h1");
    unstamped(root, ".news-legend");
    unstamped(root, ".news-legend li");
    unstamped(root, ".news-card-number");
    unstamped(root, ".news-card");
    unstamped(root, ".news-card-main");
    expect(cardRoot(cards.find(card => !card.draft.coverUrl)!).querySelectorAll(".news-cover-empty")).toHaveLength(1);
  });

  it("no stamped node is, or is inside, a node the card's CSS hides", () => {
    const hidden = hiddenInNewsCard();
    expect(hidden).toEqual([".news-heading", ".news-legend", ".news-card-number", ".partners"]);
    for (const card of cards) {
      const root = cardRoot(card);
      const stamped = [...root.descendants()].filter(node => node.hasAttribute(EDIT_TARGET_ATTRIBUTE));
      expect(stamped.length).toBeGreaterThan(0);
      for (const node of stamped) for (const selector of hidden) expect(node.closest(selector), `${node.getAttribute(EDIT_TARGET_ATTRIBUTE)} is inside ${selector}`).toBeNull();
    }
  });

  it("the declared fields with no node on a card are exactly the ones only the article page shows", () => {
    const present = new Set(cards.flatMap(card => stampedIds(cardRoot(card))));
    const missing = Object.values(EDIT_TARGET_REGISTRY.news.sections).flatMap((section, index) => (section.rowFields ?? []).map(field => `${Object.keys(EDIT_TARGET_REGISTRY.news.sections)[index]}.${field}`))
      .filter(name => ![...present].some(id => id.includes(`.${name.split(".")[0]}.row:`) && id.endsWith(`.${name.split(".")[1]}`)));
    expect(missing.sort()).toEqual(["article.actionHref", "article.actionLabel", "article.body", "details.publishedLocal", "details.subtitle", "photo.coverAlt"]);
  });

  it("every stamp selector matches exactly one node of the one-article card", () => {
    const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null, createElement(CinematicNewsList, { articles: [previewArticle(cards[0], "x") as NewsPublicArticle] }))));
    for (const stamp of newsCardStamps(cards[0].key)) expect(root.querySelectorAll(stamp.selector), stamp.selector).toHaveLength(1);
  });

  it("the public markup carries no id until the admin preview stamps it", () => {
    const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null, createElement(CinematicNewsList, { articles: [previewArticle(cards[0], "x") as NewsPublicArticle] }))));
    expect(stampedIds(root)).toEqual([]);
    expect(NEWS_IDS).toHaveLength(3);
  });
});

/* ---------------------------------------------------------------- Rose City Sponsors */
/** The carousel card's rows, as RoseCitySponsorsEditor's previewRows builds them from the draft. */
const rowsOf = (drafts: readonly SponsorDraft[]): DBSiteSponsorLogo[] => drafts.map((draft, index) => ({
  id: draft.id ?? `draft-${draft.key}`, placement: "carousel", name: draft.name.trim() || `Sponsor ${index + 1}`, logo_url: draft.logo_url, sort_order: index,
  show_on_homepage: true, show_in_footer: false, website_url: null, created_at: "",
}));
function stripRoot(drafts: readonly SponsorDraft[], strip = drafts.map(draft => ({ key: draft.key, logoUrl: draft.logo_url ?? "" }))) {
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null,
    createElement(CinematicSponsors, { sponsors: rowsOf(drafts), treatments: {}, heading: "Powered by our partners" }))));
  applyEditTargetStamps(root as unknown as ParentNode, sponsorStampsByPlace({ carousel: strip }).get("carousel")!);
  return root;
}

describe("Rose City Sponsors: the carousel stamps on the real public markup", () => {
  it("every logo, in the real set and in its clone, is stamped to the sponsor that draws it (by its picture)", () => {
    const drafts = sponsorDraftsFixture(), root = stripRoot(drafts);
    const sets = root.querySelectorAll(".sponsor-set");
    expect(sets).toHaveLength(2);
    expect(sets[0].getAttribute("aria-hidden")).toBeNull();
    expect(sets[1].getAttribute("aria-hidden")).toBe("true");
    for (const [setIndex, set] of sets.entries()) {
      const images = set.querySelectorAll("img");
      expect(images, `set ${setIndex}`).toHaveLength(drafts.length);
      for (const [index, image] of images.entries()) {
        expect(image.getAttribute("src")).toBe(sponsorLogoUrl(index));
        expect(image.getAttribute(EDIT_TARGET_ATTRIBUTE), `set ${setIndex} logo ${index}`).toBe(sponsorTarget(drafts[index].key, "logo"));
      }
    }
    for (const draft of drafts) expect(nodesFor(root, sponsorTarget(draft.key, "logo")), draft.key).toHaveLength(2);
    expect(stampedIds(root)).toHaveLength(drafts.length * 2);
  });

  it("the ids follow the sponsor's key when the sponsors are reordered, never the position", () => {
    const reversed = sponsorDraftsFixture().reverse(), root = stripRoot(reversed);
    for (const [index, set] of root.querySelectorAll(".sponsor-set").entries()) {
      void index;
      for (const [position, image] of set.querySelectorAll("img").entries()) {
        const draft = reversed[position];
        expect(image.getAttribute("src")).toBe(sponsorLogoUrl(SPONSOR_KEYS.indexOf(draft.key as (typeof SPONSOR_KEYS)[number])));
        expect(image.getAttribute(EDIT_TARGET_ATTRIBUTE)).toBe(sponsorTarget(draft.key, "logo"));
      }
    }
  });

  it("one sponsor and many sponsors map the same way; a name or website change moves no id", () => {
    const [first] = sponsorDraftsFixture();
    const one = stripRoot([first]);
    expect(nodesFor(one, sponsorTarget(first.key, "logo"))).toHaveLength(2);
    const renamed = sponsorDraftsFixture().map(draft => ({ ...draft, name: `${draft.name} renamed`, website: "x.test" }));
    expect([...stampedIds(stripRoot(renamed))].sort()).toEqual([...stampedIds(stripRoot(sponsorDraftsFixture()))].sort());
  });

  it("the heading is the Homepage's and carries no stamp; no sponsors draw nothing to stamp", () => {
    const root = stripRoot(sponsorDraftsFixture());
    unstamped(root, ".partners > h2");
    unstamped(root, ".sponsor-set");
    expect(stampedIds(stripRoot([], []))).toEqual([]);
    expect(sponsorStamps([])[0].target({ getAttribute: () => "https://media.test/any.webp" } as never, 0)).toBeNull();
  });

  it("the declared fields with no node on the preview are exactly the name and the website", () => {
    const present = new Set(stampedIds(stripRoot(sponsorDraftsFixture())));
    const missing = (EDIT_TARGET_REGISTRY.sponsors.sections.carousel.rowFields ?? []).filter(field => ![...present].some(id => id.endsWith(`.${field}`)));
    expect(missing).toEqual(["name", "website"]);
  });

  it("the public markup carries no id until the admin preview stamps it", () => {
    const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null, createElement(CinematicSponsors, { sponsors: rowsOf(sponsorDraftsFixture()), treatments: {}, heading: "h" }))));
    expect(stampedIds(root)).toEqual([]);
  });
});

describe("sponsor logos map by URL, so a failed logo never shifts the others (real CinematicSponsors)", () => {
  const cases: [string, number[]][] = [["the first logo fails", [0]], ["a middle logo fails", [1]], ["the first and last logos fail", [0, 2]]];
  it.each(cases)("%s: every logo still drawn opens its own sponsor, in the real set and the looping clone", (_, failed) => {
    const drafts = sponsorDraftsFixture();
    failed.forEach(index => failing.add(drafts[index].logo_url!));
    try {
      const root = stripRoot(drafts);
      const sets = root.querySelectorAll(".sponsor-set");
      expect(sets).toHaveLength(2);
      // The real component: the clone drew nothing for a failed logo, the real set drew a fallback box.
      expect(sets[1].querySelectorAll("img")).toHaveLength(drafts.length - failed.length);
      for (const image of root.querySelectorAll(".sponsor-set img")) {
        const owner = drafts.find(draft => draft.logo_url === image.getAttribute("src"))!;
        expect(image.getAttribute(EDIT_TARGET_ATTRIBUTE)).toBe(sponsorTarget(owner.key, "logo"));
      }
    } finally {
      failing.clear();
    }
  });

  it("two sponsors sharing one logo URL are told apart by their order in each set", () => {
    const drafts = sponsorDraftsFixture();
    drafts[2] = { ...drafts[2], logo_url: drafts[0].logo_url };
    const root = stripRoot(drafts);
    for (const set of root.querySelectorAll(".sponsor-set")) {
      const shared = set.querySelectorAll("img").filter(image => image.getAttribute("src") === drafts[0].logo_url);
      expect(shared.map(image => image.getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual([sponsorTarget(drafts[0].key, "logo"), sponsorTarget(drafts[2].key, "logo")]);
    }
  });
});
