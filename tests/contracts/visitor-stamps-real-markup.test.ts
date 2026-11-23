import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  CHICK_FIL_A_FIXTURE_MEDIA, FOOTHILL_FIXTURE_MEDIA, TICKETS_FIXTURE_MEDIA, chickFilAFixture, chickFilAFixtureUrl, foothillFixture, foothillFixtureUrl, ticketsFixture, ticketsFixtureUrl,
} from "../fixtures/visitor-click-fixtures";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY } from "@/lib/admin-edit-targets";
import { emptyStadiumContent, hydrateStadiumContent, type StadiumContent } from "@/lib/stadium-content";
import { emptyChickFilAContent, hydrateChickFilAContent, type ChickFilAContent } from "@/lib/chick-fil-a-content";
import { emptyTicketsContent, hydrateTicketsContent, type TicketsContent } from "@/lib/tickets-content";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { FOOTHILL_SECTIONS, foothillSectionOnly, type FoothillSectionId } from "@/components/admin/stadium/foothill-sections";
import { FOOTHILL_TARGETS, foothillPreviewStamps } from "@/components/admin/stadium/foothill-edit-targets";
import { CHICK_FIL_A_CARDS, chickFilACardOnly, type ChickFilACardId } from "@/components/admin/chick-fil-a/chick-fil-a-sections";
import { CHICK_FIL_A_TARGETS, chickFilAPreviewStamps } from "@/components/admin/chick-fil-a/chick-fil-a-edit-targets";
import { TICKETS_SECTIONS, ticketsSectionOnly, type TicketsSectionId } from "@/components/admin/tickets/tickets-sections";
import { TICKETS_TARGETS, directionsBlocks, ticketsPreviewStamps } from "@/components/admin/tickets/tickets-edit-targets";

/**
 * UI-PREVIEW-CLICK-VISITOR-2: the Foothill Transit, Chick-fil-A and Tickets card stamps, run against the real public
 * markup (CinematicStadium, CinematicChickFilA, CinematicTickets) rendered the way each card renders it: the draft with only
 * that card on, hydrated with the page's media (Tickets inside the card's `div.only[data-only]`). Each stamp must land on
 * exactly the node that shows its field's draft value. The shared Homepage content is a filled fixture, so Homepage-owned
 * text (the match heading and button, the prices) is really on the page and must carry no id.
 */
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", name: "Rose City FC" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ useClubTimeZone: () => "America/Los_Angeles" }));
vi.mock("@/components/cinematic/CinematicContent", () => ({
  useCinematicContent: () => ({ content: {
    match: { heading: "Homepage next match", buttonLabel: "Homepage buy button", emptyMessage: "Homepage empty message" },
    presentation: { seatsBackground: { url: null } },
    prices: { heading: "Homepage prices", footnote: "Homepage price footnote", rows: [{ id: "adult", label: "Adult", price: "$25", accent: "", description: "Homepage price description", note: "" }] },
  } }),
}));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("@/components/OpponentCrest", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: () => new Promise(() => undefined) }));
import CinematicStadium from "@/components/cinematic/CinematicStadium";
import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA";
import CinematicTickets from "@/components/cinematic/CinematicTickets";

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

/* ---------------------------------------------------------------- Foothill Transit */
const TICKETING = { purchaseUrl: "https://tickets.test/buy", missingPurchaseLabel: "Soon" };
function foothillRoot(draft: StadiumContent, section: FoothillSectionId, stampsFrom: StadiumContent = draft) {
  const page = hydrateStadiumContent(foothillSectionOnly(draft, section), FOOTHILL_FIXTURE_MEDIA);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicStadium, { content: page, ticketing: TICKETING })));
  applyEditTargetStamps(root as unknown as ParentNode, foothillPreviewStamps(stampsFrom, section));
  return root;
}
const foothill = foothillFixture();

describe("Foothill Transit stamps on the real public markup", () => {
  it("heading: the title and subtitle, and not the bus picture the card also shows", () => {
    const root = foothillRoot(foothill, "heading");
    expect(only(root, FOOTHILL_TARGETS.headingTitle).tagName).toBe("h1");
    expect(text(only(root, FOOTHILL_TARGETS.headingTitle))).toBe("Foothill Transit");
    expect(text(only(root, FOOTHILL_TARGETS.headingSubtitle))).toBe("Ride the bus to the match");
    expect(stampedIds(root)).toHaveLength(2);
    unstamped(root, ".robinson-heading > img");
  });

  it("images: the bus and the route map by their own pictures, and not the heading text the card also shows", () => {
    const root = foothillRoot(foothill, "images");
    expect(only(root, FOOTHILL_TARGETS.imagesBusImageAlt).getAttribute("src")).toBe(foothillFixtureUrl("bus"));
    expect(only(root, FOOTHILL_TARGETS.imagesBusImageAlt).getAttribute("alt")).toBe("bus picture");
    expect(only(root, FOOTHILL_TARGETS.imagesMapImageAlt).getAttribute("src")).toBe(foothillFixtureUrl("map"));
    expect(only(root, FOOTHILL_TARGETS.imagesMapImageAlt).getAttribute("alt")).toBe("map picture");
    expect(stampedIds(root)).toHaveLength(2);
    unstamped(root, ".robinson-heading > div > h1");
  });

  it("images, two-part phone map: only the desktop image is stamped, not the phone crops", () => {
    const split = structuredClone(foothill);
    split.phoneMapLayout = "split";
    const root = foothillRoot(split, "images");
    expect(root.querySelectorAll(".robinson-route-phone svg")).toHaveLength(2);
    expect(only(root, FOOTHILL_TARGETS.imagesMapImageAlt).tagName).toBe("img");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("map: the card has no text on the page to click, so nothing is stamped", () => {
    expect(stampedIds(foothillRoot(foothill, "map"))).toEqual([]);
    const split = structuredClone(foothill);
    split.phoneMapLayout = "split";
    expect(stampedIds(foothillRoot(split, "map"))).toEqual([]);
    expect(foothillRoot(foothill, "map").querySelectorAll(".robinson-route > img")).toHaveLength(1);
  });

  it("match: only the partner logo is stamped; Schedule's fixture, Homepage's wording and Tickets' link are not", () => {
    const root = foothillRoot(foothill, "match");
    expect(only(root, FOOTHILL_TARGETS.matchPartnerImageAlt).getAttribute("src")).toBe(foothillFixtureUrl("partner"));
    expect(only(root, FOOTHILL_TARGETS.matchPartnerImageAlt).getAttribute("alt")).toBe("partner picture");
    expect(stampedIds(root)).toEqual([FOOTHILL_TARGETS.matchPartnerImageAlt]);
    unstamped(root, ".robinson-match > h2, .robinson-match .robinson-buy, .robinson-match-pending, .robinson-match-pending p");
    expect(text(root.querySelectorAll(".robinson-match > h2")[0])).toBe("Homepage next match");
    expect(text(root.querySelectorAll(".robinson-buy")[0])).toBe("Homepage buy button");
  });

  it("benefits: heading, each benefit's title and details by position, and the footnote", () => {
    const root = foothillRoot(foothill, "benefits");
    expect(only(root, FOOTHILL_TARGETS.benefitsHeading).tagName).toBe("h2");
    expect(text(only(root, FOOTHILL_TARGETS.benefitsHeading))).toBe("Your ticket includes");
    foothill.benefits.forEach((benefit, index) => {
      expect(only(root, `foothill.benefits.row:${index}.title`).tagName).toBe("h3");
      expect(text(only(root, `foothill.benefits.row:${index}.title`))).toBe(benefit.title);
      expect(only(root, `foothill.benefits.row:${index}.detail`).tagName).toBe("p");
      expect(text(only(root, `foothill.benefits.row:${index}.detail`))).toBe(benefit.detail);
    });
    expect(only(root, FOOTHILL_TARGETS.benefitsFootnote).tagName).toBe("em");
    expect(text(only(root, FOOTHILL_TARGETS.benefitsFootnote))).toBe("Terms apply.");
    expect(stampedIds(root)).toHaveLength(2 + foothill.benefits.length * 2);
  });

  it("sections: every shown block's heading, information, footnote and bullets by the block's id; a hidden block has no node and no stamp", () => {
    const root = foothillRoot(foothill, "sections");
    const [byBus, noHeading, hidden, parking] = foothill.sections;
    expect(text(only(root, "foothill.sections.row:by-bus.heading"))).toBe("By Bus");
    expect(only(root, "foothill.sections.row:by-bus.heading").tagName).toBe("h2");
    expect(text(only(root, "foothill.sections.row:by-bus.body"))).toBe(byBus.body);
    expect(only(root, "foothill.sections.row:by-bus.note").tagName).toBe("em");
    expect(text(only(root, "foothill.sections.row:by-bus.note"))).toBe(byBus.note);
    byBus.bullets.forEach((bullet, index) => { expect(only(root, `foothill.sections.row:by-bus-b${index}.bullet`).tagName).toBe("li"); expect(text(only(root, `foothill.sections.row:by-bus-b${index}.bullet`))).toBe(bullet); });
    // A block with no heading, footnote or bullets has just its information.
    expect(text(only(root, "foothill.sections.row:no-heading.body"))).toBe(noHeading.body);
    expect(nodesFor(root, "foothill.sections.row:no-heading.heading")).toHaveLength(0);
    expect(nodesFor(root, "foothill.sections.row:no-heading.note")).toHaveLength(0);
    expect(stampedIds(root).some(id => id.includes(hidden.id))).toBe(false);
    expect(root.querySelectorAll(".robinson-directions > div")).toHaveLength(3);
    expect(text(only(root, "foothill.sections.row:parking.heading"))).toBe("Parking");
    expect(text(only(root, "foothill.sections.row:parking.body"))).toBe(parking.body);
    expect(text(only(root, "foothill.sections.row:parking.note"))).toBe(parking.note);
    expect(text(only(root, "foothill.sections.row:parking-b0.bullet"))).toBe("Bring cash");
    // by-bus: heading, information, footnote, 2 bullets; no-heading: information; parking: heading, information, footnote, 1 bullet.
    expect(stampedIds(root)).toHaveLength(5 + 1 + 4);
  });

  it("every declared field is stamped on the page when the draft fills it: nothing is intentionally left without a node", () => {
    expect(missingFields("foothill", section => foothillRoot(foothill, section as FoothillSectionId))).toEqual([]);
  });

  it("with a bare draft (no pictures, no optional text, no rows) exactly these declared fields have no node on the page", () => {
    const bare = emptyStadiumContent();
    expect(missingFields("foothill", section => foothillRoot(bare, section as FoothillSectionId))).toEqual([
      "heading.subtitle", "images.busImageAlt", "images.mapImageAlt", "match.partnerImageAlt", "benefits.footnote", "benefits.row.title", "benefits.row.detail",
      "sections.row.heading", "sections.row.body", "sections.row.note", "sections.row.bullet",
    ]);
  });

  it("every stamped id belongs to the card it is on, and the public page markup has none of its own", () => {
    for (const section of FOOTHILL_SECTIONS) for (const id of stampedIds(foothillRoot(foothill, section.id))) expect(id.startsWith(`foothill.${section.id}.`), id).toBe(true);
    const page = hydrateStadiumContent(foothill, FOOTHILL_FIXTURE_MEDIA);
    expect(renderToStaticMarkup(createElement(CinematicStadium, { content: page, ticketing: TICKETING }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Foothill Transit stamps follow the draft", () => {
  it("reordered page blocks: each block's nodes carry its own ids", () => {
    const moved = structuredClone(foothill);
    moved.sections.reverse();
    const root = foothillRoot(moved, "sections");
    expect(text(only(root, "foothill.sections.row:parking.heading"))).toBe("Parking");
    expect(text(only(root, "foothill.sections.row:by-bus.heading"))).toBe("By Bus");
    expect(text(only(root, "foothill.sections.row:by-bus-b1.bullet"))).toBe("Stop at Sierra Bonita");
    expect(text(only(root, "foothill.sections.row:no-heading.body"))).toBe("A block with no heading.");
    // Reversed, the first block shown is parking.
    expect(root.querySelectorAll(".robinson-directions > div")[0].querySelectorAll("h2")[0].getAttribute(EDIT_TARGET_ATTRIBUTE)).toBe("foothill.sections.row:parking.heading");
  });

  it("a hidden block that is shown again is stamped and shifts nothing", () => {
    const shown = structuredClone(foothill);
    shown.sections[2].visible = true;
    const root = foothillRoot(shown, "sections");
    expect(text(only(root, "foothill.sections.row:hidden-block.heading"))).toBe("Hidden block");
    expect(text(only(root, "foothill.sections.row:hidden-block-b0.bullet"))).toBe("Hidden bullet");
    expect(text(only(root, "foothill.sections.row:parking.heading"))).toBe("Parking");
    expect(text(only(root, "foothill.sections.row:no-heading.body"))).toBe("A block with no heading.");
  });

  it("reordered benefits are stamped by their new position", () => {
    const moved = structuredClone(foothill);
    moved.benefits.reverse();
    const root = foothillRoot(moved, "benefits");
    expect(text(only(root, "foothill.benefits.row:0.title"))).toBe("Scarf");
    expect(text(only(root, "foothill.benefits.row:0.detail"))).toBe("One per fan.");
    expect(text(only(root, "foothill.benefits.row:2.title"))).toBe("Free bus ride");
  });

  it("an added benefit is stamped and a removed one leaves no stamp", () => {
    const more = structuredClone(foothill);
    more.benefits.push({ title: "Poster", detail: "Signed." });
    expect(text(only(foothillRoot(more, "benefits"), "foothill.benefits.row:3.title"))).toBe("Poster");
    const fewer = structuredClone(foothill);
    fewer.benefits.length = 1;
    expect(stampedIds(foothillRoot(fewer, "benefits")).filter(id => id.includes(".row:"))).toEqual(["foothill.benefits.row:0.title", "foothill.benefits.row:0.detail"]);
  });

  it("a missing image has no node and so no stamp (nothing to click)", () => {
    const bare = structuredClone(foothill);
    bare.artwork.bus = { assetId: null, alt: "" };
    const root = foothillRoot(bare, "images");
    expect(nodesFor(root, FOOTHILL_TARGETS.imagesBusImageAlt)).toHaveLength(0);
    expect(only(root, FOOTHILL_TARGETS.imagesMapImageAlt).getAttribute("src")).toBe(foothillFixtureUrl("map"));
  });

  it("stamps built from a draft that no longer matches the rendered page never land on a node of another block", () => {
    // The page was rendered without the first block's heading and bullets, but the stamps come from a draft that still has them (a stale frame).
    const rendered = structuredClone(foothill);
    rendered.sections[0].heading = "";
    rendered.sections[0].bullets = [];
    const root = foothillRoot(rendered, "sections", foothill);
    expect(nodesFor(root, "foothill.sections.row:by-bus.heading")).toHaveLength(0);
    expect(nodesFor(root, "foothill.sections.row:by-bus-b0.bullet")).toHaveLength(0);
    expect(text(only(root, "foothill.sections.row:parking.heading"))).toBe("Parking");
    expect(text(only(root, "foothill.sections.row:parking-b0.bullet"))).toBe("Bring cash");
  });
});

/* ---------------------------------------------------------------- Chick-fil-A */
function chickFilARoot(draft: ChickFilAContent, card: ChickFilACardId) {
  const page = hydrateChickFilAContent(chickFilACardOnly(draft, card), CHICK_FIL_A_FIXTURE_MEDIA, false);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicChickFilA, { content: page, purchase: TICKETING })));
  applyEditTargetStamps(root as unknown as ParentNode, chickFilAPreviewStamps(card));
  return root;
}
const chickFilA = chickFilAFixture();

describe("Chick-fil-A stamps on the real public markup", () => {
  it("heading: the title and subtitle", () => {
    const root = chickFilARoot(chickFilA, "heading");
    expect(only(root, CHICK_FIL_A_TARGETS.headingTitle).tagName).toBe("h1");
    expect(text(only(root, CHICK_FIL_A_TARGETS.headingTitle))).toBe("Food & Beverage");
    expect(text(only(root, CHICK_FIL_A_TARGETS.headingSubtitle))).toBe("Eat before the match");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("details: heading, copy and the meal pass picture", () => {
    const root = chickFilARoot(chickFilA, "details");
    expect(text(only(root, CHICK_FIL_A_TARGETS.detailsHeading))).toBe("Meal pass details");
    expect(only(root, CHICK_FIL_A_TARGETS.detailsHeading).tagName).toBe("h2");
    expect(only(root, CHICK_FIL_A_TARGETS.detailsBody).tagName).toBe("p");
    expect(text(only(root, CHICK_FIL_A_TARGETS.detailsBody))).toBe("Show your pass at the drive-thru.");
    expect(only(root, CHICK_FIL_A_TARGETS.detailsMealPassImageAlt).getAttribute("src")).toBe(chickFilAFixtureUrl("mealPass"));
    expect(only(root, CHICK_FIL_A_TARGETS.detailsMealPassImageAlt).getAttribute("alt")).toBe("mealPass picture");
    expect(stampedIds(root)).toHaveLength(3);
  });

  it("steps: each step's label, number and icon by step", () => {
    const root = chickFilARoot(chickFilA, "steps");
    chickFilA.stepLabels.forEach((label, step) => {
      expect(only(root, `chickFilA.steps.row:${step}.label`).tagName).toBe("p");
      expect(text(only(root, `chickFilA.steps.row:${step}.label`))).toBe(label);
      expect(only(root, `chickFilA.steps.row:${step}.number`).tagName).toBe("span");
      expect(text(only(root, `chickFilA.steps.row:${step}.number`))).toBe(chickFilA.stepNumbers[step]);
      expect(only(root, `chickFilA.steps.row:${step}.iconAlt`).getAttribute("src")).toBe(chickFilAFixtureUrl((["driveThru", "freeTicket", "enjoyGame"] as const)[step]));
    });
    expect(stampedIds(root)).toHaveLength(9);
  });

  it("map: the route map picture", () => {
    const root = chickFilARoot(chickFilA, "map");
    expect(only(root, CHICK_FIL_A_TARGETS.mapImageAlt).getAttribute("src")).toBe(chickFilAFixtureUrl("map"));
    expect(stampedIds(root)).toHaveLength(1);
  });

  it("match: only the partner logo is stamped; Schedule's fixture, Homepage's wording and Tickets' link are not, and nor is the background", () => {
    const root = chickFilARoot(chickFilA, "match");
    expect(only(root, CHICK_FIL_A_TARGETS.matchPartnerImageAlt).getAttribute("src")).toBe(chickFilAFixtureUrl("partner"));
    expect(only(root, CHICK_FIL_A_TARGETS.matchPartnerImageAlt).getAttribute("alt")).toBe("partner picture");
    expect(stampedIds(root)).toEqual([CHICK_FIL_A_TARGETS.matchPartnerImageAlt]);
    unstamped(root, ".food-match > h2, .food-match .food-buy, .food-match-pending, .food-match-pending p, .food-match-area");
    expect(text(root.querySelectorAll(".food-match > h2")[0])).toBe("Homepage next match");
    expect(text(root.querySelectorAll(".food-buy")[0])).toBe("Homepage buy button");
  });

  it("restaurant: the photo", () => {
    const root = chickFilARoot(chickFilA, "restaurant");
    expect(only(root, CHICK_FIL_A_TARGETS.restaurantImageAlt).getAttribute("src")).toBe(chickFilAFixtureUrl("restaurant"));
    expect(stampedIds(root)).toHaveLength(1);
  });

  it("background: the seat band that paints the background picture", () => {
    const root = chickFilARoot(chickFilA, "background");
    const band = only(root, CHICK_FIL_A_TARGETS.backgroundImageAlt);
    expect(band.tagName).toBe("section");
    expect(band.getAttribute("style")).toContain(chickFilAFixtureUrl("background"));
    expect(stampedIds(root)).toHaveLength(1);
  });

  it("every declared field is stamped on the page when the draft fills it", () => {
    expect(missingFields("chickFilA", card => chickFilARoot(chickFilA, card as ChickFilACardId))).toEqual([]);
  });

  it("with a bare draft exactly these declared fields have no node on the page", () => {
    const bare = emptyChickFilAContent();
    expect(missingFields("chickFilA", card => chickFilARoot(bare, card as ChickFilACardId))).toEqual([
      "heading.subtitle", "details.mealPassImageAlt", "steps.row.iconAlt", "map.imageAlt", "match.partnerImageAlt", "restaurant.imageAlt",
    ]);
  });

  it("every stamped id belongs to the card it is on, and the public page markup has none of its own", () => {
    for (const card of CHICK_FIL_A_CARDS) for (const id of stampedIds(chickFilARoot(chickFilA, card.id))) expect(id.startsWith(`chickFilA.${card.id}.`), id).toBe(true);
    const page = hydrateChickFilAContent(chickFilA, CHICK_FIL_A_FIXTURE_MEDIA, false);
    expect(renderToStaticMarkup(createElement(CinematicChickFilA, { content: page, purchase: TICKETING }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Chick-fil-A stamps follow the draft", () => {
  it("a step whose icon is not set does not shift the other steps' icons", () => {
    const gap = structuredClone(chickFilA);
    gap.artwork.driveThru = { assetId: null, alt: "" };
    const root = chickFilARoot(gap, "steps");
    expect(nodesFor(root, "chickFilA.steps.row:0.iconAlt")).toHaveLength(0);
    expect(only(root, "chickFilA.steps.row:1.iconAlt").getAttribute("src")).toBe(chickFilAFixtureUrl("freeTicket"));
    expect(only(root, "chickFilA.steps.row:2.iconAlt").getAttribute("src")).toBe(chickFilAFixtureUrl("enjoyGame"));
    expect(text(only(root, "chickFilA.steps.row:0.label"))).toBe("Drive-Thru");
    expect(text(only(root, "chickFilA.steps.row:2.number"))).toBe("3");
  });

  it("reordered step labels are stamped by their position (the stamps never read the draft)", () => {
    const moved = structuredClone(chickFilA);
    moved.stepLabels.reverse();
    const root = chickFilARoot(moved, "steps");
    expect(text(only(root, "chickFilA.steps.row:0.label"))).toBe("Enjoy during Game");
    expect(text(only(root, "chickFilA.steps.row:2.label"))).toBe("Drive-Thru");
  });

  it("a missing image has no node and so no stamp", () => {
    const bare = structuredClone(chickFilA);
    bare.artwork.map = { assetId: null, alt: "" };
    expect(nodesFor(chickFilARoot(bare, "map"), CHICK_FIL_A_TARGETS.mapImageAlt)).toHaveLength(0);
    bare.artwork.restaurant = { assetId: null, alt: "" };
    expect(stampedIds(chickFilARoot(bare, "restaurant"))).toEqual([]);
  });
});

/* ---------------------------------------------------------------- Tickets */
/** Home of the page's hidden-section rules: the classes each card's CSS hides (components/admin/ticket-pages/ticket-editors.module.css). */
const HIDDEN_BY_CSS = (() => {
  const css = readFileSync("components/admin/ticket-pages/ticket-editors.module.css", "utf8"), hidden: Record<string, string[]> = {};
  for (const match of css.matchAll(/\.only\[data-only="(\w+)"\] :global\(\.([\w-]+)\)/g)) (hidden[match[1]] ??= []).push(`.${match[2]}`);
  return hidden;
})();
function ticketsRoot(draft: TicketsContent, section: TicketsSectionId, stampsFrom: TicketsContent = draft) {
  const page = hydrateTicketsContent(ticketsSectionOnly(draft, section), TICKETS_FIXTURE_MEDIA, false);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": section }, createElement(CinematicTickets, { content: page }))));
  applyEditTargetStamps(root as unknown as ParentNode, ticketsPreviewStamps(stampsFrom, section));
  return root;
}
const tickets = ticketsFixture();

describe("Tickets stamps on the real public markup", () => {
  it("page: title, subtitle, banner, the Buy button as the purchase link, and the partner logo", () => {
    const root = ticketsRoot(tickets, "page");
    expect(only(root, TICKETS_TARGETS.pageTitle).tagName).toBe("h1");
    expect(text(only(root, TICKETS_TARGETS.pageTitle))).toBe("Tickets");
    expect(only(root, TICKETS_TARGETS.pageSubtitle).tagName).toBe("p");
    expect(text(only(root, TICKETS_TARGETS.pageSubtitle))).toBe("Season and single match");
    expect(only(root, TICKETS_TARGETS.pageBannerImageAlt).getAttribute("src")).toBe(ticketsFixtureUrl("banner"));
    expect(only(root, TICKETS_TARGETS.pageBannerImageAlt).getAttribute("alt")).toBe("banner picture");
    expect(only(root, TICKETS_TARGETS.pagePartnerImageAlt).getAttribute("src")).toBe(ticketsFixtureUrl("partner"));
    // The button's words are Homepage's; where it goes is the purchase link.
    expect(only(root, TICKETS_TARGETS.pagePurchaseUrl).tagName).toBe("a");
    expect(only(root, TICKETS_TARGETS.pagePurchaseUrl).getAttribute("href")).toBe("https://tickets.test/buy");
    expect(text(only(root, TICKETS_TARGETS.pagePurchaseUrl))).toBe("Homepage buy button");
    // With a valid link the "coming soon" note is not on the page.
    expect(nodesFor(root, TICKETS_TARGETS.pageMissingPurchaseLabel)).toHaveLength(0);
    expect(root.querySelectorAll(".purchase-note")).toHaveLength(0);
    expect(stampedIds(root)).toHaveLength(5);
    unstamped(root, ".tickets-match > h2");
  });

  it("page, no purchase link yet: the inactive Buy button is the link's node and the note shows the message", () => {
    const noLink = structuredClone(tickets);
    noLink.purchaseUrl = "";
    const root = ticketsRoot(noLink, "page");
    expect(only(root, TICKETS_TARGETS.pagePurchaseUrl).tagName).toBe("button");
    expect(only(root, TICKETS_TARGETS.pageMissingPurchaseLabel).tagName).toBe("p");
    expect(text(only(root, TICKETS_TARGETS.pageMissingPurchaseLabel))).toBe("Ticket link coming soon");
    expect(stampedIds(root)).toHaveLength(6);
  });

  it("page: Homepage's prices and match wording sit in the same card and carry no id", () => {
    const root = ticketsRoot(tickets, "page");
    unstamped(root, ".tickets-prices > h2, .tickets-price-row > h3, .tickets-prices .tickets-footnote, .tickets-prices .tickets-footnote > em");
  });

  it("perks: heading and each perk's label by position, not the perk pictures", () => {
    const root = ticketsRoot(tickets, "perks");
    expect(only(root, TICKETS_TARGETS.perksHeading).tagName).toBe("h2");
    expect(text(only(root, TICKETS_TARGETS.perksHeading))).toBe("Season perks");
    tickets.perkLabels.forEach((label, index) => { expect(only(root, `tickets.perks.row:${index}.label`).tagName).toBe("figcaption"); expect(text(only(root, `tickets.perks.row:${index}.label`))).toBe(label); });
    expect(stampedIds(root)).toHaveLength(4);
    unstamped(root, ".perk-image img");
  });

  it("includes: heading, each benefit's title and details by position, and the footnote (not the prices footnote)", () => {
    const root = ticketsRoot(tickets, "includes");
    expect(text(only(root, TICKETS_TARGETS.includesHeading))).toBe("Your ticket includes");
    tickets.benefits.forEach((benefit, index) => {
      expect(only(root, `tickets.includes.row:${index}.title`).tagName).toBe("h3");
      expect(text(only(root, `tickets.includes.row:${index}.title`))).toBe(benefit.title);
      expect(only(root, `tickets.includes.row:${index}.detail`).tagName).toBe("p");
      expect(text(only(root, `tickets.includes.row:${index}.detail`))).toBe(benefit.detail);
    });
    expect(only(root, TICKETS_TARGETS.includesFootnote).tagName).toBe("em");
    expect(text(only(root, TICKETS_TARGETS.includesFootnote))).toBe("Terms apply.");
    expect(stampedIds(root)).toHaveLength(2 + tickets.benefits.length * 2);
  });

  it("transit: heading, subtitle, bus and map", () => {
    const root = ticketsRoot(tickets, "transit");
    expect(only(root, TICKETS_TARGETS.transitHeading).tagName).toBe("h2");
    expect(text(only(root, TICKETS_TARGETS.transitHeading))).toBe("Ride the bus");
    expect(text(only(root, TICKETS_TARGETS.transitSubtitle))).toBe("Save on gas");
    expect(only(root, TICKETS_TARGETS.transitBusImageAlt).getAttribute("src")).toBe(ticketsFixtureUrl("bus"));
    expect(only(root, TICKETS_TARGETS.transitMapImageAlt).getAttribute("src")).toBe(ticketsFixtureUrl("map"));
    expect(stampedIds(root)).toHaveLength(4);
  });

  it("directions: each block's heading and text, and the parking footnote", () => {
    const root = ticketsRoot(tickets, "directions");
    expect(only(root, TICKETS_TARGETS.directionsHeading).tagName).toBe("h3");
    expect(text(only(root, TICKETS_TARGETS.directionsHeading))).toBe("Directions");
    expect(text(only(root, TICKETS_TARGETS.directionsBody))).toBe("Take Colorado Blvd to the stadium.");
    expect(text(only(root, TICKETS_TARGETS.directionsParkingHeading))).toBe("Parking");
    expect(text(only(root, TICKETS_TARGETS.directionsParkingBody))).toBe("Daily permits are two dollars.");
    expect(only(root, TICKETS_TARGETS.directionsParkingNote).tagName).toBe("em");
    expect(text(only(root, TICKETS_TARGETS.directionsParkingNote))).toBe("Lot 5 is on Bonnie Ave.");
    expect(stampedIds(root)).toHaveLength(5);
  });

  it("with a link set every declared field has its node except the \"coming soon\" message, which shows only until a link is set; with no link every one does", () => {
    expect(missingFields("tickets", section => ticketsRoot(tickets, section as TicketsSectionId))).toEqual(["page.missingPurchaseLabel"]);
    expect(missingFields("tickets", section => ticketsRoot({ ...tickets, purchaseUrl: "" }, section as TicketsSectionId))).toEqual([]);
  });

  it("with a bare draft exactly these declared fields have no node on the page (Perks and Bus and map are not on the page at all)", () => {
    expect(missingFields("tickets", section => ticketsRoot(emptyTicketsContent(), section as TicketsSectionId))).toEqual([
      "page.subtitle", "page.bannerImageAlt", "page.partnerImageAlt",
      "perks.heading", "perks.row.label",
      "includes.footnote", "includes.row.title", "includes.row.detail",
      "transit.heading", "transit.subtitle", "transit.busImageAlt", "transit.mapImageAlt",
      "directions.directionsHeading", "directions.directionsBody", "directions.parkingHeading", "directions.parkingBody", "directions.parkingNote",
    ]);
  });

  it("the Tickets page prices and match wording are really on the page and carry no id in any card", () => {
    for (const section of TICKETS_SECTIONS) {
      const root = ticketsRoot(tickets, section.id);
      for (const id of stampedIds(root)) expect(id.startsWith(`tickets.${section.id}.`), id).toBe(true);
    }
    const page = hydrateTicketsContent(tickets, TICKETS_FIXTURE_MEDIA, false);
    expect(renderToStaticMarkup(createElement(CinematicTickets, { content: page }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Tickets cards stamp only the visible section's nodes", () => {
  it("the CSS the cards rely on hides the other sections: the rules this test reads exist for every card", () => {
    for (const section of ["page", "perks", "includes", "transit", "directions"]) expect(HIDDEN_BY_CSS[section]?.length, section).toBeGreaterThan(0);
    expect(HIDDEN_BY_CSS.includes).toEqual([".tickets-top", ".tickets-match"]);
    expect(HIDDEN_BY_CSS.perks).toEqual([".tickets-top", ".tickets-match-includes"]);
  });

  it.each(TICKETS_SECTIONS.map(section => section.id))("%s: no stamped node is inside a section the card's CSS hides", id => {
    const root = ticketsRoot(tickets, id);
    const hidden = HIDDEN_BY_CSS[id].join(", ");
    const stamped = [...root.descendants()].filter(node => node.hasAttribute(EDIT_TARGET_ATTRIBUTE));
    expect(stamped.length).toBeGreaterThan(0);
    for (const node of stamped) expect(node.closest(hidden), `${node.getAttribute(EDIT_TARGET_ATTRIBUTE)} is inside a hidden section`).toBeNull();
  });

  it("the hidden sections' markup is really on the page, and carries no stamp", () => {
    // Perks card: the whole match and includes section is in the DOM (hidden by CSS), partner logo and all.
    const perks = ticketsRoot(tickets, "perks");
    unstamped(perks, ".tickets-top h1, .tickets-top .tickets-prices h2, .tickets-prices .tickets-footnote > em, .tickets-match > h2, .tickets-match > .tickets-buy, .tickets-match > img.tickets-chick");
    // Ticket-includes card: the page top (title, prices) and the next-match article sit in the DOM too.
    const includes = ticketsRoot({ ...tickets, includesVisible: true }, "includes");
    unstamped(includes, ".tickets-top h1, .tickets-top .tickets-title > p, .tickets-prices .tickets-footnote > em, .tickets-match > h2, .tickets-match > .tickets-buy");
    // Page card: the partner logo is the card's own; the perks, includes, transit and directions are not rendered at all.
    const page = ticketsRoot(tickets, "page");
    expect(page.querySelectorAll(".tickets-includes, .tickets-perks, .tickets-transit, .tickets-directions")).toHaveLength(0);
    const transit = ticketsRoot(tickets, "transit");
    unstamped(transit, ".tickets-top h1, .tickets-match > img.tickets-chick");
    const directions = ticketsRoot(tickets, "directions");
    unstamped(directions, ".tickets-top h1, .tickets-match > img.tickets-chick");
  });
});

describe("Tickets stamps follow the draft", () => {
  it("reordered benefits are stamped by their new position", () => {
    const moved = structuredClone(tickets);
    moved.benefits.reverse();
    const root = ticketsRoot(moved, "includes");
    expect(text(only(root, "tickets.includes.row:0.title"))).toBe("Scarf");
    expect(text(only(root, "tickets.includes.row:0.detail"))).toBe("One per fan.");
    expect(text(only(root, "tickets.includes.row:2.title"))).toBe("Free bus ride");
  });

  it("an added benefit is stamped and a removed one leaves no stamp", () => {
    const more = structuredClone(tickets);
    more.benefits.push({ title: "Poster", detail: "Signed." });
    expect(text(only(ticketsRoot(more, "includes"), "tickets.includes.row:3.title"))).toBe("Poster");
    const fewer = structuredClone(tickets);
    fewer.benefits.length = 1;
    expect(stampedIds(ticketsRoot(fewer, "includes")).filter(id => id.includes(".row:"))).toEqual(["tickets.includes.row:0.title", "tickets.includes.row:0.detail"]);
  });

  it("directions with no Directions text: the Parking block, now first on the page, keeps its own ids", () => {
    const noDirections = structuredClone(tickets);
    noDirections.directionsHeading = "";
    noDirections.directionsBody = "";
    expect(directionsBlocks(noDirections)).toEqual(["parking"]);
    const root = ticketsRoot(noDirections, "directions");
    expect(root.querySelectorAll(".tickets-directions > div")).toHaveLength(1);
    expect(nodesFor(root, TICKETS_TARGETS.directionsHeading)).toHaveLength(0);
    expect(nodesFor(root, TICKETS_TARGETS.directionsBody)).toHaveLength(0);
    expect(text(only(root, TICKETS_TARGETS.directionsParkingHeading))).toBe("Parking");
    expect(text(only(root, TICKETS_TARGETS.directionsParkingBody))).toBe("Daily permits are two dollars.");
    expect(text(only(root, TICKETS_TARGETS.directionsParkingNote))).toBe("Lot 5 is on Bonnie Ave.");
  });

  it("directions with no Parking text: Directions keeps its ids and nothing is stamped for Parking", () => {
    const noParking = structuredClone(tickets);
    noParking.parkingHeading = ""; noParking.parkingBody = ""; noParking.parkingNote = "";
    const root = ticketsRoot(noParking, "directions");
    expect(root.querySelectorAll(".tickets-directions > div")).toHaveLength(1);
    expect(text(only(root, TICKETS_TARGETS.directionsBody))).toBe("Take Colorado Blvd to the stadium.");
    expect(stampedIds(root)).toEqual([TICKETS_TARGETS.directionsHeading, TICKETS_TARGETS.directionsBody]);
  });

  it("a missing image has no node and so no stamp", () => {
    const bare = structuredClone(tickets);
    bare.artwork.banner = { assetId: null, alt: "" };
    const root = ticketsRoot(bare, "page");
    expect(nodesFor(root, TICKETS_TARGETS.pageBannerImageAlt)).toHaveLength(0);
    expect(text(only(root, TICKETS_TARGETS.pageTitle))).toBe("Tickets");
  });
});
