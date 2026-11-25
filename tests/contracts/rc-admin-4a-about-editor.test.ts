import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DBAboutPageContent, DBClubLogoPageContent } from "@/lib/db-types";
import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { aboutEditorSaveSchema } from "@/lib/about-editor/contract";
import { ABOUT_CONTENT_DESTINATIONS } from "@/lib/about-editor/content-policy";
import { aboutPageEditableContent, prepareAboutPageSave } from "@/lib/about-editor/save";
import { moveAt } from "@/components/admin/ui/editor-kit/listOps";
import {
  SECTIONS, aboutFieldErrors, aboutPageState, acceptedDestinations, buildAboutSaveRequest, changedSections, closingIsEmpty, contentOfAbout, contentOfLogo,
  errorSection, firstErrorSection, moveCard, pageFingerprint, sectionChip, sectionSummary, toAboutDraft, toLogoDraft,
  type AboutDrafts,
} from "@/components/admin/about/rose-city/about-sections";
import { AboutSectionFields, type AboutFieldsApi } from "@/components/admin/about/rose-city/AboutSectionFields";

vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const root = resolve(__dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const OPERATION = "6f1b3c0e-5a38-4d0a-9c53-0d1f3a0a1b11";
const snapshot = { revision: "12", designRevision: "cinematic@2:rev" };
const NOW = "2026-11-19T10:00:00.000Z";

const aboutContent = (): DBAboutPageContent => ({
  ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "About Club", story_paragraphs: ["First paragraph.", "Second paragraph."], feature_image_url: "/images/about.webp",
  values_heading: "Our Values", values: [{ title: "Community", description: "One." }, { title: "Competition", description: "Two." }, { title: "Character", description: "Three." }],
  closing_text: "Join us.", closing_cta_label: "See the Schedule", closing_cta_href: "/schedule",
});
const feature = (n: number) => ({ title: `Feature ${n}`, description: `About ${n}`, patch_url: `/images/patch-${n}.png`, icon_url: `/images/icon-${n}.png`, icon_size: 60 + n, icon_scale: 1 + n / 10 });
const logoContent = (): DBClubLogoPageContent => ({
  ...EMPTY_CLUB_LOGO_PAGE_CONTENT, annotated_image_url: "/images/crest.png", map_image_url: "/images/map.png",
  features: [feature(1), feature(2), feature(3), feature(4)],
  color_cards: [{ label: "Red", image_url: "/images/red.png" }, { label: "Midnight", image_url: "/images/midnight.png" }, { label: "White", image_url: "/images/white.png" }],
});
const drafts = (): AboutDrafts => ({ about: toAboutDraft(aboutContent()), logo: toLogoDraft(logoContent()) });

/** The request the classic editor built for one page before the rebuild. */
function legacyRequest(page: "about" | "logo", about: DBAboutPageContent, logo: DBClubLogoPageContent, retired: string[] = []) {
  const prepared = prepareAboutPageSave({ page, about, logo, fixedClosingCtaHref: null, now: NOW });
  return aboutEditorSaveSchema.parse({ page: prepared.page, content: aboutPageEditableContent(prepared), operationId: OPERATION, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, retiredMediaUrls: retired });
}
const rebuilt = (page: "about" | "logo", state: AboutDrafts, retired: string[] = []) =>
  buildAboutSaveRequest({ page, pending: null, operationId: OPERATION, snapshot, drafts: state, retiredMediaUrls: retired, now: NOW });

describe("RC-ADMIN-4a About editor: save payload", () => {
  it("sends the same bytes as the classic editor for the About page", () => {
    expect(JSON.stringify(rebuilt("about", drafts()))).toBe(JSON.stringify(legacyRequest("about", aboutContent(), logoContent())));
  });
  it("sends the same bytes as the classic editor for the Club Logo page", () => {
    expect(JSON.stringify(rebuilt("logo", drafts()))).toBe(JSON.stringify(legacyRequest("logo", aboutContent(), logoContent())));
  });
  it("sends the same bytes after edits and with retired images", () => {
    const state = drafts();
    state.about.hero_title = "About Rose City ·rcv";
    state.about.values[1].title = "Competition, always";
    state.logo.features[2].icon_size = 99;
    const about = { ...aboutContent(), hero_title: state.about.hero_title, values: contentOfAbout(state.about).values };
    const logo = { ...logoContent(), features: contentOfLogo(state.logo).features };
    const retired = ["https://example.test/storage/v1/object/public/onzio-media/about/old.webp"];
    expect(JSON.stringify(rebuilt("about", state, retired))).toBe(JSON.stringify(legacyRequest("about", about, logo, retired)));
    expect(JSON.stringify(rebuilt("logo", state, retired))).toBe(JSON.stringify(legacyRequest("logo", about, logo, retired)));
  });
  it("sends one page's body only, in the schema's key order, with no card ids", () => {
    const about = rebuilt("about", drafts()), logo = rebuilt("logo", drafts());
    expect(Object.keys(about)).toEqual(["retiredMediaUrls", "operationId", "expectedRevision", "designRevision", "page", "content"]);
    expect(Object.keys(about.content)).toEqual(["hero_title", "story_paragraphs", "feature_image_url", "values_heading", "values", "closing_text", "closing_cta_label", "closing_cta_href"]);
    expect(Object.keys(logo.content)).toEqual(["annotated_image_url", "map_image_url", "features", "color_cards"]);
    expect(JSON.stringify(about) + JSON.stringify(logo)).not.toContain("_id");
    expect(about.page).toBe("about");
    expect(logo.page).toBe("logo");
  });
  it("re-sends an unconfirmed save unchanged, even if the draft moved on", () => {
    const first = rebuilt("about", drafts());
    const moved = drafts();
    moved.about.hero_title = "Changed after the failed save";
    expect(buildAboutSaveRequest({ page: "about", pending: first, operationId: "ignored", snapshot: { revision: "99", designRevision: "other" }, drafts: moved, retiredMediaUrls: [], now: NOW })).toBe(first);
  });
  it("keeps a trailing Enter while editing a paragraph and trims it only when the page is saved", () => {
    const state = drafts();
    state.about.story_paragraphs = ["First paragraph.\n", "Second paragraph."];
    expect(pageFingerprint("about", state)).not.toBe(pageFingerprint("about", drafts()));
    expect(rebuilt("about", state).content).toMatchObject({ story_paragraphs: ["First paragraph.", "Second paragraph."] });
  });
});

describe("RC-ADMIN-4a About editor: reordering changes only the order", () => {
  type Key = "values" | "features" | "color_cards";
  const lists: { name: string; key: Key; page: "about" | "logo"; ids: (state: AboutDrafts) => string[] }[] = [
    { name: "values", key: "values", page: "about", ids: state => state.about.values.map(card => card._id) },
    { name: "crest features", key: "features", page: "logo", ids: state => state.logo.features.map(card => card._id) },
    { name: "color cards", key: "color_cards", page: "logo", ids: state => state.logo.color_cards.map(card => card._id) },
  ];
  const cardsOf = (state: AboutDrafts, key: Key): { _id: string }[] => (key === "values" ? state.about.values : key === "features" ? state.logo.features : state.logo.color_cards);
  const withCards = (state: AboutDrafts, key: Key, cards: unknown[]): AboutDrafts =>
    key === "values" ? { ...state, about: { ...state.about, values: cards as never } } : key === "features" ? { ...state, logo: { ...state.logo, features: cards as never } } : { ...state, logo: { ...state.logo, color_cards: cards as never } };
  const contentList = (request: ReturnType<typeof rebuilt>, key: Key) => (request.content as unknown as Record<string, unknown[]>)[key];

  it.each(lists)("moves a card of $name earlier and later and leaves every card's contents untouched", ({ key, page, ids }) => {
    const before = drafts(), length = cardsOf(before, key).length;
    const original = contentList(rebuilt(page, before), key);
    for (let index = 0; index < length; index++) {
      for (const delta of [-1, 1] as const) {
        const target = index + delta;
        const id = ids(before)[index];
        const after = withCards(before, key, moveCard(cardsOf(before, key), id, delta));
        const request = rebuilt(page, after);
        const list = contentList(request, key);
        const expected = original.slice();
        if (target >= 0 && target < length) { const [item] = expected.splice(index, 1); expected.splice(target, 0, item); }
        expect(list).toEqual(expected);                       // the new order is exactly the one move
        expect([...list].map(item => JSON.stringify(item)).sort()).toEqual([...original].map(item => JSON.stringify(item)).sort()); // same cards, same contents
        const { [key]: _moved, ...rest } = request.content as unknown as Record<string, unknown>;
        const { [key]: _original, ...restBefore } = rebuilt(page, before).content as unknown as Record<string, unknown>;
        void _moved; void _original;
        expect(rest).toEqual(restBefore);                     // every other field of the page is unchanged
        expect(request.page).toBe(page);
      }
    }
  });
  it("a move on one page leaves the other page's request byte-identical", () => {
    const before = drafts();
    const moved = withCards(before, "features", moveCard(before.logo.features, before.logo.features[0]._id, 1));
    expect(JSON.stringify(rebuilt("about", moved))).toBe(JSON.stringify(rebuilt("about", before)));
    const valuesMoved = withCards(before, "values", moveCard(before.about.values, before.about.values[2]._id, -1));
    expect(JSON.stringify(rebuilt("logo", valuesMoved))).toBe(JSON.stringify(rebuilt("logo", before)));
  });
  it("cannot move the first card earlier or the last card later", () => {
    const items = [1, 2, 3];
    expect(moveAt(items, 0, -1)).toEqual([1, 2, 3]);
    expect(moveAt(items, 2, 1)).toEqual([1, 2, 3]);
    expect(moveAt(items, 1, -1)).toEqual([2, 1, 3]);
    expect(moveAt(items, 1, 1)).toEqual([1, 3, 2]);
    expect(moveAt(items, 5, 1)).toEqual([1, 2, 3]);
    expect(moveAt(items, 1, 1)).not.toBe(items);
  });
  it("marks the moved section as changed and moving back clears it", () => {
    const saved = drafts();
    const moved = withCards(saved, "values", moveCard(saved.about.values, saved.about.values[0]._id, 1));
    expect(changedSections(moved, saved)).toEqual(["values"]);
    const back = withCards(moved, "values", moveCard(moved.about.values, saved.about.values[0]._id, -1));
    expect(changedSections(back, saved)).toEqual([]);
  });

  const api = (state: AboutDrafts, locked = false): AboutFieldsApi => ({
    drafts: state, locked, uploading: false, errors: {}, setAbout: () => undefined, setLogo: () => undefined, retire: () => undefined, upload: async () => true, onMediaPending: () => undefined,
    destinations: { options: [], loaded: true, available: true, error: null, retry: () => undefined },
  });
  const buttonOf = (markup: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(markup)?.[0] ?? "";
  it.each([
    ["values", "value", 3], ["features", "crest feature", 4], ["colors", "color card", 3],
  ] as const)("the %s cards have move earlier and later; the first cannot go earlier, the last cannot go later", (section, noun, count) => {
    const markup = renderToStaticMarkup(createElement(AboutSectionFields, { api: api(drafts()), id: section }));
    expect(buttonOf(markup, `Move ${noun} 1 earlier`)).toContain("disabled");
    expect(buttonOf(markup, `Move ${noun} 1 later`)).not.toContain("disabled");
    expect(buttonOf(markup, `Move ${noun} ${count} later`)).toContain("disabled");
    expect(buttonOf(markup, `Move ${noun} ${count} earlier`)).not.toContain("disabled");
    expect(buttonOf(markup, `Move ${noun} 2 earlier`)).not.toContain("disabled");
    expect(buttonOf(markup, `Move ${noun} 2 later`)).not.toContain("disabled");
    expect(markup).not.toContain("draggable");
  });
  it("holds every move button while the page is locked", () => {
    const markup = renderToStaticMarkup(createElement(AboutSectionFields, { api: api(drafts(), true), id: "values" }));
    for (const n of [1, 2, 3]) { expect(buttonOf(markup, `Move value ${n} earlier`)).toContain("disabled"); expect(buttonOf(markup, `Move value ${n} later`)).toContain("disabled"); }
  });
});

describe("RC-ADMIN-4a About editor: sections, rules and wording", () => {
  it("has the four About cards and the three Club Logo cards", () => {
    expect(SECTIONS.about.map(section => section.title)).toEqual(["Page heading", "Story", "Values", "Closing"]);
    expect(SECTIONS.logo.map(section => section.title)).toEqual(["Crest and map images", "Crest features", "Color cards"]);
  });
  it("offers only the routes the server accepts", () => {
    const offered = ["/", "/tickets", "/schedule", "/stadium", "/club/about", "/club/logo", "/shop", "/contact", "/news", "/partners"].map(href => ({ href, label: href }));
    expect(acceptedDestinations(offered).map(option => option.href)).toEqual(["/", "/schedule", "/club/about", "/club/logo", "/shop", "/contact"]);
    expect(ABOUT_CONTENT_DESTINATIONS).toHaveLength(13);
    expect(acceptedDestinations(ABOUT_CONTENT_DESTINATIONS.map(href => ({ href, label: href })))).toHaveLength(13);
  });
  it("uses the classic editor's rules and words", () => {
    const ok = { loaded: true, available: true };
    const state = drafts();
    expect(aboutFieldErrors(state.about, ok)).toEqual({});
    expect(aboutFieldErrors({ ...state.about, hero_title: "  " }, ok).hero).toBe("Add a page heading before saving.");
    expect(aboutFieldErrors({ ...state.about, hero_title: "x".repeat(141) }, ok).hero).toBe("Keep the page heading to 140 characters.");
    const blank = { ...state.about, values: [...state.about.values, { _id: "new", title: " ", description: "" }] };
    expect(aboutFieldErrors(blank, ok)["values.new"]).toBe("Give this value a title, or remove it.");
    expect(aboutFieldErrors(state.about, { loaded: true, available: false }).href).toBe("Choose a page available to this club for the closing button before saving.");
    expect(aboutFieldErrors(state.about, { loaded: false, available: false }).href).toBeDefined();
    expect(firstErrorSection({ href: "x", "values.a": "y" })).toBe("values");
    expect(firstErrorSection({})).toBeNull();
    expect(errorSection("hero")).toBe("hero");
    expect(errorSection("href")).toBe("closing");
  });
  it("hides Values and Closing only when they are empty, and says so; there is no switch", () => {
    const state = drafts();
    expect(sectionChip(state, "values")).toBe("Shown");
    expect(sectionChip(state, "closing")).toBe("Shown");
    const empty: AboutDrafts = { ...state, about: { ...state.about, values: [], closing_text: "", closing_cta_label: "" } };
    expect(sectionChip(empty, "values")).toBe("Hidden while empty");
    expect(sectionChip(empty, "closing")).toBe("Hidden while empty");
    expect(closingIsEmpty(empty.about)).toBe(true);
    expect(sectionChip(state, "hero")).toBeUndefined();
    expect(sectionSummary(empty, "values")).toBe("No values yet");
    expect(sectionSummary(state, "story")).toBe("2 paragraphs · feature image");
  });
  it("shows the Save button's state for the page you are on, a running save first", () => {
    const base = { busy: false, pending: false, conflict: false, saveFailed: false };
    expect(aboutPageState({ ...base, base: "dirty" })).toBe("dirty");
    expect(aboutPageState({ ...base, base: "dirty", pending: true })).toBe("retry");
    expect(aboutPageState({ ...base, base: "dirty", conflict: true })).toBe("conflict");
    expect(aboutPageState({ ...base, base: "dirty", saveFailed: true })).toBe("error");
    expect(aboutPageState({ ...base, base: "dirty", busy: true, pending: true })).toBe("saving");
    expect(aboutPageState({ ...base, base: "saved" })).toBe("saved");
  });
});

describe("RC-ADMIN-4a About editor: Diverse City keeps the classic editor", () => {
  const page = source("app/admin/(protected)/about/page.tsx");
  it("sends only a Rose City club to the new editor; every other club still renders the classic editor", () => {
    expect(page).toContain('if (club.presentationTemplateKey === "cinematic@2") return <RoseCityAboutEditor />;');
    expect(page).toContain("<ClassicAboutToastBoundary><AboutEditor classic /></ClassicAboutToastBoundary>");
  });
  it("does not choose a template itself, so the selector debt does not grow", () => {
    for (const file of ["RoseCityAboutEditor.tsx", "AboutSectionFields.tsx", "about-sections.ts"]) {
      const text = source(`components/admin/about/rose-city/${file}`);
      expect(text).not.toContain("presentationTemplateKey");
      expect(text).not.toContain("cinematic@2");
    }
  });
  it("shares one upload helper with the classic editor, unchanged", () => {
    expect(source("lib/about-editor/upload.ts")).toContain('const bucket = kind === "graphic" ? "Aboutassets" : "about-page";');
    expect(page).toContain('import { uploadAboutImage } from "@/lib/about-editor/upload";');
    expect(page).not.toContain("async function uploadAboutImage");
  });
});
