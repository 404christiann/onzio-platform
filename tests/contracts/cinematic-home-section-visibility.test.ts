import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { HomepagePreviewContext } from "@/lib/homepage-editor/preview-context";
import { HOMEPAGE_PARTS, hiddenHomepageParts, type PartId } from "@/components/admin/homepage/homepage-parts";
import { layoutPartButtons } from "@/components/admin/homepage/HomepageOverviewPreview";

const club = { id: "00000000-0000-4000-8000-000000000001", slug: "rose-city", name: "Rose City FC", storeEnabled: true, presentationTemplateKey: "cinematic@2" };
const state = vi.hoisted(() => ({ content: null as unknown as CinematicHomepageContent }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => club }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: state.content, loading: false }) }));
vi.mock("@/lib/queries", () => ({
  fetchHomepageContent: vi.fn(), fetchSchedule: vi.fn(), fetchShopKitContent: vi.fn(), fetchSiteSponsorLogos: vi.fn(), fetchHomepageHeroContent: vi.fn(),
}));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicHome from "@/components/cinematic/CinematicHome";
import { PublicPageVisibilityProvider } from "@/components/PublicPageVisibilityProvider";
import type { PublicPageVisibility } from "@/lib/public-page-visibility";

type Section = "raffle" | "match" | "prices";
const content = (hidden: Section[] = []) => {
  const value = defaultCinematicHomepageContent();
  value.raffle = { assetId: null, url: "/raffle.png", alt: "Raffle", width: 1600, height: 500 };
  value.ticket = { assetId: null, url: "/ticket.png", alt: "Ticket", visible: true };
  value.prices.rows = [{ id: "adult", label: "Adult", price: "$12", description: "General admission", note: "", accent: "none" }];
  for (const key of hidden) value[key].visible = false;
  return value;
};
const publicHtml = (hidden: Section[] = []) => {
  state.content = content(hidden);
  return renderToStaticMarkup(createElement(CinematicHome, { initialHeroContent: null }));
};
const previewValue = (draftContent: CinematicHomepageContent) => ({
  draft: { ...homepageDraft(), revamp: draftContent }, videoSource: "", selection: null, select: () => undefined,
  allowedPieces: HOMEPAGE_PARTS.flatMap(part => part.pieces),
});
const previewHtml = (hidden: Section[] = []) => {
  state.content = content(hidden);
  return renderToStaticMarkup(createElement(HomepagePreviewContext.Provider, { value: previewValue(state.content) }, createElement(CinematicHome, { initialHeroContent: null })));
};
const RAFFLE_BLOCK = /<div><section class="artwork raffle"[\s\S]*?<\/section><\/div>/;
const piece = (id: string) => new RegExp(`<div[^>]*data-homepage-piece="${id}"[^>]*></div>`);

describe("public homepage: raffle, next match and ticket prices follow their switches", () => {
  it("renders all three when nothing is hidden, with the same markup as before the switches", () => {
    const html = publicHtml();
    expect(html).toContain('<section class="artwork raffle"');
    expect(html).toContain('<section class="ticket-cards" aria-label="Next home match and ticket prices"');
    expect(html).toContain('class="match-card"');
    expect(html).toContain('class="prices-card"');
    expect(html).not.toContain("ticket-cards--single");
  });

  it("leaves nothing of a hidden raffle on the public page, not even its wrapper", () => {
    const shown = publicHtml();
    const hidden = publicHtml(["raffle"]);
    expect(shown).toMatch(RAFFLE_BLOCK);
    expect(hidden).not.toContain("raffle");
    expect(hidden).toBe(shown.replace(RAFFLE_BLOCK, ""));
    expect(hidden).toContain('class="ticket-cards"');
  });

  it("drops a hidden match card and lays the prices card out alone", () => {
    const html = publicHtml(["match"]);
    expect(html).not.toContain("match-card");
    expect(html).not.toContain("ticket-buy");
    expect(html).toContain('class="prices-card"');
    expect(html).toContain('class="ticket-cards ticket-cards--single"');
  });

  it("drops hidden prices and lays the match card out alone", () => {
    const html = publicHtml(["prices"]);
    expect(html).not.toContain("prices-card");
    expect(html).not.toContain("General admission");
    expect(html).toContain('class="match-card"');
    expect(html).toContain('class="ticket-cards ticket-cards--single"');
  });

  it("removes the whole cards section when both are hidden", () => {
    const html = publicHtml(["match", "prices"]);
    expect(html).not.toContain("ticket-cards");
    expect(html).not.toContain("Next home match and ticket prices");
    // The ticket and map artwork below it is its own switch and stays.
    expect(html).toContain("ticket-art");
  });

  it("hides all three together and keeps the rest of the page", () => {
    const html = publicHtml(["raffle", "match", "prices"]);
    for (const gone of ["raffle", "ticket-cards", "match-card", "prices-card"]) expect(html).not.toContain(gone);
    expect(html).toContain("ticket-art");
    expect(html).toContain('class="slideshow"');
    expect(html).not.toContain("data-homepage-piece");
  });
});

describe("homepage editor preview: a hidden section stays selectable but shows nothing", () => {
  it("wraps a shown section in its piece, as before", () => {
    const html = previewHtml();
    expect(html).toMatch(/<div[^>]*data-homepage-piece="revamp.raffle"[^>]*><section class="artwork raffle"/);
    expect(html).toMatch(/<article[^>]*data-homepage-piece="revamp.match"[^>]*class="match-card"/);
    expect(html).toMatch(/<article[^>]*data-homepage-piece="revamp.prices"[^>]*class="prices-card"/);
  });

  it("keeps an empty selectable wrapper for a hidden raffle", () => {
    const html = previewHtml(["raffle"]);
    expect(html).toMatch(piece("revamp.raffle"));
    expect(html).toMatch(/<div(?=[^>]*role="button")(?=[^>]*tabindex="0")(?=[^>]*aria-label="Raffle artwork")[^>]*data-homepage-piece="revamp.raffle"[^>]*><\/div>/);
    expect(html).not.toContain("artwork raffle");
  });

  it("keeps empty selectable wrappers outside the cards grid for hidden cards, so the other card lays out alone", () => {
    const matchHidden = previewHtml(["match"]);
    expect(matchHidden).toMatch(piece("revamp.match"));
    expect(matchHidden).not.toContain("match-card");
    expect(matchHidden.indexOf('data-homepage-piece="revamp.match"')).toBeLessThan(matchHidden.indexOf('<section class="ticket-cards ticket-cards--single"'));
    expect(matchHidden).toMatch(/<article[^>]*data-homepage-piece="revamp.prices"[^>]*class="prices-card"/);
    const pricesHidden = previewHtml(["prices"]);
    expect(pricesHidden).toMatch(piece("revamp.prices"));
    expect(pricesHidden).not.toContain("prices-card");
    expect(pricesHidden.indexOf('data-homepage-piece="revamp.prices"')).toBeLessThan(pricesHidden.indexOf('<section class="ticket-cards ticket-cards--single"'));
  });

  it("drops the cards section but keeps both wrappers when both are hidden", () => {
    const html = previewHtml(["match", "prices"]);
    expect(html).not.toContain("ticket-cards");
    expect(html).toMatch(piece("revamp.match"));
    expect(html).toMatch(piece("revamp.prices"));
  });
});

describe("homepage Overview: hidden parts", () => {
  it("names the parts the owner switched off", () => {
    const draft = (hidden: Section[], ticket = true) => { const value = content(hidden); value.ticket.visible = ticket; return { ...homepageDraft(), revamp: value }; };
    expect([...hiddenHomepageParts(draft([]))]).toEqual([]);
    expect([...hiddenHomepageParts(draft(["raffle", "prices"]))].sort()).toEqual(["prices", "raffle"]);
    expect([...hiddenHomepageParts(draft(["match"], false))].sort()).toEqual(["match", "ticket"]);
    expect([...hiddenHomepageParts(homepageDraft())]).toEqual([]);
  });

  it("stacks the pills of hidden parts that share one point on the page, so none covers another", () => {
    const flat = (top: number) => [{ top, left: 0, width: 1200, height: 0 }];
    const measured = { total: 3000, rects: { hero: [{ top: 0, left: 0, width: 1200, height: 500 }], raffle: flat(500), match: flat(500), prices: flat(500), ticket: flat(1400) } };
    const numbers = { raffle: [2], match: [3], prices: [4], ticket: [5] } as Partial<Record<PartId, number[]>>;
    const pills = layoutPartButtons(HOMEPAGE_PARTS, measured, numbers, 0, 3000, 1).filter(button => button.hidden);
    expect(pills.map(button => button.part)).toEqual(["raffle", "match", "prices", "ticket"]);
    const [raffle, match, prices, ticket] = pills;
    expect(raffle.top).toBe(500);
    expect(match.top - raffle.top).toBeGreaterThanOrEqual(40);
    expect(prices.top - match.top).toBeGreaterThanOrEqual(40);
    // A pill with room of its own stays where its part is.
    expect(ticket.top).toBe(1400);
  });
});

describe("homepage cards CSS: one card alone", () => {
  const css = readFileSync("components/cinematic/cinematic.css", "utf8");
  it("centres a lone card in one column inside the desktop-only block and leaves the phone layout alone", () => {
    // The desktop block is the last thing in the file and holds only wider-than-1024px rules.
    const marker = "/* RC-DESKTOP-FIT: desktop fit, wider than 1024px only. */";
    const desktop = css.slice(css.indexOf(marker) + marker.length).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(desktop.startsWith("@media (min-width:1025px){")).toBe(true);
    const single = desktop.match(/\.cinematic-site \.ticket-cards--single\{([^}]*)\}/);
    expect(single?.[1]).toContain("grid-template-columns:minmax(0,");
    expect(single?.[1]).toContain("justify-content:center");
    expect(css.indexOf("ticket-cards--single")).toBeGreaterThan(css.indexOf(".cinematic-site .ticket-cards{display:grid;grid-template-columns:1.22fr 1fr"));
    // Phones keep the existing one-column grid; nothing outside the desktop block mentions the single-card class.
    expect(css).toMatch(/@media\(max-width:1024px\)\{[^@]*\.cinematic-site \.ticket-cards\{grid-template-columns:1fr;/);
    expect(css.slice(0, css.indexOf(marker))).not.toContain("ticket-cards--single");
  });
});

describe("public homepage: the next-match button never leads to a hidden page", () => {
  const withVisibility = (visibility: PublicPageVisibility, buttonHref = "/tickets") => {
    state.content = content(); state.content.match.buttonHref = buttonHref;
    return renderToStaticMarkup(createElement(PublicPageVisibilityProvider, { visibility, children: createElement(CinematicHome, { initialHeroContent: null }) }));
  };
  it("shows the button while Single match tickets is visible", () => {
    for (const visibility of [{}, { tickets: true }, { "season-membership": false }, { stadium: false }] as PublicPageVisibility[]) expect(withVisibility(visibility)).toContain('href="/tickets"');
  });
  it("drops the button, keeping the card, when its page is hidden", () => {
    const html = withVisibility({ tickets: false });
    expect(html).toContain('class="match-card"');
    expect(html).not.toContain("ticket-buy");
  });
  it("keeps a button that points at a page still shown", () => {
    expect(withVisibility({ tickets: false }, "/schedule")).toContain('href="/schedule"');
  });
});
