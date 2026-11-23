import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  CHICK_FIL_A_FIXTURE_MEDIA, FOOTHILL_FIXTURE_MEDIA, TICKETS_FIXTURE_MEDIA, chickFilAFixture, foothillFixture, ticketsFixture,
} from "../fixtures/visitor-click-fixtures";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { hydrateStadiumContent, type StadiumContent } from "@/lib/stadium-content";
import { hydrateChickFilAContent, type ChickFilAContent } from "@/lib/chick-fil-a-content";
import { hydrateTicketsContent, type TicketsContent } from "@/lib/tickets-content";
import { FoothillSectionFields, type FoothillFieldsApi } from "@/components/admin/stadium/FoothillSectionFields";
import { FOOTHILL_SECTIONS, type FoothillSectionId } from "@/components/admin/stadium/foothill-sections";
import { FOOTHILL_TARGETS } from "@/components/admin/stadium/foothill-edit-targets";
import { ChickFilASectionFields, type ChickFilAFieldsApi } from "@/components/admin/chick-fil-a/ChickFilASectionFields";
import { CHICK_FIL_A_CARDS, type ChickFilACardId } from "@/components/admin/chick-fil-a/chick-fil-a-sections";
import { CHICK_FIL_A_TARGETS } from "@/components/admin/chick-fil-a/chick-fil-a-edit-targets";
import { TicketsSectionFields, type TicketsFieldsApi } from "@/components/admin/tickets/TicketsSectionFields";
import { TICKETS_SECTIONS, type TicketsSectionId } from "@/components/admin/tickets/tickets-sections";
import { TICKETS_TARGETS } from "@/components/admin/tickets/tickets-edit-targets";
import { TextField as PartnerTextField } from "@/components/admin/stadium/PartnerPageParts";
import { TextField as TicketTextField, ImageSlot as TicketImageSlot } from "@/components/admin/ticket-pages/editor-parts";

vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });

const stampsIn = (markup: string) => [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
/** The markup from one stamped control on, enough to see its label and value. */
const around = (markup: string, target: string) => {
  const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
  expect(at, target).toBeGreaterThan(-1);
  return markup.slice(at, at + 700);
};
const noop = () => undefined;

/* ---------------------------------------------------------------- Foothill Transit */
const fApi = (draft: StadiumContent): FoothillFieldsApi => ({ draft, page: hydrateStadiumContent(draft, FOOTHILL_FIXTURE_MEDIA), locked: false, uploading: null, update: noop, replace: noop, upload: async () => true, removeImage: noop });
const fMarkup = (id: FoothillSectionId, draft = foothillFixture()) => renderToStaticMarkup(createElement(FoothillSectionFields, { api: fApi(draft), id }));
/** What each Foothill card's dialog must stamp for a draft, written out from the registry's grammar and the draft (not from the helpers under test). */
function foothillExpected(id: FoothillSectionId, draft: StadiumContent): string[] {
  const row = (key: string | number, field: string) => `foothill.${id}.row:${key}.${field}`;
  switch (id) {
    case "heading": return ["foothill.heading.title", "foothill.heading.subtitle"];
    case "images": return ["foothill.images.busImageAlt", "foothill.images.mapImageAlt"];
    case "map": return [];
    case "match": return ["foothill.match.partnerImageAlt"];
    case "benefits": return ["foothill.benefits.heading", "foothill.benefits.footnote", ...draft.benefits.flatMap((_, index) => [row(index, "title"), row(index, "detail")])];
    case "sections": return draft.sections.flatMap(section => [row(section.id, "heading"), row(section.id, "body"), row(section.id, "note"), ...section.bullets.map((_, index) => row(`${section.id}-b${index}`, "bullet"))]);
  }
}

describe("Foothill Transit: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.foothill.sections;
  it("the registry's sections are exactly the Foothill sections, on the Foothill Transit route", () => {
    expect(EDIT_TARGET_REGISTRY.foothill.route).toBe("/admin/foothill-transit");
    expect(Object.keys(SECTIONS)).toEqual(FOOTHILL_SECTIONS.map(section => section.id));
  });

  it.each(FOOTHILL_SECTIONS.map(section => section.id))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampsIn(fMarkup(id));
    expect([...stamped].sort()).toEqual(foothillExpected(id, foothillFixture()).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
  });

  it("every single field the registry declares is stamped in its section, and every row field on its rows", () => {
    for (const [id, spec] of Object.entries(SECTIONS)) {
      const stamped = stampsIn(fMarkup(id as FoothillSectionId));
      for (const field of spec.fields ?? []) expect(stamped, `${id}.${field}`).toContain(`foothill.${id}.${field}`);
      for (const field of spec.rowFields ?? []) expect(stamped.some(target => target.endsWith(`.${field}`) && target.includes(".row:")), `${id} rows ${field}`).toBe(true);
    }
  });

  it("each control's id is on the control the label names", () => {
    expect(around(fMarkup("heading"), FOOTHILL_TARGETS.headingTitle)).toMatch(/>Page heading<[\s\S]*value="Foothill Transit"/);
    expect(around(fMarkup("heading"), FOOTHILL_TARGETS.headingSubtitle)).toMatch(/>Subtitle<[\s\S]*value="Ride the bus to the match"/);
    expect(around(fMarkup("images"), FOOTHILL_TARGETS.imagesBusImageAlt)).toMatch(/>Image description<[\s\S]*value="bus picture"/);
    expect(around(fMarkup("images"), FOOTHILL_TARGETS.imagesMapImageAlt)).toMatch(/>Image description<[\s\S]*value="map picture"/);
    expect(around(fMarkup("match"), FOOTHILL_TARGETS.matchPartnerImageAlt)).toMatch(/>Image description<[\s\S]*value="partner picture"/);
    expect(around(fMarkup("benefits"), FOOTHILL_TARGETS.benefitsHeading)).toMatch(/>Benefits heading<[\s\S]*value="Your ticket includes"/);
    expect(around(fMarkup("benefits"), "foothill.benefits.row:1.title")).toMatch(/>Title<[\s\S]*value="Reserved seat"/);
    expect(around(fMarkup("benefits"), "foothill.benefits.row:2.detail")).toMatch(/>Details<[\s\S]*One per fan\./);
    expect(around(fMarkup("benefits"), FOOTHILL_TARGETS.benefitsFootnote)).toMatch(/>Benefits footnote<[\s\S]*Terms apply\./);
    expect(around(fMarkup("sections"), "foothill.sections.row:by-bus.heading")).toMatch(/>Heading<[\s\S]*value="By Bus"/);
    expect(around(fMarkup("sections"), "foothill.sections.row:by-bus.body")).toMatch(/>Information<[\s\S]*Take Line 187\./);
    expect(around(fMarkup("sections"), "foothill.sections.row:parking.note")).toMatch(/>Footnote<[\s\S]*Lot 5 is on Bonnie Ave\./);
    expect(around(fMarkup("sections"), "foothill.sections.row:by-bus-b1.bullet")).toMatch(/>Bullet 2<[\s\S]*Stop at Sierra Bonita/);
  });

  it("section rows follow the block's id when the blocks are reordered (a hidden block still has its controls)", () => {
    const draft = foothillFixture();
    draft.sections.reverse();
    const stamped = stampsIn(fMarkup("sections", draft));
    expect([...stamped].sort()).toEqual(foothillExpected("sections", draft).sort());
    // The first block in the dialog is now parking, and its controls carry parking ids.
    expect(stamped.slice(0, 3).every(target => target.startsWith("foothill.sections.row:parking."))).toBe(true);
    expect(stamped).toContain("foothill.sections.row:hidden-block.heading");
  });

  it("a stamp is a data attribute on the field's own wrapper only: the controls keep their labels and structure", () => {
    expect(fMarkup("heading")).toMatch(/<div class="[^"]*" data-edit-target="foothill\.heading\.title"><div class="[^"]*"><label[^>]*>Page heading<\/label><input/);
    expect(fMarkup("heading").replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
  });
});

describe("Foothill Transit: the editor and the public page", () => {
  const editor = read("components/admin/stadium/StadiumEditor.tsx");
  it("section cards open the clicked field's section and ask the dialog to focus the field", () => {
    expect(editor).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as FoothillSectionId, event\); dialog\.focusField\(target\); \}\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });
  it("the cards stamp the draft the preview shows (the deferred one), per section, built once per draft", () => {
    expect(editor).toMatch(/const stampsBySection = useMemo\(\(\) => new Map\(FOOTHILL_SECTIONS\.map\(section => \[section\.id, deferred \? foothillPreviewStamps\(deferred, section\.id\) : \[\]\]\)\), \[deferred\]\);/);
    expect(editor).toMatch(/stamps=\{id => stampsBySection\.get\(id as FoothillSectionId\) \?\? \[\]\}/);
    expect(editor).toMatch(/const previewOf = \(id: string\) => deferred && <SectionLive/);
  });
  it("the dialog's own live preview stays inert: no stamps and no click handlers there", () => {
    expect(editor.slice(editor.indexOf("renderPreview={id => dialog.open"))).not.toMatch(/stamps|foothillPreviewStamps|onClick/);
  });
  it("only the admin preview stamps public nodes; the public component gains nothing", () => {
    expect(read("components/cinematic/CinematicStadium.tsx")).not.toMatch(/edit-target|editTarget/);
  });
});

/* ---------------------------------------------------------------- Chick-fil-A */
const cApi = (draft: ChickFilAContent): ChickFilAFieldsApi => ({ draft, page: hydrateChickFilAContent(draft, CHICK_FIL_A_FIXTURE_MEDIA, false), locked: false, uploading: null, update: noop, upload: async () => true, removeImage: noop });
const cMarkup = (id: ChickFilACardId, draft = chickFilAFixture()) => renderToStaticMarkup(createElement(ChickFilASectionFields, { api: cApi(draft), id }));
function chickFilAExpected(id: ChickFilACardId): string[] {
  const row = (step: number, field: string) => `chickFilA.steps.row:${step}.${field}`;
  switch (id) {
    case "heading": return ["chickFilA.heading.title", "chickFilA.heading.subtitle"];
    case "details": return ["chickFilA.details.heading", "chickFilA.details.body", "chickFilA.details.mealPassImageAlt"];
    case "steps": return [0, 1, 2].flatMap(step => [row(step, "label"), row(step, "number"), row(step, "iconAlt")]);
    case "map": return ["chickFilA.map.imageAlt"];
    case "match": return ["chickFilA.match.partnerImageAlt"];
    case "restaurant": return ["chickFilA.restaurant.imageAlt"];
    case "background": return ["chickFilA.background.imageAlt"];
  }
}

describe("Chick-fil-A: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.chickFilA.sections;
  it("the registry's sections are exactly the Chick-fil-A cards, on the Chick-fil-A route", () => {
    expect(EDIT_TARGET_REGISTRY.chickFilA.route).toBe("/admin/chick-fil-a");
    expect(Object.keys(SECTIONS)).toEqual(CHICK_FIL_A_CARDS.map(card => card.id));
  });

  it.each(CHICK_FIL_A_CARDS.map(card => card.id))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampsIn(cMarkup(id));
    expect([...stamped].sort()).toEqual(chickFilAExpected(id).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
  });

  it("every single field the registry declares is stamped in its section, and every row field on its rows", () => {
    for (const [id, spec] of Object.entries(SECTIONS)) {
      const stamped = stampsIn(cMarkup(id as ChickFilACardId));
      for (const field of spec.fields ?? []) expect(stamped, `${id}.${field}`).toContain(`chickFilA.${id}.${field}`);
      for (const field of spec.rowFields ?? []) expect(stamped.some(target => target.endsWith(`.${field}`) && target.includes(".row:")), `${id} rows ${field}`).toBe(true);
    }
  });

  it("each control's id is on the control the label names", () => {
    expect(around(cMarkup("heading"), CHICK_FIL_A_TARGETS.headingTitle)).toMatch(/>Page heading<[\s\S]*value="Food &amp; Beverage"/);
    expect(around(cMarkup("heading"), CHICK_FIL_A_TARGETS.headingSubtitle)).toMatch(/>Subtitle<[\s\S]*value="Eat before the match"/);
    expect(around(cMarkup("details"), CHICK_FIL_A_TARGETS.detailsHeading)).toMatch(/>Details heading<[\s\S]*value="Meal pass details"/);
    expect(around(cMarkup("details"), CHICK_FIL_A_TARGETS.detailsBody)).toMatch(/>Details copy<[\s\S]*Show your pass at the drive-thru\./);
    expect(around(cMarkup("details"), CHICK_FIL_A_TARGETS.detailsMealPassImageAlt)).toMatch(/>Image description<[\s\S]*value="mealPass picture"/);
    expect(around(cMarkup("steps"), "chickFilA.steps.row:1.label")).toMatch(/>Label<[\s\S]*value="Free Game Ticket"/);
    expect(around(cMarkup("steps"), "chickFilA.steps.row:2.number")).toMatch(/>Number<[\s\S]*value="3"/);
    expect(around(cMarkup("steps"), "chickFilA.steps.row:0.iconAlt")).toMatch(/>Image description<[\s\S]*value="driveThru picture"/);
    expect(around(cMarkup("steps"), "chickFilA.steps.row:1.iconAlt")).toMatch(/>Image description<[\s\S]*value="freeTicket picture"/);
    expect(around(cMarkup("steps"), "chickFilA.steps.row:2.iconAlt")).toMatch(/>Image description<[\s\S]*value="enjoyGame picture"/);
    expect(around(cMarkup("map"), CHICK_FIL_A_TARGETS.mapImageAlt)).toMatch(/>Image description<[\s\S]*value="map picture"/);
    expect(around(cMarkup("match"), CHICK_FIL_A_TARGETS.matchPartnerImageAlt)).toMatch(/>Image description<[\s\S]*value="partner picture"/);
    expect(around(cMarkup("restaurant"), CHICK_FIL_A_TARGETS.restaurantImageAlt)).toMatch(/>Image description<[\s\S]*value="restaurant picture"/);
    expect(around(cMarkup("background"), CHICK_FIL_A_TARGETS.backgroundImageAlt)).toMatch(/>Image description<[\s\S]*value="background picture"/);
  });

  it("a stamp is a data attribute on the field's own wrapper only", () => {
    expect(cMarkup("heading")).toMatch(/<div class="[^"]*" data-edit-target="chickFilA\.heading\.title"><div class="[^"]*"><label[^>]*>Page heading<\/label><input/);
    expect(cMarkup("heading").replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
  });
});

describe("Chick-fil-A: the editor and the public page", () => {
  const editor = read("components/admin/chick-fil-a/ChickFilAEditor.tsx");
  it("cards open the clicked field's card and ask the dialog to focus the field", () => {
    expect(editor).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as ChickFilACardId, event\); dialog\.focusField\(target\); \}\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });
  it("the cards' stamps are built once, per card, so a card's stamp watcher restarts only when its stamps change", () => {
    expect(editor).toMatch(/const stampsByCard = useMemo\(\(\) => new Map\(CHICK_FIL_A_CARDS\.map\(card => \[card\.id, chickFilAPreviewStamps\(card\.id\)\]\)\), \[\]\);/);
    expect(editor).toMatch(/stamps=\{id => stampsByCard\.get\(id as ChickFilACardId\) \?\? \[\]\}/);
  });
  it("the dialog's own live preview stays inert: no stamps and no click handlers there", () => {
    expect(editor.slice(editor.indexOf("renderPreview={id => dialog.open"))).not.toMatch(/stamps|chickFilAPreviewStamps|onClick/);
  });
  it("only the admin preview stamps public nodes; the public component gains nothing", () => {
    expect(read("components/cinematic/CinematicChickFilA.tsx")).not.toMatch(/edit-target|editTarget/);
  });
});

/* ---------------------------------------------------------------- Tickets */
const tApi = (draft: TicketsContent): TicketsFieldsApi => ({ draft, page: hydrateTicketsContent(draft, TICKETS_FIXTURE_MEDIA, false), locked: false, uploading: null, update: noop, setFlag: noop, upload: async () => true, removeImage: noop });
const tMarkup = (id: TicketsSectionId, draft = ticketsFixture()) => renderToStaticMarkup(createElement(TicketsSectionFields, { api: tApi(draft), id }));
function ticketsExpected(id: TicketsSectionId, draft: TicketsContent): string[] {
  const row = (key: number, field: string) => `tickets.${id}.row:${key}.${field}`;
  switch (id) {
    case "page": return ["title", "subtitle", "purchaseUrl", "missingPurchaseLabel", "bannerImageAlt", "partnerImageAlt"].map(field => `tickets.page.${field}`);
    case "perks": return ["tickets.perks.heading", ...[0, 1, 2].map(index => row(index, "label"))];
    case "includes": return ["tickets.includes.heading", "tickets.includes.footnote", ...draft.benefits.flatMap((_, index) => [row(index, "title"), row(index, "detail")])];
    case "transit": return ["heading", "subtitle", "busImageAlt", "mapImageAlt"].map(field => `tickets.transit.${field}`);
    case "directions": return ["directionsHeading", "directionsBody", "parkingHeading", "parkingBody", "parkingNote"].map(field => `tickets.directions.${field}`);
  }
}

describe("Tickets: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.tickets.sections;
  it("the registry's sections are exactly the Tickets sections, on the Tickets route", () => {
    expect(EDIT_TARGET_REGISTRY.tickets.route).toBe("/admin/tickets");
    expect(Object.keys(SECTIONS)).toEqual(TICKETS_SECTIONS.map(section => section.id));
  });

  it.each(TICKETS_SECTIONS.map(section => section.id))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampsIn(tMarkup(id));
    expect([...stamped].sort()).toEqual(ticketsExpected(id, ticketsFixture()).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
  });

  it("every single field the registry declares is stamped in its section, and every row field on its rows", () => {
    for (const [id, spec] of Object.entries(SECTIONS)) {
      const stamped = stampsIn(tMarkup(id as TicketsSectionId));
      for (const field of spec.fields ?? []) expect(stamped, `${id}.${field}`).toContain(`tickets.${id}.${field}`);
      for (const field of spec.rowFields ?? []) expect(stamped.some(target => target.endsWith(`.${field}`) && target.includes(".row:")), `${id} rows ${field}`).toBe(true);
    }
  });

  it("each control's id is on the control the label names", () => {
    expect(around(tMarkup("page"), TICKETS_TARGETS.pageTitle)).toMatch(/>Page heading<[\s\S]*value="Tickets"/);
    expect(around(tMarkup("page"), TICKETS_TARGETS.pageSubtitle)).toMatch(/>Subtitle<[\s\S]*value="Season and single match"/);
    expect(around(tMarkup("page"), TICKETS_TARGETS.pagePurchaseUrl)).toMatch(/>External ticket purchase URL<[\s\S]*value="https:\/\/tickets\.test\/buy"/);
    expect(around(tMarkup("page"), TICKETS_TARGETS.pageMissingPurchaseLabel)).toMatch(/>Message until a purchase link is available<[\s\S]*value="Ticket link coming soon"/);
    expect(around(tMarkup("page"), TICKETS_TARGETS.pageBannerImageAlt)).toMatch(/>Image description<[\s\S]*value="banner picture"/);
    expect(around(tMarkup("page"), TICKETS_TARGETS.pagePartnerImageAlt)).toMatch(/>Image description<[\s\S]*value="partner picture"/);
    expect(around(tMarkup("perks"), TICKETS_TARGETS.perksHeading)).toMatch(/>Perks heading<[\s\S]*value="Season perks"/);
    expect(around(tMarkup("perks"), "tickets.perks.row:2.label")).toMatch(/>Label<[\s\S]*value="Raffle entry"/);
    expect(around(tMarkup("includes"), TICKETS_TARGETS.includesHeading)).toMatch(/>Benefits heading<[\s\S]*value="Your ticket includes"/);
    expect(around(tMarkup("includes"), "tickets.includes.row:1.title")).toMatch(/>Title<[\s\S]*value="Reserved seat"/);
    expect(around(tMarkup("includes"), "tickets.includes.row:2.detail")).toMatch(/>Details<[\s\S]*One per fan\./);
    expect(around(tMarkup("includes"), TICKETS_TARGETS.includesFootnote)).toMatch(/>Benefits footnote<[\s\S]*Terms apply\./);
    expect(around(tMarkup("transit"), TICKETS_TARGETS.transitHeading)).toMatch(/>Bus section heading<[\s\S]*value="Ride the bus"/);
    expect(around(tMarkup("transit"), TICKETS_TARGETS.transitSubtitle)).toMatch(/>Bus section subtitle<[\s\S]*value="Save on gas"/);
    expect(around(tMarkup("transit"), TICKETS_TARGETS.transitBusImageAlt)).toMatch(/>Image description<[\s\S]*value="bus picture"/);
    expect(around(tMarkup("transit"), TICKETS_TARGETS.transitMapImageAlt)).toMatch(/>Image description<[\s\S]*value="map picture"/);
    expect(around(tMarkup("directions"), TICKETS_TARGETS.directionsHeading)).toMatch(/>Directions heading<[\s\S]*value="Directions"/);
    expect(around(tMarkup("directions"), TICKETS_TARGETS.directionsBody)).toMatch(/>Directions<[\s\S]*Take Colorado Blvd to the stadium\./);
    expect(around(tMarkup("directions"), TICKETS_TARGETS.directionsParkingHeading)).toMatch(/>Parking heading<[\s\S]*value="Parking"/);
    expect(around(tMarkup("directions"), TICKETS_TARGETS.directionsParkingBody)).toMatch(/>Parking information<[\s\S]*Daily permits are two dollars\./);
    expect(around(tMarkup("directions"), TICKETS_TARGETS.directionsParkingNote)).toMatch(/>Parking footnote<[\s\S]*Lot 5 is on Bonnie Ave\./);
  });

  it("the perk pictures' descriptions are not stamped: the page draws them with an empty description", () => {
    const stamped = stampsIn(tMarkup("perks"));
    expect(stamped.filter(target => target.includes("Alt"))).toEqual([]);
    expect(tMarkup("perks")).toContain("Perk 1 image");
  });

  it("the shared editor parts add nothing without a target (Season Membership and Know Before You Go use them too)", () => {
    const plain = renderToStaticMarkup(createElement(TicketTextField, { label: "Heading", value: "x", max: 120, disabled: false, onChange: noop }));
    expect(plain).not.toContain("data-edit-target");
    const image = renderToStaticMarkup(createElement(TicketImageSlot, { label: "Banner", description: "d", previewUrl: null, alt: "a", hasImage: false, disabled: false, uploading: false, onUpload: async () => true, onRemove: noop, onAlt: noop }));
    expect(image).not.toContain("data-edit-target");
    expect(renderToStaticMarkup(createElement(PartnerTextField, { label: "Heading", value: "x", max: 120, disabled: false, onChange: noop }))).not.toContain("data-edit-target");
  });

  it("a stamp is a data attribute on the field's own wrapper only", () => {
    expect(tMarkup("page")).toMatch(/<div class="[^"]*" data-edit-target="tickets\.page\.title"><div class="[^"]*"><label[^>]*>Page heading<\/label><input/);
    expect(tMarkup("page").replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
  });
});

describe("Tickets: the editor and the public page", () => {
  const editor = read("components/admin/tickets/TicketsEditor.tsx");
  it("section cards open the clicked field's section and ask the dialog to focus the field", () => {
    expect(editor).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as TicketsSectionId, event\); dialog\.focusField\(target\); \}\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });
  it("the cards stamp the draft the preview shows (the deferred one), per section, built once per draft", () => {
    expect(editor).toMatch(/const stampsBySection = useMemo\(\(\) => new Map\(TICKETS_SECTIONS\.map\(section => \[section\.id, deferred \? ticketsPreviewStamps\(deferred, section\.id\) : \[\]\]\)\), \[deferred\]\);/);
    expect(editor).toMatch(/stamps=\{id => stampsBySection\.get\(id as TicketsSectionId\) \?\? \[\]\}/);
    expect(editor).toMatch(/const previewOf = \(id: string\) => deferred && <SectionLive/);
  });
  it("the dialog's own live preview stays inert: no stamps and no click handlers there", () => {
    expect(editor.slice(editor.indexOf("renderPreview={id => dialog.open"))).not.toMatch(/stamps|ticketsPreviewStamps|onClick/);
  });
  it("only the admin preview stamps public nodes; the public component gains nothing", () => {
    expect(read("components/cinematic/CinematicTickets.tsx")).not.toMatch(/edit-target|editTarget/);
  });
  it("Season Membership and Know Before You Go are untouched by this package", () => {
    expect(read("components/admin/ticket-pages/TicketPageEditor.tsx")).not.toMatch(/edit-target|editTarget|focusField|stamps=/);
  });
});
