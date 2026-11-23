import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { kbygFixture, kbygFixtureMedia, seasonFixture, seasonFixtureMedia, ticketPageFixtureUrl } from "../fixtures/visitor-click-fixtures";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY } from "@/lib/admin-edit-targets";
import { emptyTicketPageContent, ticketPageView, type KnowBeforeYouGoContent, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import type { Fixture } from "@/lib/data";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { KBYG_SPEC, SEASON_SPEC, type KbygSectionId, type SeasonSectionId } from "@/components/admin/ticket-pages/ticket-page-sections";
import { KBYG_TARGETS, SEASON_TARGETS, kbygPreviewStamps, seasonPreviewStamps } from "@/components/admin/ticket-pages/ticket-page-edit-targets";

/**
 * UI-PREVIEW-CLICK-VISITOR-3: the Season Ticket Membership and Know Before You Go card stamps, run against the real public
 * markup (CinematicSeasonMembership, KnowBeforeYouGoView) rendered the way each card renders it: the draft with only that card's
 * part on (SEASON_SPEC / KBYG_SPEC sectionOnly), hydrated with the page's media, placeholders on, inside `div.only[data-only]`.
 * Each stamp must land on exactly the node that shows its field's draft text or image, and never on a node the card's CSS hides.
 */
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", name: "Rose City FC" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png", brandingPending: false }) }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ useClubTimeZone: () => "America/Los_Angeles" }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: { match: { emptyMessage: "Homepage empty message" } } }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: () => new Promise(() => undefined), fetchSiteSocialLinks: async () => [] }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";
import { KnowBeforeYouGoView } from "@/components/cinematic/CinematicKnowBeforeYouGo";

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
/** The declared fields of one editor that have no stamped node in any card, as `section.field` / `section.row.field`. */
function missingFields(editor: keyof typeof EDIT_TARGET_REGISTRY, stampedFor: (section: string) => StaticElement) {
  const missing: string[] = [];
  for (const [section, spec] of Object.entries(EDIT_TARGET_REGISTRY[editor].sections)) {
    const present = new Set(stampedIds(stampedFor(section)));
    for (const field of spec.fields ?? []) if (!present.has(`${editor}.${section}.${field}`)) missing.push(`${section}.${field}`);
    for (const field of spec.rowFields ?? []) if (![...present].some(id => id.includes(".row:") && id.endsWith(`.${field}`))) missing.push(`${section}.row.${field}`);
  }
  return missing;
}

/** What each card's CSS hides (components/admin/ticket-pages/ticket-editors.module.css), as selectors the strict static DOM can match. */
const HIDDEN_BY_CSS = (() => {
  const css = readFileSync("components/admin/ticket-pages/ticket-editors.module.css", "utf8"), hidden: Record<string, string[]> = {};
  for (const match of css.matchAll(/^\.only\[data-only="(\w+)"\] ([^,{]+?)(?:,|\s*\{)/gm)) (hidden[match[1]] ??= []).push(match[2].replace(/:global\(([^)]*)\)/g, "$1").trim());
  return hidden;
})();
const PAGE_CARDS = [...SEASON_SPEC.sections, ...KBYG_SPEC.sections].map(section => section.id);

/* ---------------------------------------------------------------- Season Ticket Membership */
function seasonRoot(draft: SeasonMembershipContent, section: SeasonSectionId, stampsFrom: SeasonMembershipContent = draft) {
  const view = ticketPageView<"season-membership">(SEASON_SPEC.sectionOnly(draft, section), seasonFixtureMedia(draft));
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": section }, createElement(CinematicSeasonMembership, { content: view, placeholders: true }))));
  applyEditTargetStamps(root as unknown as ParentNode, seasonPreviewStamps(stampsFrom, section));
  return root;
}
const season = seasonFixture();
const seat = (id: string, field: string) => `seasonMembership.pricing.row:${id}.${field}`;

describe("Season Ticket Membership stamps on the real public markup", () => {
  it("heading: the title and the red subtitle", () => {
    const root = seasonRoot(season, "heading");
    expect(only(root, SEASON_TARGETS.headingTitle).tagName).toBe("h1");
    expect(text(only(root, SEASON_TARGETS.headingTitle))).toBe("Season Ticket Membership");
    expect(only(root, SEASON_TARGETS.headingSubtitle).tagName).toBe("p");
    expect(text(only(root, SEASON_TARGETS.headingSubtitle))).toBe("Join the Rose City family");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("intro: the introduction, the list heading, and each highlight and included item by position", () => {
    const root = seasonRoot(season, "intro");
    expect(text(only(root, SEASON_TARGETS.introText))).toBe("Become a season ticket member.");
    expect(only(root, SEASON_TARGETS.introIncludesHeading).tagName).toBe("h2");
    expect(text(only(root, SEASON_TARGETS.introIncludesHeading))).toBe("Membership includes");
    season.intro.highlights.forEach((item, index) => { expect(only(root, `seasonMembership.intro.row:${index}.highlight`).tagName).toBe("li"); expect(text(only(root, `seasonMembership.intro.row:${index}.highlight`))).toBe(item); });
    season.intro.includes.forEach((item, index) => expect(text(only(root, `seasonMembership.intro.row:${index}.include`))).toBe(item));
    expect(stampedIds(root)).toHaveLength(2 + season.intro.highlights.length + season.intro.includes.length);
  });

  it("intro with no highlights: the included list, now the page's first list, keeps its own ids; with no included items only highlights are stamped", () => {
    const none = structuredClone(season);
    none.intro.highlights = [];
    const root = seasonRoot(none, "intro");
    expect(root.querySelectorAll(".tp-copy > ul.tp-bullets")).toHaveLength(1);
    expect(nodesFor(root, "seasonMembership.intro.row:0.highlight")).toHaveLength(0);
    expect(text(only(root, "seasonMembership.intro.row:1.include"))).toBe("A member card");
    const noIncludes = structuredClone(season);
    noIncludes.intro.includes = [];
    const other = seasonRoot(noIncludes, "intro");
    expect(other.querySelectorAll(".tp-copy > h2.tp-includes")).toHaveLength(0);
    expect(stampedIds(other).filter(id => id.includes(".row:"))).toEqual(["seasonMembership.intro.row:0.highlight", "seasonMembership.intro.row:1.highlight"]);
  });

  it("pricing: the section label, each column, and each row's name, prices and badge by the row's id", () => {
    const root = seasonRoot(season, "pricing");
    expect(only(root, SEASON_TARGETS.pricingSectionLabel).tagName).toBe("th");
    expect(text(only(root, SEASON_TARGETS.pricingSectionLabel))).toBe("Section");
    season.pricing.columns.forEach((column, index) => { expect(only(root, `seasonMembership.pricing.row:${index}.column`).tagName).toBe("th"); expect(text(only(root, `seasonMembership.pricing.row:${index}.column`))).toBe(column); });
    season.pricing.rows.forEach(row => {
      expect(only(root, seat(row.id, "name")).tagName).toBe("span");
      expect(text(only(root, seat(row.id, "name")))).toBe(row.name);
      row.prices.forEach((price, column) => { expect(only(root, seat(row.id, `price${column}`)).tagName).toBe("td"); expect(text(only(root, seat(row.id, `price${column}`)))).toBe(price); });
      expect(only(root, seat(row.id, "badgeAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", row.id));
      expect(only(root, seat(row.id, "badgeAlt")).getAttribute("alt")).toBe(`${row.id} picture`);
    });
    expect(only(root, SEASON_TARGETS.pricingFootnote).tagName).toBe("p");
    expect(text(only(root, SEASON_TARGETS.pricingFootnote))).toBe("Prices include fees.");
    expect(stampedIds(root)).toHaveLength(2 + 3 + season.pricing.rows.length * 5);
    // The Buy button belongs to the Buy button card: this card does not draw it.
    expect(root.querySelectorAll(".tp-buy")).toHaveLength(0);
  });

  it("pricing: a row whose badge is not set has no image stamp (the dashed placeholder is not a picture) and does not shift the others", () => {
    const gap = structuredClone(season);
    gap.images["seat-general"] = { assetId: null, alt: "" };
    const root = seasonRoot(gap, "pricing");
    expect(root.querySelectorAll(".tp-seat > span.tp-slot")).toHaveLength(1);
    expect(nodesFor(root, seat("seat-general", "badgeAlt"))).toHaveLength(0);
    expect(text(only(root, seat("seat-general", "name")))).toBe("General Seating");
    expect(only(root, seat("seat-reserved", "badgeAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", "seat-reserved"));
    expect(only(root, seat("seat-club", "badgeAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", "seat-club"));
  });

  it("button: the Buy button's words are the label's node; the closing heading and ticket picture the card hides carry no id", () => {
    const root = seasonRoot(season, "button");
    expect(only(root, SEASON_TARGETS.buttonLabel).tagName).toBe("a");
    expect(only(root, SEASON_TARGETS.buttonLabel).getAttribute("href")).toBe("https://tickets.test/season");
    expect(text(only(root, SEASON_TARGETS.buttonLabel))).toBe("Buy Season Membership");
    expect(stampedIds(root)).toEqual([SEASON_TARGETS.buttonLabel]);
    unstamped(root, ".tp-closing > h2, .tp-closing > img.tp-ticket");
    expect(text(root.querySelectorAll(".tp-closing > h2")[0])).toBe("Become a member today");
    expect(nodesFor(root, SEASON_TARGETS.buttonHref)).toHaveLength(0);
  });

  it("button with no link yet: the inactive button is still the label's node", () => {
    const noLink = structuredClone(season);
    noLink.button.href = "";
    const root = seasonRoot(noLink, "button");
    expect(only(root, SEASON_TARGETS.buttonLabel).tagName).toBe("span");
    expect(text(only(root, SEASON_TARGETS.buttonLabel))).toBe("Buy Season Membership");
  });

  it("benefits: the heading and each benefit's label and icon by the benefit's id", () => {
    const root = seasonRoot(season, "benefits");
    expect(only(root, SEASON_TARGETS.benefitsHeading).tagName).toBe("h2");
    expect(text(only(root, SEASON_TARGETS.benefitsHeading))).toBe("Member Benefits");
    season.benefits.items.forEach(item => {
      expect(only(root, `seasonMembership.benefits.row:${item.id}.label`).tagName).toBe("p");
      expect(text(only(root, `seasonMembership.benefits.row:${item.id}.label`))).toBe(item.label);
      expect(only(root, `seasonMembership.benefits.row:${item.id}.iconAlt`).getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", item.id));
    });
    expect(stampedIds(root)).toHaveLength(1 + season.benefits.items.length * 2);
  });

  it("closing: the heading and the ticket picture, and no Buy button in this card", () => {
    const root = seasonRoot(season, "closing");
    expect(text(only(root, SEASON_TARGETS.closingHeading))).toBe("Become a member today");
    expect(only(root, SEASON_TARGETS.closingTicketImageAlt).getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", "ticket"));
    expect(only(root, SEASON_TARGETS.closingTicketImageAlt).getAttribute("alt")).toBe("ticket picture");
    expect(stampedIds(root)).toHaveLength(2);
    expect(root.querySelectorAll(".tp-buy")).toHaveLength(0);
  });

  it("with a filled draft every declared field has its node except the Buy button's link, which is the label's own node", () => {
    expect(missingFields("seasonMembership", section => seasonRoot(season, section as SeasonSectionId))).toEqual(["button.href"]);
  });

  it("with a bare draft exactly these declared fields have no node on the page", () => {
    const bare = emptyTicketPageContent("season-membership");
    expect(missingFields("seasonMembership", section => seasonRoot(bare, section as SeasonSectionId))).toEqual([
      "heading.subtitle", "intro.text", "intro.includesHeading", "intro.row.highlight", "intro.row.include",
      "pricing.sectionLabel", "pricing.footnote", "pricing.row.column", "pricing.row.name", "pricing.row.price0", "pricing.row.price1", "pricing.row.price2", "pricing.row.badgeAlt",
      "button.href", "benefits.heading", "benefits.row.label", "benefits.row.iconAlt", "closing.heading", "closing.ticketImageAlt",
    ]);
  });

  it("every stamped id belongs to the card it is on, and the public page markup has none of its own", () => {
    for (const section of SEASON_SPEC.sections) for (const id of stampedIds(seasonRoot(season, section.id as SeasonSectionId))) expect(id.startsWith(`seasonMembership.${section.id}.`), id).toBe(true);
    const page = ticketPageView<"season-membership">(season, seasonFixtureMedia(season));
    expect(renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: page }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Season Ticket Membership stamps follow the draft", () => {
  it("reordered price rows and benefits keep their ids: the id moves with the row", () => {
    const moved = structuredClone(season);
    moved.pricing.rows.reverse();
    moved.benefits.items.reverse();
    const pricing = seasonRoot(moved, "pricing");
    const names = pricing.querySelectorAll(".tp-seat > span:not(.tp-badge)");
    expect(names.map(text)).toEqual(["Club Seating", "Reserved Seating", "General Seating"]);
    expect(names.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual([seat("seat-club", "name"), seat("seat-reserved", "name"), seat("seat-general", "name")]);
    expect(text(only(pricing, seat("seat-club", "price0")))).toBe("$30");
    expect(text(only(pricing, seat("seat-general", "price2")))).toBe("$3");
    expect(only(pricing, seat("seat-club", "badgeAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", "seat-club"));
    const benefits = seasonRoot(moved, "benefits");
    expect(text(only(benefits, "seasonMembership.benefits.row:benefit-raffle.label"))).toBe("Raffle entry");
    expect(benefits.querySelectorAll(".tp-benefit-tiles > li > p")[0].getAttribute(EDIT_TARGET_ATTRIBUTE)).toBe("seasonMembership.benefits.row:benefit-raffle.label");
    expect(only(benefits, "seasonMembership.benefits.row:benefit-raffle.iconAlt").getAttribute("src")).toBe(ticketPageFixtureUrl("season-membership", "benefit-raffle"));
  });

  it("an added row is stamped by its id and a removed one leaves no stamp", () => {
    const more = structuredClone(season);
    more.pricing.rows.push({ id: "seat-vip", name: "VIP", prices: ["$50", "$60", "$10"] });
    more.images["seat-vip"] = { assetId: null, alt: "" };
    expect(text(only(seasonRoot(more, "pricing"), seat("seat-vip", "name")))).toBe("VIP");
    const fewer = structuredClone(season);
    fewer.pricing.rows.length = 1;
    expect(stampedIds(seasonRoot(fewer, "pricing")).filter(id => id.includes(".row:seat-")).sort()).toEqual([seat("seat-general", "name"), seat("seat-general", "badgeAlt"), seat("seat-general", "price0"), seat("seat-general", "price1"), seat("seat-general", "price2")].sort());
  });

  it("stamps built from a stale draft never throw and never stamp a row the page no longer has", () => {
    const stale = structuredClone(season);
    stale.pricing.rows.length = 1;
    const root = seasonRoot(season, "pricing", stale);
    expect(nodesFor(root, seat("seat-club", "name"))).toHaveLength(0);
    expect(text(only(root, seat("seat-general", "name")))).toBe("General Seating");
    expect(stampedIds(root).filter(id => id.includes(".row:seat-reserved") || id.includes(".row:seat-club"))).toEqual([]);
  });

  it("a hidden part has no node and so no stamp, and its card stamps nothing else", () => {
    const hidden = structuredClone(season);
    hidden.pricing.rows = [];
    expect(stampedIds(seasonRoot(hidden, "pricing"))).toEqual([]);
  });
});

/* ---------------------------------------------------------------- Know Before You Go */
const SCHEDULE_MATCH: Fixture = { id: "m1", date: "2027-04-10", opponent: "Pasadena Rovers", opponentShortName: "Rovers", competition: "Schedule competition", home: true, time: "19:00", venue: "Robinson Stadium" };
function kbygRoot(draft: KnowBeforeYouGoContent, section: KbygSectionId, options: { fixture?: Fixture | null; youtubeChannel?: string; stampsFrom?: KnowBeforeYouGoContent } = {}) {
  const view = ticketPageView<"know-before-you-go">(KBYG_SPEC.sectionOnly(draft, section), kbygFixtureMedia(draft));
  const match = { loading: false, fixture: options.fixture === undefined ? SCHEDULE_MATCH : options.fixture, clubShortName: "Rose City", youtubeChannel: options.youtubeChannel };
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": section }, createElement(KnowBeforeYouGoView, { content: view, match, placeholders: true }))));
  applyEditTargetStamps(root as unknown as ParentNode, kbygPreviewStamps(options.stampsFrom ?? draft, section));
  return root;
}
const kbyg = kbygFixture();
const tile = (id: string, field: string) => `knowBeforeYouGo.facts.row:${id}.${field}`;

describe("Know Before You Go stamps on the real public markup", () => {
  it("heading: the title and the red subtitle", () => {
    const root = kbygRoot(kbyg, "heading");
    expect(only(root, KBYG_TARGETS.headingTitle).tagName).toBe("h1");
    expect(text(only(root, KBYG_TARGETS.headingTitle))).toBe("Know Before You Go");
    expect(text(only(root, KBYG_TARGETS.headingSubtitle))).toBe("Match day made easy");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("match: the watch line and the YouTube logo; Schedule's fixture, competition and crests carry no id", () => {
    const root = kbygRoot(kbyg, "match");
    expect(only(root, KBYG_TARGETS.matchWatchLabel).tagName).toBe("a");
    expect(only(root, KBYG_TARGETS.matchWatchLabel).getAttribute("href")).toBe("https://youtube.test/live");
    expect(text(only(root, KBYG_TARGETS.matchWatchLabel))).toBe("Watch live on");
    expect(only(root, KBYG_TARGETS.matchYoutubeImageAlt).tagName).toBe("img");
    expect(only(root, KBYG_TARGETS.matchYoutubeImageAlt).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "youtube"));
    expect(only(root, KBYG_TARGETS.matchYoutubeImageAlt).getAttribute("alt")).toBe("youtube picture");
    expect(stampedIds(root)).toHaveLength(2);
    unstamped(root, ".tp-competition, .tp-date, .tp-teams, .tp-teams strong, .tp-crest");
    expect(text(root.querySelectorAll(".tp-competition")[0])).toBe("Schedule competition");
    expect(text(root.querySelectorAll(".tp-date")[0])).toContain("Robinson Stadium");
  });

  it("match, no Schedule match: Homepage's empty-match message and, when the match has no competition, the line under it carry no id either", () => {
    const empty = kbygRoot(kbyg, "match", { fixture: null });
    unstamped(empty, ".tp-date");
    expect(text(empty.querySelectorAll(".tp-date")[0])).toBe("Homepage empty message");
    expect(stampedIds(empty)).toHaveLength(2);
    const noCompetition = kbygRoot(kbyg, "match", { fixture: { ...SCHEDULE_MATCH, competition: null } });
    expect(text(noCompetition.querySelectorAll(".tp-competition")[0])).toBe("USL League Two");
    unstamped(noCompetition, ".tp-competition");
  });

  it("match: with no stream link the watch line falls back to the channel link, or is a plain line; either way it is the label's node", () => {
    const noLink = structuredClone(kbyg);
    noLink.match.watchHref = "";
    const channel = kbygRoot(noLink, "match", { youtubeChannel: "https://youtube.test/channel" });
    expect(only(channel, KBYG_TARGETS.matchWatchLabel).getAttribute("href")).toBe("https://youtube.test/channel");
    const plain = kbygRoot(noLink, "match");
    expect(only(plain, KBYG_TARGETS.matchWatchLabel).tagName).toBe("p");
    expect(text(only(plain, KBYG_TARGETS.matchWatchLabel))).toBe("Watch live on");
  });

  it("facts: each tile's label and icon by the tile's id", () => {
    const root = kbygRoot(kbyg, "facts");
    kbyg.facts.tiles.forEach(item => {
      expect(only(root, tile(item.id, "label")).tagName).toBe("p");
      expect(text(only(root, tile(item.id, "label")))).toBe(item.label);
      expect(only(root, tile(item.id, "iconAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", item.id));
      expect(only(root, tile(item.id, "iconAlt")).getAttribute("alt")).toBe(`${item.id} picture`);
    });
    expect(stampedIds(root)).toHaveLength(kbyg.facts.tiles.length * 2);
  });

  it("raffle: the heading, the prize line, the photo and the text (shown without its ** marks)", () => {
    const root = kbygRoot(kbyg, "raffle");
    expect(only(root, KBYG_TARGETS.raffleHeading).tagName).toBe("h2");
    expect(text(only(root, KBYG_TARGETS.raffleHeading))).toBe("Halftime raffle");
    expect(text(only(root, KBYG_TARGETS.raffleSubheading))).toBe("Win a PlayStation 5");
    expect(only(root, KBYG_TARGETS.raffleImageAlt).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "raffle"));
    expect(only(root, KBYG_TARGETS.raffleBody).tagName).toBe("p");
    expect(text(only(root, KBYG_TARGETS.raffleBody))).toBe("Enter at the fan table before halftime.");
    expect(stampedIds(root)).toHaveLength(4);
  });

  it("donor: the heading, the logo, the text and the button's words; the name the editor never shows and the button's link carry no node", () => {
    const root = kbygRoot(kbyg, "donor");
    expect(text(only(root, KBYG_TARGETS.donorHeading))).toBe("Raffle donor");
    expect(only(root, KBYG_TARGETS.donorImageAlt).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "donor"));
    expect(text(only(root, KBYG_TARGETS.donorBody))).toBe("Thanks to our donor.");
    expect(only(root, KBYG_TARGETS.donorButtonLabel).tagName).toBe("a");
    expect(only(root, KBYG_TARGETS.donorButtonLabel).getAttribute("href")).toBe("https://donor.test");
    expect(text(only(root, KBYG_TARGETS.donorButtonLabel))).toBe("Visit the donor");
    expect(stampedIds(root)).toHaveLength(4);
    // Cards always draw the logo's slot (placeholders), so the donor's name is never on the page here.
    expect(root.querySelectorAll(".tp-donor-name")).toHaveLength(0);
  });

  it("with a filled draft exactly these declared fields have no node: the competition line, the two links and the donor name", () => {
    expect(missingFields("knowBeforeYouGo", section => kbygRoot(kbyg, section as KbygSectionId))).toEqual(["match.competition", "match.watchHref", "donor.name", "donor.buttonHref"]);
  });

  it("with a bare draft exactly these declared fields have no node on the page", () => {
    const bare = emptyTicketPageContent("know-before-you-go");
    expect(missingFields("knowBeforeYouGo", section => kbygRoot(bare, section as KbygSectionId))).toEqual([
      "heading.subtitle", "match.competition", "match.watchHref", "match.youtubeImageAlt", "facts.row.label", "facts.row.iconAlt",
      "raffle.heading", "raffle.subheading", "raffle.imageAlt", "raffle.body", "donor.heading", "donor.name", "donor.imageAlt", "donor.body", "donor.buttonLabel", "donor.buttonHref",
    ]);
  });

  it("every stamped id belongs to the card it is on, and the public page markup has none of its own", () => {
    for (const section of KBYG_SPEC.sections) for (const id of stampedIds(kbygRoot(kbyg, section.id as KbygSectionId))) expect(id.startsWith(`knowBeforeYouGo.${section.id}.`), id).toBe(true);
    const page = ticketPageView<"know-before-you-go">(kbyg, kbygFixtureMedia(kbyg));
    expect(renderToStaticMarkup(createElement(KnowBeforeYouGoView, { content: page, match: { loading: false, fixture: SCHEDULE_MATCH, clubShortName: "Rose City" } }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Know Before You Go stamps follow the draft", () => {
  it("reordered tiles keep their ids: the id moves with the tile", () => {
    const moved = structuredClone(kbyg);
    moved.facts.tiles.reverse();
    const root = kbygRoot(moved, "facts");
    const labels = root.querySelectorAll(".tp-fact-tiles > li > p");
    expect(labels.map(text)).toEqual(["Park at Lot 5", "Clear bags only", "Gates open at 5pm"]);
    expect(labels.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual([tile("tile-park", "label"), tile("tile-bag", "label"), tile("tile-gates", "label")]);
    expect(only(root, tile("tile-park", "iconAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "tile-park"));
    expect(only(root, tile("tile-gates", "iconAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "tile-gates"));
  });

  it("a tile whose icon is not set has no image stamp and does not shift the other tiles' icons", () => {
    const gap = structuredClone(kbyg);
    gap.images["tile-gates"] = { assetId: null, alt: "" };
    const root = kbygRoot(gap, "facts");
    expect(nodesFor(root, tile("tile-gates", "iconAlt"))).toHaveLength(0);
    expect(text(only(root, tile("tile-gates", "label")))).toBe("Gates open at 5pm");
    expect(only(root, tile("tile-bag", "iconAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "tile-bag"));
    expect(only(root, tile("tile-park", "iconAlt")).getAttribute("src")).toBe(ticketPageFixtureUrl("know-before-you-go", "tile-park"));
  });

  it("an added tile is stamped by its id and a removed one leaves no stamp; stale stamps never reach a tile the page does not have", () => {
    const more = structuredClone(kbyg);
    more.facts.tiles.push({ id: "tile-water", label: "Bring water" });
    more.images["tile-water"] = { assetId: null, alt: "" };
    expect(text(only(kbygRoot(more, "facts"), tile("tile-water", "label")))).toBe("Bring water");
    const fewer = structuredClone(kbyg);
    fewer.facts.tiles.length = 1;
    expect(stampedIds(kbygRoot(fewer, "facts")).sort()).toEqual([tile("tile-gates", "label"), tile("tile-gates", "iconAlt")].sort());
    const root = kbygRoot(kbyg, "facts", { stampsFrom: fewer });
    expect(stampedIds(root).sort()).toEqual([tile("tile-gates", "label"), tile("tile-gates", "iconAlt")].sort());
  });
});

/* ---------------------------------------------------------------- hidden sections */
describe("Season and Know Before You Go cards stamp only the visible section's nodes", () => {
  it("the CSS the cards rely on hides what has no flag: the rules this test reads exist", () => {
    expect(HIDDEN_BY_CSS.button).toEqual([".tp-closing > :not(.tp-buy)"]);
    for (const card of ["match", "facts", "raffle", "donor"]) expect(HIDDEN_BY_CSS[card], card).toEqual([".tp-heading"]);
  });

  it.each(PAGE_CARDS)("%s: no stamped node is inside, or is, a node the card's CSS hides", id => {
    for (const root of [...(SEASON_SPEC.sections.some(section => section.id === id) ? [seasonRoot(season, id as SeasonSectionId)] : []), ...(KBYG_SPEC.sections.some(section => section.id === id) ? [kbygRoot(kbyg, id as KbygSectionId)] : [])]) {
      const stamped = [...root.descendants()].filter(node => node.hasAttribute(EDIT_TARGET_ATTRIBUTE));
      expect(stamped.length).toBeGreaterThan(0);
      for (const node of stamped) for (const selector of HIDDEN_BY_CSS[id] ?? []) expect(node.closest(selector), `${node.getAttribute(EDIT_TARGET_ATTRIBUTE)} is inside ${selector}`).toBeNull();
    }
  });

  it("the hidden markup is really on the page, and carries no stamp", () => {
    // Know Before You Go: the banner is in every other card's DOM (hidden by CSS).
    for (const section of ["match", "facts", "raffle", "donor"] as const) {
      const root = kbygRoot(kbyg, section);
      unstamped(root, ".tp-heading, .tp-heading h1, .tp-heading p");
      expect(text(root.querySelectorAll(".tp-heading h1")[0])).toBe("Know Before You Go");
    }
    // Season: the banner is only a screen-reader heading outside its own card, and is not stamped.
    for (const section of ["intro", "pricing", "button", "benefits", "closing"] as const) {
      const root = seasonRoot(season, section);
      expect(root.querySelectorAll(".tp-heading")).toHaveLength(0);
      unstamped(root, "h1.sr-only");
    }
    // Season Buy-button card: the closing heading and the ticket picture are in the DOM, hidden.
    unstamped(seasonRoot(season, "button"), ".tp-closing > h2, .tp-closing > img.tp-ticket");
  });
});
