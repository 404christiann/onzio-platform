import { describe, expect, it } from "vitest";
import {
  homepageRendererForClub, resolveHomepageBindings, resolveHomepageCapabilities,
  sameHomepageBindingMeaning, type HomepageRenderer,
} from "@/lib/homepage-editor/capabilities";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { createHomepageEditorState, reduceHomepageEditor } from "@/lib/homepage-editor/model";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";

const fullHero = ["hero.eyebrow", "hero.heading", "hero.intro", "hero.cta"];
const compactHero = ["hero.heading", "hero.intro", "hero.cta"];
const cases = [
  { templateKey: "academy@1", hero: fullHero, sections: ["hero", "story"], pieces: ["story.text", "story.cta", "shared.shop", "shared.programs"] },
  { templateKey: "editorial@1", hero: compactHero, sections: ["hero", "photos"], pieces: ["photos", "shared.story", "shared.shop"] },
  { templateKey: "clubhouse@1", hero: compactHero, sections: ["hero", "photos"], pieces: ["photos", "shared.story", "shared.shop"] },
  { templateKey: "cinematic@1", hero: fullHero, sections: ["hero", "photos", "video"], pieces: ["photos", "video", "shared.shop"] },
  { templateKey: "heritage@1", hero: fullHero, sections: ["hero", "photos", "video"], pieces: ["photos", "video", "shared.shop"] },
  { templateKey: null, hero: fullHero, sections: ["hero", "photos", "video"], pieces: ["photos", "video", "shared.shop"] },
] as const;
const slideshowVariants = ["none", "editorial", "matchday", "legacy"] as const;
const heroVariants = [undefined, "editable", "legacy-fixed"] as const;
const bindingsFor = (renderer: HomepageRenderer) => resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(renderer) });
function stateFor(renderer: HomepageRenderer) {
  const capabilities = resolveHomepageCapabilities(renderer);
  return createHomepageEditorState({
    content: homepageDraft(), revision: "content-1", designRevision: "design-1",
    editableSections: capabilities.editableSections,
    allowedPieces: Object.keys(resolveHomepageBindings({ capabilities }).elements),
  });
}

const academy: HomepageRenderer = { templateKey: "academy@1", slideshowVariant: "none" };
const editorial: HomepageRenderer = { templateKey: "editorial@1", slideshowVariant: "editorial" };
const generic: HomepageRenderer = { templateKey: null, slideshowVariant: "matchday" };

describe("homepage binding projection", () => {
  for (const row of cases) {
    for (const slideshowVariant of slideshowVariants) {
      it.each(heroVariants)(`${row.templateKey}/${slideshowVariant}/%s preserves selection order and section defaults`, heroVariant => {
        const renderer: HomepageRenderer = { templateKey: row.templateKey, slideshowVariant, heroVariant };
        const bindings = bindingsFor(renderer);
        const state = stateFor(renderer);
        const expectedPieces = [...(heroVariant === "legacy-fixed" ? [] : row.hero), ...row.pieces];
        expect(Object.keys(bindings.elements)).toEqual(expectedPieces);
        expect(state.allowedPieces).toEqual(expectedPieces);
        expect(state.editableSections).toEqual(row.sections.filter(section => heroVariant !== "legacy-fixed" || section !== "hero"));
        expect(state.editableFields).toEqual([
          "hero.eyebrow", "hero.headline_line_one", "hero.headline_line_two", "hero.intro",
          "hero.primary_cta_label", "hero.primary_cta_href", "hero.secondary_cta_label", "hero.secondary_cta_href",
          "photos.seasonLabel", "photos.alt", "story.visible", "story.heading", "story.bodyPrimary", "story.bodySecondary", "story.ctaLabel",
          "video.visible", "video.eyebrow", "video.title", "video.description", "video.video_title", "video.caption",
        ]);
        const caption = row.templateKey !== "academy@1" && row.templateKey !== "editorial@1" && slideshowVariant === "legacy";
        expect(bindings.elements.photos).toEqual(row.templateKey === "academy@1" ? undefined : {
          kind: "photos", section: "photos", fields: caption ? ["items", "seasonLabel"] : ["items"],
        });
        expect(bindings.elements).not.toHaveProperty("story");
      });
    }
  }

  it("records exact hero groups and shared story visibility without a story destination or video source", () => {
    expect(bindingsFor(academy).elements).toEqual({
      "hero.eyebrow": { kind: "fields", section: "hero", fields: ["eyebrow"] },
      "hero.heading": { kind: "fields", section: "hero", fields: ["headline_line_one", "headline_line_two"] },
      "hero.intro": { kind: "fields", section: "hero", fields: ["intro"] },
      "hero.cta": { kind: "fields", section: "hero", fields: ["primary_cta_label", "primary_cta_href", "secondary_cta_label", "secondary_cta_href"] },
      "story.text": { kind: "fields", section: "story", fields: ["visible", "heading", "bodyPrimary", "bodySecondary"] },
      "story.cta": { kind: "fields", section: "story", fields: ["visible", "ctaLabel"] },
      "shared.shop": { kind: "shortcut", owner: "shop", editorHref: "/admin/shop", source: { surface: "home", variants: ["home"] } },
      "shared.programs": { kind: "shortcut", owner: "programs", editorHref: "/admin/programs" },
    });
    expect(bindingsFor(generic).elements.video).toEqual({
      kind: "fields", section: "video", fields: ["visible", "eyebrow", "title", "description", "video_title", "caption"],
    });
  });

  it.each(["editorial@1", "clubhouse@1"] as const)("keeps %s About and Shop content shortcut-owned", templateKey => {
    const elements = bindingsFor({ templateKey, slideshowVariant: "legacy" }).elements;
    expect(elements["shared.story"]).toEqual({ kind: "shortcut", owner: "about", editorHref: "/admin/about" });
    expect(elements["shared.shop"]).toEqual({ kind: "shortcut", owner: "shop", editorHref: "/admin/shop", source: { surface: "shop", variants: ["home", "third", "away"] } });
    expect(elements["story.text"]).toBeUndefined();
    expect(elements["story.cta"]).toBeUndefined();
    expect(elements["shared.programs"]).toBeUndefined();
  });

  it.each(cases)("preserves Rose City precedence for $templateKey", row => {
    const renderer = homepageRendererForClub({ presentationTemplateKey: row.templateKey, slug: "rose-city" });
    const namedRenderer = ["academy@1", "editorial@1", "clubhouse@1"].some(key => key === row.templateKey);
    const bindings = bindingsFor(renderer);
    expect(Object.keys(bindings.elements)).toEqual([...(namedRenderer ? row.hero : []), ...row.pieces]);
    expect(bindings.elements.photos).toEqual(row.templateKey === "academy@1" ? undefined : {
      kind: "photos", section: "photos", fields: row.templateKey === "editorial@1" ? ["items"] : ["items", "seasonLabel"],
    });
  });
});

describe("homepage binding identity", () => {
  it("never gives different element maps the same key and semantic revision across legal renderer permutations", () => {
    const meanings = new Map<string, unknown>();
    for (const { templateKey } of cases) for (const slideshowVariant of slideshowVariants) for (const heroVariant of heroVariants) {
      const contract = bindingsFor({ templateKey, slideshowVariant, heroVariant });
      expect(Number.isSafeInteger(contract.revision) && contract.revision > 0).toBe(true);
      expect(sameHomepageBindingMeaning(contract, contract)).toBe(true);
      const identity = `${contract.key}@${contract.revision}`;
      if (meanings.has(identity)) expect(contract.elements).toEqual(meanings.get(identity));
      else meanings.set(identity, contract.elements);
    }
    expect(meanings.size).toBe(10);
  });

  it("shares identities across visual templates and irrelevant slideshow changes", () => {
    const before = bindingsFor(generic);
    for (const templateKey of ["cinematic@1", "heritage@1", null] as const) {
      expect(sameHomepageBindingMeaning(before, bindingsFor({ templateKey, slideshowVariant: "editorial", heroVariant: "editable" }))).toBe(true);
    }
    expect(sameHomepageBindingMeaning(bindingsFor(editorial), bindingsFor({ templateKey: "clubhouse@1", slideshowVariant: "matchday" }))).toBe(true);
    expect(sameHomepageBindingMeaning(bindingsFor(academy), bindingsFor({ ...academy, slideshowVariant: "legacy" }))).toBe(true);
  });

  it("distinguishes ownership, Shop source, caption and fixed-hero semantics", () => {
    expect(sameHomepageBindingMeaning(bindingsFor(academy), bindingsFor(editorial))).toBe(false);
    expect(sameHomepageBindingMeaning(bindingsFor(generic), bindingsFor(editorial))).toBe(false);
    expect(sameHomepageBindingMeaning(bindingsFor(generic), bindingsFor({ ...generic, heroVariant: "legacy-fixed" }))).toBe(false);
    expect(sameHomepageBindingMeaning(bindingsFor(editorial), bindingsFor({ templateKey: "clubhouse@1", slideshowVariant: "legacy" }))).toBe(false);
  });

  it("requires known identity and equal positive semantic revisions", () => {
    const contract = bindingsFor(academy);
    expect(sameHomepageBindingMeaning(contract, { ...contract, revision: 2 })).toBe(false);
    expect(sameHomepageBindingMeaning(contract, bindingsFor(generic))).toBe(false);
    expect(sameHomepageBindingMeaning({ key: "unknown", revision: 1 }, { key: "unknown", revision: 1 })).toBe(false);
    expect(sameHomepageBindingMeaning(null, null)).toBe(false);
    expect(sameHomepageBindingMeaning(contract, undefined)).toBe(false);
    for (const revision of [0, -1, 1.5, NaN, Infinity]) {
      expect(sameHomepageBindingMeaning({ ...contract, revision }, { ...contract, revision })).toBe(false);
    }
  });
});

describe("binding selection with the existing reducer and save adapter", () => {
  it("selects shared shortcuts without making their content locally editable", () => {
    const state = stateFor(editorial);
    expect(reduceHomepageEditor(state, { type: "piece-selected", piece: "shared.story" }).selection).toBe("shared.story");
    expect(reduceHomepageEditor(state, { type: "piece-selected", piece: "story.text" }).selection).toBeNull();
    expect(reduceHomepageEditor(state, { type: "field-changed", field: "story.heading", value: "Wrong owner" }).draft).toEqual(state.draft);
    expect(reduceHomepageEditor(stateFor(academy), { type: "piece-selected", piece: "photos" }).selection).toBeNull();
  });

  it("keeps default reducer fields while the adapter filters unavailable hero copy", () => {
    const edited = reduceHomepageEditor(stateFor(editorial), { type: "field-changed", field: "hero.eyebrow", value: "Hidden eyebrow" });
    expect(edited.draft.hero.eyebrow).toBe("Hidden eyebrow");
    const { eyebrow: omitted, ...expectedHero } = homepageDraft().hero;
    expect(omitted).toBe("Community football");
    expect(buildHomepageSaveRequest(edited, editorial, SAVE_OPERATION)).toEqual({
      operationId: SAVE_OPERATION, expectedRevision: "content-1", designRevision: "design-1", sections: { hero: expectedHero },
    });
  });

  it.each([false, true])("preserves photo wire keys and caption filtering with legacy caption %s", caption => {
    const renderer: HomepageRenderer = { templateKey: "clubhouse@1", slideshowVariant: caption ? "legacy" : "matchday" };
    let edited = reduceHomepageEditor(stateFor(renderer), { type: "field-changed", field: "photos.seasonLabel", value: "New season" });
    edited = reduceHomepageEditor(edited, { type: "photos-changed", photos: edited.draft.photos.items.map(photo => ({ ...photo, alt: "New alt" })) });
    expect(buildHomepageSaveRequest(edited, renderer, SAVE_OPERATION)).toEqual({
      operationId: SAVE_OPERATION, expectedRevision: "content-1", designRevision: "design-1",
      sections: { photos: {
        ...(caption ? { seasonLabel: "New season" } : {}),
        items: homepageDraft().photos.items.map(({ clientId, rowId, assetId, order }) => ({ clientId, rowId, assetId, order, alt: "New alt" })),
      } },
    });
  });

  it("preserves story visibility, request shape and exact submitted retry despite later draft changes", () => {
    let edited = reduceHomepageEditor(stateFor(academy), { type: "field-changed", field: "story.visible", value: false });
    edited = reduceHomepageEditor(edited, { type: "field-changed", field: "hero.intro", value: "First submission" });
    const original = buildHomepageSaveRequest(edited, academy, SAVE_OPERATION);
    expect(original).toEqual({
      operationId: SAVE_OPERATION, expectedRevision: "content-1", designRevision: "design-1",
      sections: { hero: { ...homepageDraft().hero, intro: "First submission" }, story: { ...homepageDraft().story, visible: false } },
    });
    let failed = reduceHomepageEditor(edited, { type: "save-started", operationId: SAVE_OPERATION });
    failed = reduceHomepageEditor(failed, { type: "save-failed", code: "NETWORK_ERROR", message: "Response lost" });
    failed = reduceHomepageEditor(failed, { type: "field-changed", field: "hero.intro", value: "Later draft" });
    expect(JSON.stringify(buildHomepageSaveRequest(failed, academy, "44444444-4444-4444-8444-444444444444"))).toBe(JSON.stringify(original));
  });

  it("saves video copy and visibility with no video source", () => {
    const edited = reduceHomepageEditor(stateFor(generic), { type: "field-changed", field: "video.visible", value: true });
    expect(buildHomepageSaveRequest(edited, generic, SAVE_OPERATION)).toEqual({
      operationId: SAVE_OPERATION, expectedRevision: "content-1", designRevision: "design-1",
      sections: { video: { ...homepageDraft().video, visible: true } },
    });
  });
});
