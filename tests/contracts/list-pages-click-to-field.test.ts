import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ENTRY_IDS, PARTNER_IDS, injuryFixture, injuryRosterFixture, injuryUrl, partnersFixture, partnersFixtureLogoUrls, partnersFixtureLogos } from "../fixtures/visitor-click-fixtures";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import type { CinematicPartnersContent } from "@/lib/cinematic-partners-content";
import type { CinematicInjuryReportContent } from "@/lib/cinematic-injury-report-content";
import { PartnersDialogFields, type PartnersFieldsApi } from "@/components/admin/partners/PartnerFields";
import { InjuryDialogFields, type InjuryFieldsApi } from "@/components/admin/injury-report/InjuryFields";
import { INJURY_TARGETS } from "@/components/admin/injury-report/injury-edit-targets";
import { ImageFieldWithDescription } from "@/components/admin/ui/editor-kit";
import { ListField } from "@/components/admin/list-cards/ListField";

/**
 * UI-PREVIEW-CLICK-LIST-1: every declared Partners and Injury Report field has its control in the dialog, carrying the id a
 * preview click focuses it by; the two editors wire the cards' stamps, the click, the item guard and the focus.
 */
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
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

/* ---------------------------------------------------------------- Partners */
const pApi = (draft: CinematicPartnersContent): PartnersFieldsApi => ({
  draft, locked: false, uploading: null, logos: partnersFixtureLogos(), logoUrls: partnersFixtureLogoUrls(), errors: {}, update: noop, upload: noop, move: noop, remove: noop,
});
const pMarkup = (id: string, draft = partnersFixture()) => renderToStaticMarkup(createElement(PartnersDialogFields, { api: pApi(draft), id: id as never }));
const pt = (page: string, field: string) => `partners.${page}.${field}`;
const prow = (id: string, field: string) => `partners.partner.row:${id}.${field}`;
const PAGE_FIELDS = { partners: ["title", "subtitle", "intro", "ctaPrompt", "ctaLabel"], opportunities: ["title", "subtitle", "intro", "ctaPrompt", "ctaLabel", "ctaHref"] } as const;

describe("Partners: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.partners.sections;
  it("the registry is the two page cards plus one partner section keyed by uuid, on the Partners route", () => {
    expect(EDIT_TARGET_REGISTRY.partners.route).toBe("/admin/partners");
    expect(Object.keys(SECTIONS)).toEqual(["partners", "opportunities", "partner"]);
    expect(SECTIONS.partner.fields).toBeUndefined();
    expect(SECTIONS.partner.rowFields).toEqual(["name", "role", "logo", "tone"]);
  });

  it.each(["partners", "opportunities"] as const)("page:%s: each declared field is stamped on exactly one control, and nothing else is", page => {
    const stamped = stampsIn(pMarkup(`page:${page}`));
    expect([...stamped].sort()).toEqual(PAGE_FIELDS[page].map(field => pt(page, field)).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    expect([...(SECTIONS[page].fields ?? [])].sort()).toEqual([...PAGE_FIELDS[page]].sort());
    for (const id of stamped) expect(resolveEditTarget(id)?.section, id).toBe(page);
  });

  it("each partner's dialog stamps its four fields under its own uuid, once each", () => {
    for (const id of PARTNER_IDS) {
      const stamped = stampsIn(pMarkup(`partner:${id}`));
      expect([...stamped].sort()).toEqual(["logo", "name", "role", "tone"].map(field => prow(id, field)).sort());
      for (const target of stamped) expect(resolveEditTarget(target), target).toMatchObject({ section: "partner", row: id });
    }
  });

  it("each control's id is on the control the label names", () => {
    expect(around(pMarkup("page:partners"), pt("partners", "title"))).toMatch(/>Heading<[\s\S]*value="Club Partners"/);
    expect(around(pMarkup("page:partners"), pt("partners", "subtitle"))).toMatch(/>Subtitle<[\s\S]*value="Fueled by our partners"/);
    expect(around(pMarkup("page:partners"), pt("partners", "intro"))).toMatch(/>Intro<[\s\S]*Meet the people behind the club\./);
    expect(around(pMarkup("page:partners"), pt("partners", "ctaPrompt"))).toMatch(/>Bottom bar text<[\s\S]*value="Want to partner with us\?"/);
    expect(around(pMarkup("page:partners"), pt("partners", "ctaLabel"))).toMatch(/>Button text<[\s\S]*value="Partnerships"/);
    expect(around(pMarkup("page:opportunities"), pt("opportunities", "title"))).toMatch(/>Heading<[\s\S]*value="Partnership Opportunities"/);
    expect(around(pMarkup("page:opportunities"), pt("opportunities", "ctaLabel"))).toMatch(/>Button text<[\s\S]*value="Email us"/);
    expect(around(pMarkup("page:opportunities"), pt("opportunities", "ctaHref"))).toMatch(/>Button link<[\s\S]*value="https:\/\/partners\.test\/contact"/);
    expect(around(pMarkup(`partner:${PARTNER_IDS[1]}`), prow(PARTNER_IDS[1], "name"))).toMatch(/>Name<[\s\S]*value="Beta Brewing"/);
    expect(around(pMarkup(`partner:${PARTNER_IDS[2]}`), prow(PARTNER_IDS[2], "role"))).toMatch(/>Role<[\s\S]*Official kit/);
  });

  it("the logo and colour ids sit on the chosen option, so focus lands on the radio that is selected", () => {
    const first = pMarkup(`partner:${PARTNER_IDS[0]}`);
    expect(first).toMatch(new RegExp(`title="Logo 1" data-edit-target="${prow(PARTNER_IDS[0], "logo").replace(/[.:]/g, "\\$&")}"><input type="radio"[^>]*checked=""`));
    expect(first).toMatch(new RegExp(`title="Original colours" data-edit-target="${prow(PARTNER_IDS[0], "tone").replace(/[.:]/g, "\\$&")}"><input type="radio"[^>]*checked=""`));
    // No logo chosen: the "No logo" option carries it. Another colour: that colour carries it.
    const none = pMarkup(`partner:${PARTNER_IDS[1]}`);
    expect(none).toMatch(new RegExp(`data-none="" data-edit-target="${prow(PARTNER_IDS[1], "logo").replace(/[.:]/g, "\\$&")}"><input type="radio"[^>]*checked=""`));
    expect(none).toMatch(new RegExp(`title="Grey \\(for a white logo\\)" data-edit-target="${prow(PARTNER_IDS[1], "tone").replace(/[.:]/g, "\\$&")}"><input type="radio"[^>]*checked=""`));
    expect(pMarkup(`partner:${PARTNER_IDS[2]}`)).toMatch(/title="Logo 2" data-edit-target="[^"]+"><input type="radio"[^>]*checked=""/);
  });

  it("controls follow their partner's uuid when the partners are reordered", () => {
    const draft = partnersFixture();
    draft.partners.reverse();
    for (const id of PARTNER_IDS) expect(stampsIn(pMarkup(`partner:${id}`, draft)).every(target => target.startsWith(`partners.partner.row:${id}.`))).toBe(true);
    expect(around(pMarkup(`partner:${PARTNER_IDS[0]}`, draft), prow(PARTNER_IDS[0], "name"))).toMatch(/value="Alpha Bank"/);
  });

  it("the shared parts add nothing without a target", () => {
    expect(renderToStaticMarkup(createElement(ListField, { label: "Name", value: "x", max: 10, disabled: false, onChange: noop }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
    expect(renderToStaticMarkup(createElement(ListField, { label: "Name", value: "x", max: 10, disabled: false, target: INJURY_TARGETS.presenterName, onChange: noop }))).toMatch(/<div class="[^"]*" data-edit-target="injuryReport\.presenter\.name"><label/);
    expect(renderToStaticMarkup(createElement(ImageFieldWithDescription, { label: "Logo", description: "d", previewUrl: "", initials: "", disabled: false, uploading: false, allowedTypes: ["image/png"], maxBytes: 100, onUpload: async () => true }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

/* ---------------------------------------------------------------- Injury Report */
const iApi = (draft: CinematicInjuryReportContent, former: string[] = []): InjuryFieldsApi => ({
  draft, players: injuryRosterFixture().players.map(({ id, name, number, position }) => ({ id, name, number, position, photo: null })) as never, former: new Set(former), locked: false, uploading: null,
  mediaUrls: { logo: injuryUrl("logo"), band: injuryUrl("band") }, errors: {}, update: noop, upload: async () => true, move: noop, remove: noop,
});
const iMarkup = (id: string, draft = injuryFixture(), former: string[] = []) => renderToStaticMarkup(createElement(InjuryDialogFields, { api: iApi(draft, former), id: id as never }));
const ie = (id: string, field: string) => `injuryReport.entry.row:${id}.${field}`;

describe("Injury Report: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.injuryReport.sections;
  it("the registry is the two page-part cards plus one entry section keyed by uuid, on the Injury Report route", () => {
    expect(EDIT_TARGET_REGISTRY.injuryReport.route).toBe("/admin/injury-report");
    expect(Object.keys(SECTIONS)).toEqual(["presenter", "rehab", "entry"]);
    expect(SECTIONS.entry.rowFields).toEqual(["injury", "timeline", "note"]);
    // The Roster player is not an owner field of the cards: it declares nothing.
    expect(JSON.stringify(SECTIONS)).not.toMatch(/player|number|position|photo/i);
  });

  it("presenter and rehab: each declared field is stamped on exactly one control, and nothing else is", () => {
    for (const block of ["presenter", "rehab"] as const) {
      const stamped = stampsIn(iMarkup(block));
      expect([...stamped].sort()).toEqual((SECTIONS[block].fields ?? []).map(field => `injuryReport.${block}.${field}`).sort());
      expect(new Set(stamped).size).toBe(stamped.length);
      for (const id of stamped) expect(resolveEditTarget(id)?.section, id).toBe(block);
    }
  });

  it("each entry's dialog stamps injury, timeline and note under its own uuid, and not the Player picker", () => {
    for (const id of ENTRY_IDS) {
      const markup = iMarkup(`entry:${id}`);
      expect([...stampsIn(markup)].sort()).toEqual(["injury", "note", "timeline"].map(field => ie(id, field)).sort());
      expect(markup).toContain("<select");
      expect(markup).not.toMatch(/data-edit-target="[^"]*"><label[^>]*>Player</);
    }
    // A player who left the Roster has no Player picker; the fields are still stamped.
    expect(stampsIn(iMarkup(`entry:${ENTRY_IDS[0]}`, injuryFixture(), [ENTRY_IDS[0]]))).toHaveLength(3);
  });

  it("each control's id is on the control the label names", () => {
    expect(around(iMarkup("presenter"), INJURY_TARGETS.presenterName)).toMatch(/>Partner name<[\s\S]*value="MVMNT CULTR"/);
    expect(iMarkup("presenter")).toMatch(/aria-label="Partner logo"[^>]*data-edit-target="injuryReport\.presenter\.logo"/);
    expect(iMarkup("rehab")).toMatch(/aria-label="Photo band"[^>]*data-edit-target="injuryReport\.rehab\.band"/);
    expect(around(iMarkup("rehab"), INJURY_TARGETS.rehabBandAlt)).toMatch(/>Photo description<[\s\S]*value="Players in rehab"/);
    expect(around(iMarkup("rehab"), INJURY_TARGETS.rehabHeading)).toMatch(/>Rehab heading<[\s\S]*value="Rehab with MVMNT CULTR"/);
    expect(around(iMarkup("rehab"), INJURY_TARGETS.rehabQuote)).toMatch(/>Quote<[\s\S]*Recovery is a team sport\./);
    expect(around(iMarkup("rehab"), INJURY_TARGETS.rehabQuoteAttribution)).toMatch(/>Quote by<[\s\S]*value="Head physio"/);
    expect(around(iMarkup("rehab"), INJURY_TARGETS.rehabVideoUrl)).toMatch(/>YouTube link<[\s\S]*value="https:\/\/www\.youtube\.com\/embed\/abc123def45\?rel=0"/);
    expect(around(iMarkup(`entry:${ENTRY_IDS[1]}`), ie(ENTRY_IDS[1], "injury"))).toMatch(/>Injury<[\s\S]*value="Ankle sprain"/);
    expect(around(iMarkup(`entry:${ENTRY_IDS[2]}`), ie(ENTRY_IDS[2], "timeline"))).toMatch(/>Timeline<[\s\S]*value="1 week"/);
    expect(around(iMarkup(`entry:${ENTRY_IDS[2]}`), ie(ENTRY_IDS[2], "note"))).toMatch(/>Note \(optional\)<[\s\S]*value="Back for the derby\."/);
  });

  it("controls follow their entry's uuid when the entries are reordered", () => {
    const draft = injuryFixture();
    draft.entries.reverse();
    for (const id of ENTRY_IDS) expect(stampsIn(iMarkup(`entry:${id}`, draft)).every(target => target.startsWith(`injuryReport.entry.row:${id}.`))).toBe(true);
    expect(around(iMarkup(`entry:${ENTRY_IDS[0]}`, draft), ie(ENTRY_IDS[0], "injury"))).toMatch(/value="Hamstring strain"/);
  });

  it("the image field adds a stamp only when asked", () => {
    const props = { label: "Logo", description: "d", previewUrl: "", initials: "", disabled: false, uploading: false, allowedTypes: ["image/png"] as const, maxBytes: 100, onUpload: async () => true };
    expect(stampsIn(renderToStaticMarkup(createElement(ImageFieldWithDescription, { ...props, target: INJURY_TARGETS.rehabBand })))).toEqual([INJURY_TARGETS.rehabBand]);
  });
});

/* ---------------------------------------------------------------- the editors */
describe("the Partners and Injury Report editors", () => {
  const partners = read("components/admin/partners/CinematicPartnersEditor.tsx"), injury = read("components/admin/injury-report/CinematicInjuryReportEditor.tsx");

  it("every card opens the clicked field's item and asks the dialog to focus the field; the dialog is given the request", () => {
    expect(partners.match(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as PartnersDialogId, event\); dialog\.focusField\(target\); \}\}/g)).toHaveLength(2);
    expect(injury.match(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as InjuryDialogId, event\); dialog\.focusField\(target\); \}\}/g)).toHaveLength(2);
    expect(partners).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
    expect(injury).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });

  it("the item cards stamp the draft the preview shows (the deferred one), built once per draft, with the item guard", () => {
    expect(partners).toMatch(/const partnerStamps = useMemo\(\(\) => partnerStampsByCard\(deferred\?\.partners \?\? \[\]\), \[deferred\]\);/);
    expect(partners).toMatch(/stamps=\{id => partnerStamps\.get\(id\) \?\? NO_STAMPS\} ownsTarget=\{partnersOwnsTarget\}/);
    expect(injury).toMatch(/const entryStamps = useMemo\(\(\) => injuryStampsByCard\(deferred\?\.entries \?\? \[\]\), \[deferred\]\);/);
    expect(injury).toMatch(/stamps=\{id => entryStamps\.get\(id\) \?\? NO_STAMPS\} ownsTarget=\{injuryOwnsTarget\}/);
  });

  it("the page and page-part cards use one fixed stamps map and the same guard", () => {
    expect(partners).toMatch(/^const PAGE_STAMPS = partnersPageStampsByCard\(\);$/m);
    expect(partners).toMatch(/stamps=\{id => PAGE_STAMPS\.get\(id\) \?\? NO_STAMPS\} ownsTarget=\{partnersOwnsTarget\}/);
    expect(injury).toMatch(/^const BLOCK_STAMPS = injuryBlockStampsByCard\(\);$/m);
    expect(injury).toMatch(/stamps=\{id => BLOCK_STAMPS\.get\(id\) \?\? NO_STAMPS\} ownsTarget=\{injuryOwnsTarget\}/);
  });

  it("the dialog's own live preview stays inert, and Add opens the new item with no field", () => {
    expect(partners.slice(partners.indexOf("renderPreview={id => {\n        if (!dialog.open)"))).not.toMatch(/stamps|onClick/);
    expect(injury.slice(injury.indexOf("renderPreview={id => {\n        if (!dialog.open)"))).not.toMatch(/stamps|onClick/);
    expect(partners).toMatch(/dialog\.openSection\(partnerDialogId\(added\.id\), event\);/);
    expect(injury).toMatch(/dialog\.openSection\(entryDialogId\(added\.id\), event\);/);
  });

  it("only the admin preview stamps public nodes; the public components gain nothing", () => {
    for (const file of ["CinematicPartners", "CinematicInjuryReport", "CinematicInjuryVideo"]) expect(read(`components/cinematic/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
  });

  it("partner and injury fields are keyed by uuid in the registry, never by position", () => {
    for (const source of [read("components/admin/partners/partners-edit-targets.ts"), read("components/admin/injury-report/injury-edit-targets.ts")]) {
      expect(source).not.toMatch(/partners\[\d|entries\[\d|\.indexOf\(/);
    }
  });
});
