import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { robinsonFixture, robinsonFixtureUrl, ROBINSON_FIXTURE_MEDIA } from "../fixtures/robinson-click-fixture";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY } from "@/lib/admin-edit-targets";
import { hydrateRobinsonContent, type RobinsonContent } from "@/lib/cinematic-robinson-content";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { ROBINSON_SECTIONS, robinsonSectionOnly, type RobinsonSectionId } from "@/components/admin/stadium/robinson-sections";
import { ROBINSON_TARGETS, directionsSequence, robinsonPreviewStamps } from "@/components/admin/stadium/robinson-edit-targets";

/**
 * UI-PREVIEW-CLICK-VISITOR-1: the Robinson card stamps, run against the real public markup (CinematicRobinson, with the
 * match card from CinematicStadium) rendered the way each section card renders it: the draft with only that section
 * on, hydrated with the page's media. Each stamp must land on exactly the node that shows its field's draft value.
 */
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", name: "Rose City FC" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ useClubTimeZone: () => "America/Los_Angeles" }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("@/components/OpponentCrest", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: () => new Promise(() => undefined) }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: () => new Promise(() => undefined) }));
import CinematicRobinson from "@/components/cinematic/CinematicRobinson";

beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });

/** Renders one section card's preview from `draft` and runs that section's stamps over it. */
function stamped(draft: RobinsonContent, section: RobinsonSectionId) {
  const page = hydrateRobinsonContent(robinsonSectionOnly(draft, section), ROBINSON_FIXTURE_MEDIA);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicRobinson, { content: page, ticketing: { purchaseUrl: "https://tickets.test/buy", missingPurchaseLabel: "Soon" } })));
  applyEditTargetStamps(root as unknown as ParentNode, robinsonPreviewStamps(draft, section));
  return root;
}
const nodesFor = (root: StaticElement, id: string) => [...root.descendants()].filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === id);
const only = (root: StaticElement, id: string) => {
  const nodes = nodesFor(root, id);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
};
const text = (node: StaticElement) => node.textContent.replace(/\s+/g, " ").trim();
const stampedIds = (root: StaticElement) => [...root.descendants()].flatMap(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? []);
const draft = robinsonFixture();

describe("Robinson stamps on the real public markup", () => {
  it("heading: the title and subtitle", () => {
    const root = stamped(draft, "heading");
    expect(only(root, ROBINSON_TARGETS.headingTitle).tagName).toBe("h1");
    expect(text(only(root, ROBINSON_TARGETS.headingTitle))).toBe("Robinson Stadium");
    expect(text(only(root, ROBINSON_TARGETS.headingSubtitle))).toBe("Pasadena, California");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("seating: the map image, its caption and the full-size link", () => {
    const root = stamped(draft, "seating");
    expect(only(root, ROBINSON_TARGETS.seatingImageAlt).getAttribute("src")).toBe(robinsonFixtureUrl("seating"));
    expect(only(root, ROBINSON_TARGETS.seatingImageAlt).getAttribute("alt")).toBe("seating picture");
    expect(text(only(root, ROBINSON_TARGETS.seatingCaption))).toBe("Home Field Advantage");
    expect(only(root, ROBINSON_TARGETS.seatingExpandLabel).tagName).toBe("a");
    expect(text(only(root, ROBINSON_TARGETS.seatingExpandLabel))).toBe("View map full size");
    expect(stampedIds(root)).toHaveLength(3);
  });

  it("story: each paragraph by position, the quote and its attribution", () => {
    const root = stamped(draft, "story");
    draft.story.paragraphs.forEach((paragraph, index) => expect(text(only(root, `robinson.story.row:${index}.paragraph`))).toBe(paragraph));
    expect(text(only(root, ROBINSON_TARGETS.storyQuote))).toBe("“We cannot wait for kickoff”");
    expect(text(only(root, ROBINSON_TARGETS.storyAttribution))).toBe("– The GM");
    expect(stampedIds(root)).toHaveLength(5);
  });

  it("info: heading, note, and each row's label and Yes or No", () => {
    const root = stamped(draft, "info");
    expect(text(only(root, ROBINSON_TARGETS.infoHeading))).toBe("Stadium Info");
    expect(text(only(root, ROBINSON_TARGETS.infoNote))).toBe("Dedicated in 1999");
    draft.info.rows.forEach((row, index) => {
      expect(only(root, `robinson.info.row:${index}.label`).tagName).toBe("dt");
      expect(text(only(root, `robinson.info.row:${index}.label`))).toBe(`${row.label}:`);
      expect(only(root, `robinson.info.row:${index}.value`).tagName).toBe("dd");
      expect(text(only(root, `robinson.info.row:${index}.value`))).toBe(row.available ? "Yes" : "No");
    });
    expect(stampedIds(root)).toHaveLength(2 + draft.info.rows.length * 2);
  });

  it("match: only the partner logo is stamped; Schedule's fixture and Homepage's wording are not", () => {
    const root = stamped(draft, "match");
    expect(only(root, ROBINSON_TARGETS.matchPartnerImageAlt).getAttribute("src")).toBe(robinsonFixtureUrl("partner"));
    expect(only(root, ROBINSON_TARGETS.matchPartnerImageAlt).getAttribute("alt")).toBe("partner picture");
    expect(stampedIds(root)).toEqual([ROBINSON_TARGETS.matchPartnerImageAlt]);
    // The card's own text is really on the page, and carries no id.
    for (const node of root.querySelectorAll(".robinson-match > h2, .robinson-match .robinson-buy, .robinson-match-pending p, .robinson-match-pending")) expect(node.getAttribute(EDIT_TARGET_ATTRIBUTE)).toBeNull();
    expect(root.querySelectorAll(".robinson-match > h2")).toHaveLength(1);
    expect(root.querySelectorAll(".robinson-buy")).toHaveLength(1);
  });

  it("lockers: the divider image", () => {
    const root = stamped(draft, "lockers");
    expect(only(root, ROBINSON_TARGETS.lockersImageAlt).getAttribute("src")).toBe(robinsonFixtureUrl("lockers"));
    expect(stampedIds(root)).toHaveLength(1);
  });

  it("food: heading, text, meal pass, and each step's label and icon by step", () => {
    const root = stamped(draft, "food");
    expect(text(only(root, ROBINSON_TARGETS.foodHeading))).toBe("Food and Beverage");
    expect(only(root, ROBINSON_TARGETS.foodBody).tagName).toBe("p");
    expect(text(only(root, ROBINSON_TARGETS.foodBody))).toBe("Drive thru, order, enjoy.");
    expect(only(root, ROBINSON_TARGETS.foodMealPassImageAlt).getAttribute("src")).toBe(robinsonFixtureUrl("mealPass"));
    draft.food.steps.forEach((step, index) => {
      expect(text(only(root, `robinson.food.row:${index}.label`))).toBe(step.label);
      expect(only(root, `robinson.food.row:${index}.iconAlt`).getAttribute("src")).toBe(robinsonFixtureUrl(`step${index + 1}` as "step1"));
    });
    expect(stampedIds(root)).toHaveLength(3 + 6);
  });

  it("route: heading, subheading, bus and route map", () => {
    const root = stamped(draft, "route");
    expect(text(only(root, ROBINSON_TARGETS.routeHeading))).toBe("Road to the Match");
    expect(text(only(root, ROBINSON_TARGETS.routeSubheading))).toBe("Save on gas");
    expect(only(root, ROBINSON_TARGETS.routeBusImageAlt).getAttribute("src")).toBe(robinsonFixtureUrl("bus"));
    expect(only(root, ROBINSON_TARGETS.routeMapImageAlt).getAttribute("src")).toBe(robinsonFixtureUrl("routeMap"));
    expect(stampedIds(root)).toHaveLength(4);
  });

  it("directions: every block's heading, paragraphs, note, bullets and closing line, whether it sits in a p or in the last li", () => {
    const root = stamped(draft, "directions");
    for (const block of draft.directions.blocks) {
      const row = (field: string, key = block.id) => `robinson.directions.row:${key}.${field}`;
      if (block.heading) { expect(only(root, row("heading")).tagName).toBe("h3"); expect(text(only(root, row("heading")))).toBe(block.heading); } else expect(nodesFor(root, row("heading"))).toHaveLength(0);
      block.paragraphs.forEach((paragraph, index) => expect(text(only(root, row("paragraph", `${block.id}-p${index}`)))).toBe(paragraph));
      if (block.note) { expect(only(root, row("note")).classList).toContain("r-parking-note"); expect(text(only(root, row("note")))).toBe(block.note); } else expect(nodesFor(root, row("note"))).toHaveLength(0);
      block.bullets.forEach((bullet, index) => {
        const node = only(root, row("bullet", `${block.id}-b${index}`));
        expect(node.tagName).toBe("li");
        // The last bullet's li also holds the closing line; its own text is the bullet's.
        expect(text(node).startsWith(bullet)).toBe(true);
      });
      if (block.closing) {
        const node = only(root, row("closing"));
        expect(node.classList).toContain("r-route-planner");
        expect(node.tagName).toBe(block.bullets.length ? "span" : "p");
        expect(text(node)).toBe(block.closing);
      } else expect(nodesFor(root, row("closing"))).toHaveLength(0);
    }
    const { flat, bullets, closings } = directionsSequence(draft.directions.blocks);
    expect(stampedIds(root)).toHaveLength(flat.filter(node => node.id).length + bullets.length + closings.length);
  });

  it("every declared field is stamped on the page: nothing is intentionally left without a node", () => {
    const missing: string[] = [];
    for (const section of ROBINSON_SECTIONS) {
      const root = stamped(draft, section.id);
      const present = new Set(stampedIds(root));
      const spec = EDIT_TARGET_REGISTRY.robinson.sections[section.id];
      for (const field of spec.fields ?? []) if (!present.has(`robinson.${section.id}.${field}`)) missing.push(`${section.id}.${field}`);
      for (const field of spec.rowFields ?? []) if (![...present].some(id => id.includes(".row:") && id.endsWith(`.${field}`))) missing.push(`${section.id}.row.${field}`);
    }
    expect(missing).toEqual([]);
  });

  it("every stamped id belongs to the card it is on, and the public page markup has none of its own", () => {
    for (const section of ROBINSON_SECTIONS) {
      const root = stamped(draft, section.id);
      for (const id of stampedIds(root)) expect(id.startsWith(`robinson.${section.id}.`), id).toBe(true);
    }
    const page = hydrateRobinsonContent(draft, ROBINSON_FIXTURE_MEDIA);
    expect(renderToStaticMarkup(createElement(CinematicRobinson, { content: page, ticketing: { purchaseUrl: "", missingPurchaseLabel: "x" } }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Robinson stamps follow the draft", () => {
  it("reordered directions blocks: each block's nodes carry its own ids", () => {
    const reordered = structuredClone(draft);
    reordered.directions.blocks.reverse();
    const root = stamped(reordered, "directions");
    for (const block of reordered.directions.blocks) {
      if (block.heading) expect(text(only(root, `robinson.directions.row:${block.id}.heading`))).toBe(block.heading);
      block.paragraphs.forEach((paragraph, index) => expect(text(only(root, `robinson.directions.row:${block.id}-p${index}.paragraph`))).toBe(paragraph));
      block.bullets.forEach((bullet, index) => expect(text(only(root, `robinson.directions.row:${block.id}-b${index}.bullet`)).startsWith(bullet)).toBe(true));
      if (block.closing) expect(text(only(root, `robinson.directions.row:${block.id}.closing`))).toBe(block.closing);
    }
  });

  it("a block with no heading, no bullets or no paragraphs does not shift its neighbours", () => {
    const sparse = structuredClone(draft);
    sparse.directions.blocks = [sparse.directions.blocks[1], sparse.directions.blocks[3], sparse.directions.blocks[0]];
    const root = stamped(sparse, "directions");
    expect(text(only(root, "robinson.directions.row:no-heading.closing"))).toBe("Plan your trip online.");
    expect(text(only(root, "robinson.directions.row:service-areas.heading"))).toBe("Service Areas");
    expect(text(only(root, "robinson.directions.row:by-transit-p1.paragraph"))).toBe("Walk five minutes.");
    expect(text(only(root, "robinson.directions.row:by-transit.note"))).toBe("Buses run late.");
  });

  it("reordered story paragraphs, info rows and food steps: rows are stamped by their new position", () => {
    const moved = structuredClone(draft);
    moved.story.paragraphs.reverse();
    moved.info.rows.reverse();
    moved.food.steps.reverse();
    expect(text(only(stamped(moved, "story"), "robinson.story.row:0.paragraph"))).toBe("Third story paragraph.");
    const info = stamped(moved, "info");
    expect(text(only(info, "robinson.info.row:0.label"))).toBe("Snack Bar:");
    expect(text(only(info, "robinson.info.row:0.value"))).toBe("Yes");
    expect(text(only(stamped(moved, "food"), "robinson.food.row:0.label"))).toBe("Enjoy during Game");
  });

  it("a step whose icon is not set does not shift the other steps' icon descriptions", () => {
    const gap = structuredClone(draft);
    gap.images.step1 = { assetId: null, alt: "" };
    const root = stamped(gap, "food");
    expect(nodesFor(root, "robinson.food.row:0.iconAlt")).toHaveLength(0);
    expect(only(root, "robinson.food.row:1.iconAlt").getAttribute("src")).toBe(robinsonFixtureUrl("step2"));
    expect(only(root, "robinson.food.row:2.iconAlt").getAttribute("src")).toBe(robinsonFixtureUrl("step3"));
    expect(text(only(root, "robinson.food.row:0.label"))).toBe("Drive-Thru");
  });

  it("an added row or paragraph is stamped and a removed one leaves no stamp", () => {
    const more = structuredClone(draft);
    more.story.paragraphs.push("Fourth story paragraph.");
    more.info.rows.push({ label: "Lockers", available: true });
    expect(text(only(stamped(more, "story"), "robinson.story.row:3.paragraph"))).toBe("Fourth story paragraph.");
    expect(text(only(stamped(more, "info"), "robinson.info.row:4.label"))).toBe("Lockers:");
    const fewer = structuredClone(draft);
    fewer.story.paragraphs.length = 1;
    expect(stampedIds(stamped(fewer, "story")).filter(id => id.includes("paragraph"))).toEqual(["robinson.story.row:0.paragraph"]);
  });

  it("a missing image has no node and so no stamp (nothing to click)", () => {
    const bare = structuredClone(draft);
    bare.images.seating = { assetId: null, alt: "" };
    const root = stamped(bare, "seating");
    expect(nodesFor(root, ROBINSON_TARGETS.seatingImageAlt)).toHaveLength(0);
    expect(nodesFor(root, ROBINSON_TARGETS.seatingExpandLabel)).toHaveLength(0);
    expect(text(only(root, ROBINSON_TARGETS.seatingCaption))).toBe("Home Field Advantage");
  });

  it("stamps built from a draft that no longer matches the rendered nodes never land on a node of the wrong kind", () => {
    // The page was rendered without the first block's heading, but the stamps come from a draft that still has one (a stale frame).
    // The tag check keeps the heading's id off the paragraph that sits at the heading's position.
    const rendered = structuredClone(draft);
    rendered.directions.blocks[0].heading = "";
    const page = hydrateRobinsonContent(robinsonSectionOnly(rendered, "directions"), ROBINSON_FIXTURE_MEDIA);
    const root = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicRobinson, { content: page, ticketing: { purchaseUrl: "", missingPurchaseLabel: "x" } })));
    applyEditTargetStamps(root as unknown as ParentNode, robinsonPreviewStamps(draft, "directions"));
    expect(nodesFor(root, "robinson.directions.row:by-transit.heading")).toHaveLength(0);
  });

  it("the card re-stamps whenever the draft or the preview's content changes", () => {
    const kit = readFileSync("components/admin/ui/editor-kit/PreviewCards.tsx", "utf8");
    expect(kit).toMatch(/watchEditTargetStamps\(node, stamps\) : undefined;\s*\}, \[near, stamps\]\);/);
    expect(readFileSync("components/admin/stadium/RobinsonStadiumEditor.tsx", "utf8")).toMatch(/robinsonPreviewStamps\(deferred, id as RobinsonSectionId\)/);
  });
});
