import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { kbygFixture, kbygFixtureMedia, seasonFixture, seasonFixtureMedia } from "../fixtures/visitor-click-fixtures";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { ticketPageView, type KnowBeforeYouGoContent, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import { KBYG_SPEC, SEASON_SPEC, type KbygSectionId, type SeasonSectionId } from "@/components/admin/ticket-pages/ticket-page-sections";
import { fields as seasonFields } from "@/components/admin/ticket-pages/SeasonMembershipEditor";
import { fields as kbygFields } from "@/components/admin/ticket-pages/KnowBeforeYouGoEditor";
import type { TicketPageFieldsApi } from "@/components/admin/ticket-pages/TicketPageEditor";
import { KBYG_TARGETS, SEASON_TARGETS } from "@/components/admin/ticket-pages/ticket-page-edit-targets";
import { TextField, ImageSlot } from "@/components/admin/ticket-pages/editor-parts";
import { StringListField, TableEditor } from "@/components/admin/ui/editor-kit";

/**
 * UI-PREVIEW-CLICK-VISITOR-3: every declared Season Ticket Membership and Know Before You Go field has its control in the
 * dialog, carrying the id a preview click focuses it by; TicketPageEditor wires the cards' stamps, the click and the focus.
 */
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: () => new Promise(() => undefined) }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });
const noop = () => undefined;
const stampsIn = (markup: string) => [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
/** The markup from one stamped control on, enough to see its label and value. */
const around = (markup: string, target: string) => {
  const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
  expect(at, target).toBeGreaterThan(-1);
  return markup.slice(at, at + 700);
};

/* ---------------------------------------------------------------- Season Ticket Membership */
const sApi = (draft: SeasonMembershipContent): TicketPageFieldsApi<"season-membership"> => ({
  draft, view: ticketPageView<"season-membership">(draft, seasonFixtureMedia(draft)), locked: false, uploading: null, change: noop, setShown: noop, upload: async () => true, removeImage: noop,
});
const sMarkup = (id: SeasonSectionId, draft = seasonFixture()) => renderToStaticMarkup(seasonFields(sApi(draft), id) as never);
/** What each card's dialog must stamp for a draft, written out from the registry's grammar and the draft (not from the helpers under test). */
function seasonExpected(id: SeasonSectionId, draft: SeasonMembershipContent): string[] {
  const p = (field: string, row?: string | number) => `seasonMembership.${id}.${row === undefined ? "" : `row:${row}.`}${field}`;
  switch (id) {
    case "heading": return [p("title"), p("subtitle")];
    case "intro": return [p("text"), p("includesHeading"), ...draft.intro.highlights.map((_, index) => p("highlight", index)), ...draft.intro.includes.map((_, index) => p("include", index))];
    case "pricing": return [p("sectionLabel"), p("footnote"), ...draft.pricing.columns.map((_, index) => p("column", index)),
      ...draft.pricing.rows.flatMap(row => [p("name", row.id), p("price0", row.id), p("price1", row.id), p("price2", row.id), p("badgeAlt", row.id)])];
    case "button": return [p("label"), p("href")];
    case "benefits": return [p("heading"), ...draft.benefits.items.flatMap(item => [p("label", item.id), p("iconAlt", item.id)])];
    case "closing": return [p("heading"), p("ticketImageAlt")];
  }
}

describe("Season Ticket Membership: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.seasonMembership.sections;
  it("the registry's sections are exactly the Season Membership cards, on the Season Membership route", () => {
    expect(EDIT_TARGET_REGISTRY.seasonMembership.route).toBe("/admin/season-membership");
    expect(Object.keys(SECTIONS)).toEqual(SEASON_SPEC.sections.map(section => section.id));
  });

  it.each(SEASON_SPEC.sections.map(section => section.id as SeasonSectionId))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampsIn(sMarkup(id));
    expect([...stamped].sort()).toEqual(seasonExpected(id, seasonFixture()).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
  });

  it("every single field the registry declares is stamped in its section, and every row field on its rows", () => {
    for (const [id, spec] of Object.entries(SECTIONS)) {
      const stamped = stampsIn(sMarkup(id as SeasonSectionId));
      for (const field of spec.fields ?? []) expect(stamped, `${id}.${field}`).toContain(`seasonMembership.${id}.${field}`);
      for (const field of spec.rowFields ?? []) expect(stamped.some(target => target.endsWith(`.${field}`) && target.includes(".row:")), `${id} rows ${field}`).toBe(true);
    }
  });

  it("each control's id is on the control the label names", () => {
    expect(around(sMarkup("heading"), SEASON_TARGETS.headingTitle)).toMatch(/>Title<[\s\S]*value="Season Ticket Membership"/);
    expect(around(sMarkup("heading"), SEASON_TARGETS.headingSubtitle)).toMatch(/>Subtitle \(red line\)<[\s\S]*value="Join the Rose City family"/);
    expect(around(sMarkup("intro"), SEASON_TARGETS.introText)).toMatch(/>Introduction<[\s\S]*Become a season ticket member\./);
    expect(around(sMarkup("intro"), SEASON_TARGETS.introIncludesHeading)).toMatch(/>List heading<[\s\S]*value="Membership includes"/);
    expect(around(sMarkup("intro"), "seasonMembership.intro.row:1.highlight")).toMatch(/aria-label="Highlights, highlight 2"[\s\S]*Scarf/);
    expect(around(sMarkup("intro"), "seasonMembership.intro.row:2.include")).toMatch(/aria-label="Included items, included item 3"[\s\S]*Raffle entries/);
    expect(around(sMarkup("pricing"), SEASON_TARGETS.pricingSectionLabel)).toMatch(/>Section heading<[\s\S]*value="Section"/);
    expect(around(sMarkup("pricing"), "seasonMembership.pricing.row:1.column")).toMatch(/>Column 2 heading<[\s\S]*value="Single match price"/);
    expect(around(sMarkup("pricing"), "seasonMembership.pricing.row:seat-reserved.name")).toMatch(/aria-label="Section name, seating section 2" maxLength="\d+" value="Reserved Seating"/);
    expect(around(sMarkup("pricing"), "seasonMembership.pricing.row:seat-reserved.price0")).toMatch(/aria-label="Full season per match price, seating section 2" maxLength="\d+" value="\$18"/);
    expect(around(sMarkup("pricing"), "seasonMembership.pricing.row:seat-club.price2")).toMatch(/aria-label="Full season savings, seating section 3" maxLength="\d+" value="\$6"/);
    expect(around(sMarkup("pricing"), SEASON_TARGETS.pricingFootnote)).toMatch(/>Footnote<[\s\S]*Prices include fees\./);
    expect(around(sMarkup("pricing"), "seasonMembership.pricing.row:seat-club.badgeAlt")).toMatch(/>Image description<[\s\S]*value="seat-club picture"/);
    expect(around(sMarkup("button"), SEASON_TARGETS.buttonLabel)).toMatch(/>Button text<[\s\S]*value="Buy Season Membership"/);
    expect(around(sMarkup("button"), SEASON_TARGETS.buttonHref)).toMatch(/>Button link<[\s\S]*value="https:\/\/tickets\.test\/season"/);
    expect(around(sMarkup("benefits"), SEASON_TARGETS.benefitsHeading)).toMatch(/>Heading<[\s\S]*value="Member Benefits"/);
    expect(around(sMarkup("benefits"), "seasonMembership.benefits.row:benefit-card.label")).toMatch(/>Label<[\s\S]*value="Member card"/);
    expect(around(sMarkup("benefits"), "seasonMembership.benefits.row:benefit-raffle.iconAlt")).toMatch(/>Image description<[\s\S]*value="benefit-raffle picture"/);
    expect(around(sMarkup("closing"), SEASON_TARGETS.closingHeading)).toMatch(/>Heading<[\s\S]*value="Become a member today"/);
    expect(around(sMarkup("closing"), SEASON_TARGETS.closingTicketImageAlt)).toMatch(/>Image description<[\s\S]*value="ticket picture"/);
  });

  it("rows follow their stable id when the price rows and benefits are reordered (the controls move with the row)", () => {
    const draft = seasonFixture();
    draft.pricing.rows.reverse();
    draft.benefits.items.reverse();
    const pricing = stampsIn(sMarkup("pricing", draft)), benefits = stampsIn(sMarkup("benefits", draft));
    expect([...pricing].sort()).toEqual(seasonExpected("pricing", draft).sort());
    expect([...benefits].sort()).toEqual(seasonExpected("benefits", draft).sort());
    // The first table row is now Club Seating, and its cells carry the club row's id.
    expect(around(sMarkup("pricing", draft), "seasonMembership.pricing.row:seat-club.name")).toMatch(/aria-label="Section name, seating section 1" maxLength="\d+" value="Club Seating"/);
    expect(pricing.find(target => target.endsWith(".name"))).toBe("seasonMembership.pricing.row:seat-club.name");
    expect(benefits.find(target => target.endsWith(".label"))).toBe("seasonMembership.benefits.row:benefit-raffle.label");
  });

  it("a row with no picture slot has no image-description stamp and its other fields keep theirs", () => {
    const draft = seasonFixture();
    delete draft.images["seat-reserved"];
    const stamped = stampsIn(sMarkup("pricing", draft));
    expect(stamped).not.toContain("seasonMembership.pricing.row:seat-reserved.badgeAlt");
    expect(stamped).toContain("seasonMembership.pricing.row:seat-reserved.name");
    expect(stamped).toContain("seasonMembership.pricing.row:seat-club.badgeAlt");
  });

  it("a stamp is a data attribute on the field's own wrapper only, and the shared parts add nothing without a target", () => {
    expect(sMarkup("heading")).toMatch(/<div class="[^"]*" data-edit-target="seasonMembership\.heading\.title"><div class="[^"]*"><label[^>]*>Title<\/label><input/);
    expect(sMarkup("pricing").replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
    expect(renderToStaticMarkup(createElement(TextField, { label: "Heading", value: "x", max: 120, disabled: false, onChange: noop }))).not.toContain("data-edit-target");
    expect(renderToStaticMarkup(createElement(ImageSlot, { label: "Banner", description: "d", previewUrl: null, alt: "a", hasImage: false, disabled: false, uploading: false, onUpload: async () => true, onRemove: noop, onAlt: noop }))).not.toContain("data-edit-target");
  });
});

/* ---------------------------------------------------------------- Know Before You Go */
const kApi = (draft: KnowBeforeYouGoContent): TicketPageFieldsApi<"know-before-you-go"> => ({
  draft, view: ticketPageView<"know-before-you-go">(draft, kbygFixtureMedia(draft)), locked: false, uploading: null, change: noop, setShown: noop, upload: async () => true, removeImage: noop,
});
const kMarkup = (id: KbygSectionId, draft = kbygFixture()) => renderToStaticMarkup(kbygFields(kApi(draft), id) as never);
function kbygExpected(id: KbygSectionId, draft: KnowBeforeYouGoContent): string[] {
  const p = (field: string, row?: string) => `knowBeforeYouGo.${id}.${row === undefined ? "" : `row:${row}.`}${field}`;
  switch (id) {
    case "heading": return [p("title"), p("subtitle")];
    case "match": return [p("competition"), p("watchLabel"), p("watchHref"), p("youtubeImageAlt")];
    case "facts": return draft.facts.tiles.flatMap(tile => [p("label", tile.id), p("iconAlt", tile.id)]);
    case "raffle": return [p("heading"), p("subheading"), p("imageAlt"), p("body")];
    case "donor": return [p("heading"), p("name"), p("imageAlt"), p("body"), p("buttonLabel"), p("buttonHref")];
  }
}

describe("Know Before You Go: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.knowBeforeYouGo.sections;
  it("the registry's sections are exactly the Know Before You Go cards, on the Know Before You Go route", () => {
    expect(EDIT_TARGET_REGISTRY.knowBeforeYouGo.route).toBe("/admin/know-before-you-go");
    expect(Object.keys(SECTIONS)).toEqual(KBYG_SPEC.sections.map(section => section.id));
  });

  it.each(KBYG_SPEC.sections.map(section => section.id as KbygSectionId))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampsIn(kMarkup(id));
    expect([...stamped].sort()).toEqual(kbygExpected(id, kbygFixture()).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
  });

  it("every single field the registry declares is stamped in its section, and every row field on its rows", () => {
    for (const [id, spec] of Object.entries(SECTIONS)) {
      const stamped = stampsIn(kMarkup(id as KbygSectionId));
      for (const field of spec.fields ?? []) expect(stamped, `${id}.${field}`).toContain(`knowBeforeYouGo.${id}.${field}`);
      for (const field of spec.rowFields ?? []) expect(stamped.some(target => target.endsWith(`.${field}`) && target.includes(".row:")), `${id} rows ${field}`).toBe(true);
    }
  });

  it("each control's id is on the control the label names", () => {
    expect(around(kMarkup("heading"), KBYG_TARGETS.headingTitle)).toMatch(/>Title<[\s\S]*value="Know Before You Go"/);
    expect(around(kMarkup("heading"), KBYG_TARGETS.headingSubtitle)).toMatch(/>Subtitle \(red line\)<[\s\S]*value="Match day made easy"/);
    expect(around(kMarkup("match"), KBYG_TARGETS.matchCompetition)).toMatch(/>Competition line<[\s\S]*value="USL League Two"/);
    expect(around(kMarkup("match"), KBYG_TARGETS.matchWatchLabel)).toMatch(/>Watch line<[\s\S]*value="Watch live on"/);
    expect(around(kMarkup("match"), KBYG_TARGETS.matchWatchHref)).toMatch(/>Game-day live stream link<[\s\S]*value="https:\/\/youtube\.test\/live"/);
    expect(around(kMarkup("match"), KBYG_TARGETS.matchYoutubeImageAlt)).toMatch(/>Image description<[\s\S]*value="youtube picture"/);
    expect(around(kMarkup("facts"), "knowBeforeYouGo.facts.row:tile-bag.label")).toMatch(/>Label<[\s\S]*value="Clear bags only"/);
    expect(around(kMarkup("facts"), "knowBeforeYouGo.facts.row:tile-park.iconAlt")).toMatch(/>Image description<[\s\S]*value="tile-park picture"/);
    expect(around(kMarkup("raffle"), KBYG_TARGETS.raffleHeading)).toMatch(/>Heading<[\s\S]*value="Halftime raffle"/);
    expect(around(kMarkup("raffle"), KBYG_TARGETS.raffleSubheading)).toMatch(/>Prize \(red line\)<[\s\S]*value="Win a PlayStation 5"/);
    expect(around(kMarkup("raffle"), KBYG_TARGETS.raffleImageAlt)).toMatch(/>Image description<[\s\S]*value="raffle picture"/);
    expect(around(kMarkup("raffle"), KBYG_TARGETS.raffleBody)).toMatch(/>Text<[\s\S]*Enter at the \*\*fan table\*\*/);
    expect(around(kMarkup("donor"), KBYG_TARGETS.donorHeading)).toMatch(/>Heading<[\s\S]*value="Raffle donor"/);
    expect(around(kMarkup("donor"), KBYG_TARGETS.donorName)).toMatch(/>Donor name<[\s\S]*value="Corner Bakery"/);
    expect(around(kMarkup("donor"), KBYG_TARGETS.donorImageAlt)).toMatch(/>Image description<[\s\S]*value="donor picture"/);
    expect(around(kMarkup("donor"), KBYG_TARGETS.donorBody)).toMatch(/>About the donor<[\s\S]*Thanks to our donor\./);
    expect(around(kMarkup("donor"), KBYG_TARGETS.donorButtonLabel)).toMatch(/>Button text<[\s\S]*value="Visit the donor"/);
    expect(around(kMarkup("donor"), KBYG_TARGETS.donorButtonHref)).toMatch(/>Button link<[\s\S]*value="https:\/\/donor\.test"/);
  });

  it("tiles follow their stable id when they are reordered (the controls move with the tile)", () => {
    const draft = kbygFixture();
    draft.facts.tiles.reverse();
    const stamped = stampsIn(kMarkup("facts", draft));
    expect([...stamped].sort()).toEqual(kbygExpected("facts", draft).sort());
    expect(stamped.find(target => target.endsWith(".label"))).toBe("knowBeforeYouGo.facts.row:tile-park.label");
    expect(around(kMarkup("facts", draft), "knowBeforeYouGo.facts.row:tile-park.label")).toMatch(/>Label<[\s\S]*value="Park at Lot 5"/);
  });

  it("a stamp is a data attribute on the field's own wrapper only", () => {
    expect(kMarkup("heading")).toMatch(/<div class="[^"]*" data-edit-target="knowBeforeYouGo\.heading\.title"><div class="[^"]*"><label[^>]*>Title<\/label><input/);
    expect(kMarkup("donor").replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
  });
});

/* ---------------------------------------------------------------- the editor kit */
describe("the kit's list and table fields stamp their rows and cells only when asked", () => {
  it("StringListField stamps an item's row with its id and adds nothing without itemTarget", () => {
    const props = { label: "Perks", items: ["a", "b"], onChange: noop, max: 3, itemLabel: "perk" };
    expect(renderToStaticMarkup(createElement(StringListField, props))).not.toContain("data-edit-target");
    const markup = renderToStaticMarkup(createElement(StringListField, { ...props, itemTarget: (index: number) => (index === 1 ? SEASON_TARGETS.headingTitle : undefined) }));
    expect(stampsIn(markup)).toEqual([SEASON_TARGETS.headingTitle]);
    expect(markup).toMatch(/<li[^>]*data-edit-target="seasonMembership\.heading\.title"><input[^>]*aria-label="Perks, perk 2"/);
  });
  it("TableEditor stamps a cell with its id and adds nothing without cellTarget", () => {
    const props = { label: "Prices", columns: [{ key: "name", label: "Name" }, { key: "price-0", label: "Price" }], rows: [["A", "1"], ["B", "2"]], onChange: noop, maxRows: 4, rowLabel: "row" };
    expect(renderToStaticMarkup(createElement(TableEditor, props))).not.toContain("data-edit-target");
    const markup = renderToStaticMarkup(createElement(TableEditor, { ...props, cellTarget: (row: number, key: string) => (row === 1 && key === "price-0" ? SEASON_TARGETS.headingTitle : undefined) }));
    expect(stampsIn(markup)).toEqual([SEASON_TARGETS.headingTitle]);
    expect(markup).toMatch(/<td[^>]*data-edit-target="seasonMembership\.heading\.title"><input[^>]*aria-label="Price, row 2" value="2"/);
  });
});

/* ---------------------------------------------------------------- the shared editor shell and the public pages */
describe("TicketPageEditor and the public pages", () => {
  const editor = read("components/admin/ticket-pages/TicketPageEditor.tsx");
  it("section cards open the clicked field's section and ask the dialog to focus the field", () => {
    expect(editor).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id, event\); dialog\.focusField\(target\); \}\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });
  it("the cards stamp the draft the preview shows (the deferred one), per section, built once per draft", () => {
    expect(editor).toMatch(/const stampsBySection = useMemo\(\(\) => new Map\(spec\.sections\.map\(section => \[section\.id, deferred && stamps \? stamps\(deferred, section\.id\) : \[\]\]\)\), \[spec, stamps, deferred\]\);/);
    expect(editor).toMatch(/stamps=\{stamps \? id => stampsBySection\.get\(id\) \?\? \[\] : undefined\}/);
    expect(editor).toMatch(/const previewOf = \(id: string\) => deferred && <SectionLive/);
  });
  it("the dialog's own live preview stays inert: no stamps and no click handlers there", () => {
    expect(editor.slice(editor.indexOf("renderPreview={id => dialog.open"))).not.toMatch(/stamps|onClick/);
  });
  it("each page passes one module-level stamps function (a stable identity, so the stamps memo holds)", () => {
    const season = read("components/admin/ticket-pages/SeasonMembershipEditor.tsx"), kbyg = read("components/admin/ticket-pages/KnowBeforeYouGoEditor.tsx");
    expect(season).toMatch(/^const stamps = \(content: SeasonMembershipContent, id: string\) => seasonPreviewStamps\(content, id as SeasonSectionId\);$/m);
    expect(season).toMatch(/renderFields=\{fields\} stamps=\{stamps\}/);
    expect(kbyg).toMatch(/^const stamps = \(content: KnowBeforeYouGoContent, id: string\) => kbygPreviewStamps\(content, id as KbygSectionId\);$/m);
    expect(kbyg).toMatch(/renderFields=\{fields\} stamps=\{stamps\}/);
  });
  it("only the admin preview stamps public nodes; the public components gain nothing", () => {
    for (const file of ["CinematicSeasonMembership", "CinematicKnowBeforeYouGo", "CinematicTicketPageParts"]) expect(read(`components/cinematic/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
  });
});

describe("ticket page link fields keep their own line after the shared link hint", () => {
  const SHARED = "A link (like a Google Form), a page on your site starting with /, or an email address.";
  const text = (html: string) => html.replace(/&#x27;/g, "'");
  it("Season Membership button, KBYG live stream and donor button", () => {
    expect(text(sMarkup("button"))).toContain(`${SHARED} Leave empty until the link is ready: the button then shows but does nothing.`);
    expect(text(kMarkup("match"))).toContain(`${SHARED} Leave empty to send fans to the club's YouTube channel from Branding.`);
    expect(text(kMarkup("donor"))).toContain(`${SHARED} Leave empty until it is ready: the button then shows but does nothing.`);
  });
});
