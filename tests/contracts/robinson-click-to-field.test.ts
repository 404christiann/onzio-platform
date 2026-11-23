import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { robinsonFixture, ROBINSON_FIXTURE_MEDIA } from "../fixtures/robinson-click-fixture";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { hydrateRobinsonContent, type RobinsonContent } from "@/lib/cinematic-robinson-content";
import { RobinsonSectionFields, type RobinsonFieldsApi } from "@/components/admin/stadium/RobinsonSectionFields";
import { ROBINSON_SECTIONS, type RobinsonSectionId } from "@/components/admin/stadium/robinson-sections";
import { ROBINSON_TARGETS } from "@/components/admin/stadium/robinson-edit-targets";

vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const SECTIONS = EDIT_TARGET_REGISTRY.robinson.sections;
beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });

function api(draft: RobinsonContent): RobinsonFieldsApi {
  return { draft, page: hydrateRobinsonContent(draft, ROBINSON_FIXTURE_MEDIA), locked: false, uploading: null, change: () => undefined, patch: () => undefined, upload: async () => true };
}
/** The ids stamped on one section's dialog controls, in order. */
const stampedIn = (id: RobinsonSectionId, draft = robinsonFixture()) =>
  [...renderToStaticMarkup(createElement(RobinsonSectionFields, { api: api(draft), id })).matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);

/** The ids a section's dialog must stamp for the fixture, written out from the registry's grammar and the fixture (not from the helpers under test). */
function expectedIds(id: RobinsonSectionId, draft: RobinsonContent): string[] {
  const single = (SECTIONS[id].fields ?? []).map(field => `robinson.${id}.${field}`);
  const row = (key: string | number, field: string) => `robinson.${id}.row:${key}.${field}`;
  switch (id) {
    case "story": return [...draft.story.paragraphs.map((_, index) => row(index, "paragraph")), "robinson.story.quote", "robinson.story.attribution"];
    case "info": return ["robinson.info.heading", "robinson.info.note", ...draft.info.rows.flatMap((_, index) => [row(index, "label"), row(index, "value")])];
    case "food": return ["robinson.food.heading", "robinson.food.mealPassImageAlt", "robinson.food.body", ...draft.food.steps.flatMap((_, index) => [row(index, "label"), row(index, "iconAlt")])];
    case "directions": return draft.directions.blocks.flatMap(block => [
      row(block.id, "heading"), ...block.paragraphs.map((_, index) => row(`${block.id}-p${index}`, "paragraph")), row(block.id, "note"),
      ...block.bullets.map((_, index) => row(`${block.id}-b${index}`, "bullet")), row(block.id, "closing"),
    ]);
    default: return single;
  }
}

describe("Robinson Stadium: every declared field has its control in the dialog", () => {
  it("the registry's sections are exactly the Robinson sections, on the Stadium route", () => {
    expect(EDIT_TARGET_REGISTRY.robinson.route).toBe("/admin/stadium");
    expect(Object.keys(SECTIONS)).toEqual(ROBINSON_SECTIONS.map(section => section.id));
  });

  it.each(ROBINSON_SECTIONS.map(section => section.id))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampedIn(id);
    expect([...stamped].sort()).toEqual(expectedIds(id, robinsonFixture()).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
  });

  it("every single field the registry declares is stamped in its section, and every row field on its rows", () => {
    for (const [id, spec] of Object.entries(SECTIONS)) {
      const stamped = stampedIn(id as RobinsonSectionId);
      for (const field of spec.fields ?? []) expect(stamped, `${id}.${field}`).toContain(`robinson.${id}.${field}`);
      for (const field of spec.rowFields ?? []) expect(stamped.some(target => target.endsWith(`.${field}`) && target.includes(".row:")), `${id} rows ${field}`).toBe(true);
    }
  });

  it("each control's id is on the control the label names", () => {
    const labelled = (id: RobinsonSectionId, target: string) => {
      const markup = renderToStaticMarkup(createElement(RobinsonSectionFields, { api: api(robinsonFixture()), id }));
      const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
      expect(at, target).toBeGreaterThan(-1);
      return markup.slice(at, at + 700);
    };
    expect(labelled("heading", ROBINSON_TARGETS.headingTitle)).toMatch(/>Title<[\s\S]*value="Robinson Stadium"/);
    expect(labelled("heading", ROBINSON_TARGETS.headingSubtitle)).toMatch(/>Subtitle<[\s\S]*value="Pasadena, California"/);
    expect(labelled("story", "robinson.story.row:1.paragraph")).toMatch(/>Paragraph 2<[\s\S]*Second story paragraph\./);
    expect(labelled("info", "robinson.info.row:1.label")).toMatch(/>Label<[\s\S]*value="Pets Allowed"/);
    expect(labelled("info", "robinson.info.row:1.value")).toMatch(/>Value<[\s\S]*<option value="no" selected/);
    expect(labelled("food", "robinson.food.row:2.label")).toMatch(/>Step 3<[\s\S]*value="Enjoy during Game"/);
    expect(labelled("food", "robinson.food.row:2.iconAlt")).toMatch(/>Image description<[\s\S]*value="step3 picture"/);
    expect(labelled("match", ROBINSON_TARGETS.matchPartnerImageAlt)).toMatch(/>Image description<[\s\S]*value="partner picture"/);
    expect(labelled("directions", "robinson.directions.row:parking.note")).toMatch(/>Italic note<[\s\S]*Lot 5 is on Bonnie Ave\./);
    expect(labelled("directions", "robinson.directions.row:by-transit-b1.bullet")).toMatch(/>Bullet 2<[\s\S]*Stop at Sierra Bonita/);
    expect(labelled("directions", "robinson.directions.row:no-heading-p0.paragraph")).toMatch(/>Paragraph 1<[\s\S]*A block with no heading\./);
  });

  it("directions rows follow the block's id when the blocks are reordered", () => {
    const draft = robinsonFixture();
    draft.directions.blocks.reverse();
    const stamped = stampedIn("directions", draft);
    expect([...stamped].sort()).toEqual(expectedIds("directions", draft).sort());
    // The first block in the dialog is now service-areas, and its controls carry service-areas ids.
    expect(stamped.slice(0, 2).every(target => target.startsWith("robinson.directions.row:service-areas"))).toBe(true);
  });

  it("a stamp is a data attribute on the field's own wrapper only: the controls keep their labels and structure", () => {
    const markup = renderToStaticMarkup(createElement(RobinsonSectionFields, { api: api(robinsonFixture()), id: "heading" }));
    expect(markup).toMatch(/<div class="[^"]*" data-edit-target="robinson\.heading\.title"><div class="[^"]*"><label[^>]*>Title<\/label><input/);
    expect(markup.replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
  });
});

describe("Robinson Stadium: the editor and the public page", () => {
  const editor = read("components/admin/stadium/RobinsonStadiumEditor.tsx");

  it("section cards open the clicked field's section and ask the dialog to focus the field", () => {
    expect(editor).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as RobinsonSectionId, event\); dialog\.focusField\(target\); \}\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });

  it("the cards stamp the draft the preview shows (the deferred one), per section", () => {
    expect(editor).toMatch(/stamps=\{id => deferred \? robinsonPreviewStamps\(deferred, id as RobinsonSectionId\) : \[\]\}/);
    expect(editor).toMatch(/const previewOf = \(id: string\) => deferred && <SectionLive/);
  });

  it("the dialog's own live preview stays inert: no stamps and no click handlers there", () => {
    const dialogPreview = editor.slice(editor.indexOf("renderPreview={id => dialog.open"));
    expect(dialogPreview).not.toMatch(/stamps|robinsonPreviewStamps|onClick/);
  });

  it("only the admin preview stamps public nodes; the public components gain nothing", () => {
    for (const file of ["components/cinematic/CinematicRobinson.tsx", "components/cinematic/CinematicStadium.tsx"]) expect(read(file)).not.toMatch(/edit-target|editTarget/);
  });
});
