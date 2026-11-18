import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, getDirtyHomepageSections, getHomepageSaveBlocker, reduceHomepageEditor, type HomepageDraft } from "@/lib/homepage-editor/model";
import { HOMEPAGE_PARTS, PREVIEW_PIECES } from "@/components/admin/homepage/homepage-parts";
import { numberParts } from "@/components/admin/homepage/HomepageOverviewPreview";
import HomepagePartFields, { type HomepagePartEditor } from "@/components/admin/homepage/HomepagePartFields";

vi.mock("@/components/cinematic/CinematicShell", () => ({ default: () => null }));
vi.mock("@/components/HomePageClient", () => ({ default: () => null }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ storeEnabled: true }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const renderer = { templateKey: "cinematic@2", slideshowVariant: "cinematic", heroVariant: "editable" } as const;
const capabilities = resolveHomepageCapabilities(renderer);
const draft = (): HomepageDraft => ({ ...homepageDraft(), revamp: defaultCinematicHomepageContent() });
const stateOf = () => createHomepageEditorState({ content: draft(), revision: "1", designRevision: "design", editableSections: capabilities.editableSections, maxPhotos: 7 });
const editorFor = (value: HomepageDraft): HomepagePartEditor => ({
  draft: value, disabled: false, maxPhotos: 7, programs: [], photoCaptionEditable: capabilities.photoCaptionEditable, videoSourceSet: true,
  field: () => undefined, setRevamp: () => undefined, setPhotos: () => undefined, updatePhoto: () => undefined, removePhoto: () => undefined,
  retryPhoto: () => undefined, addPhotos: () => undefined, replaceArtwork: () => undefined, retryArtwork: () => undefined,
});
const fieldsHtml = (part: Parameters<typeof HomepagePartFields>[0]["part"]) => renderToStaticMarkup(createElement(HomepagePartFields, { part, e: editorFor(draft()) }));

describe("Homepage Overview: same edits, same payload", () => {
  it("an untouched load has nothing to save, so no request can be built", () => {
    expect(getDirtyHomepageSections(stateOf())).toEqual([]);
    expect(getHomepageSaveBlocker(stateOf())).toBe("NO_CHANGES");
    expect(() => buildHomepageSaveRequest(stateOf(), renderer, SAVE_OPERATION)).toThrow();
  });

  it("the Overview dispatches the editor's own actions and never builds a request of its own", () => {
    const sources = ["HomepageOverviewEditor", "HomepageOverviewPreview", "HomepagePartFields", "HomepageOverviewSkeleton"].map(name => read(`components/admin/homepage/${name}.tsx`)).join("\n");
    expect(sources).not.toMatch(/fetch\(|\.rpc\(|buildHomepageSaveRequest|\/api\/admin\/homepage/);
    const editor = read("components/admin/homepage/HomepageOverviewEditor.tsx");
    expect(editor).toContain('type: "field-changed"');
    expect(editor).toContain('type: "revamp-changed"');
    expect(editor).toContain('type: "photos-changed"');
    expect(editor).toContain("editor.save()");
    // Retry same save and the conflict path are the existing ones: PageSaveButton failure states mapped from the editor.
    expect(editor).toMatch(/failure: PageSaveFailure \| null = editor\.recoveryConflict \? "conflict"/);
    expect(editor).toContain('state?.submitted && state.save === "failed" ? "retry"');
    expect(editor).toContain('editor.error?.code === "CONTENT_CHANGED"');
    expect(editor).toContain("editor.retryLoad()");
  });

  it("Saved returns to Save after a moment, and a conflict offers Load latest and keep my edits", () => {
    const editor = read("components/admin/homepage/HomepageOverviewEditor.tsx");
    expect(editor).toContain("setSavedFlash(false), 1800");
    expect(editor).toContain("Load latest and keep my edits");
    expect(editor).toContain("restoreRecoveredDraft()");
    expect(editor).toContain('confirmLabel="Discard and reload"');
  });

  it("a hero edit made in the Overview saves the same hero request as before", () => {
    const edited = reduceHomepageEditor(stateOf(), { type: "field-changed", field: "hero.eyebrow", value: "Pasadena" });
    const request = buildHomepageSaveRequest(edited, renderer, SAVE_OPERATION);
    expect(Object.keys(request.sections)).toEqual(["hero"]);
    expect(request.sections.hero).toEqual({ ...Object.fromEntries(capabilities.heroEditableFields.map(field => [field, edited.draft.hero[field]])) });
    expect(request.sections.hero?.eyebrow).toBe("Pasadena");
  });

  it("a Behind the Rose edit saves the whole video block, including the fields the Overview does not show", () => {
    const start = stateOf();
    const edited = reduceHomepageEditor(start, { type: "field-changed", field: "video.title", value: "BEHIND THE ROSE II" });
    const video = buildHomepageSaveRequest(edited, renderer, SAVE_OPERATION).sections.video;
    expect(video).toEqual({ ...start.draft.video, title: "BEHIND THE ROSE II" });
    expect(video?.video_title).toBe(start.draft.video.video_title);
    expect(video?.caption).toBe(start.draft.video.caption);
  });

  it("splitting Menu and footer from External forms still saves one revamp section", () => {
    const start = stateOf();
    const revamp = structuredClone(start.draft.revamp!);
    revamp.navigation.labels.community = "Neighbours";
    revamp.navigation.destinations.tryouts = "https://forms.gle/example";
    const request = buildHomepageSaveRequest(reduceHomepageEditor(start, { type: "revamp-changed", content: revamp }), renderer, SAVE_OPERATION);
    expect(Object.keys(request.sections)).toEqual(["revamp"]);
    expect(request.sections.revamp?.navigation.labels.community).toBe("Neighbours");
    expect(request.sections.revamp?.navigation.destinations.tryouts).toBe("https://forms.gle/example");
  });
});

describe("Homepage Overview: what each part shows (the prototype's fields)", () => {
  it("Top of the page has the small heading, intro, two heading lines and both buttons, and nothing the prototype leaves out", () => {
    const html = fieldsHtml("hero");
    for (const label of ["Small heading", "Intro", "Line one", "Line two", "First button", "Second button"]) expect(html).toContain(label);
    expect(html).toContain("The background video and poster are set by Onzio.");
  });

  it("Behind the Rose shows small heading, heading and description only; the video is Onzio's", () => {
    const html = fieldsHtml("video");
    for (const label of ["Small heading", "Heading", "Description", "The video itself is set by Onzio."]) expect(html).toContain(label);
    expect(html).not.toContain("Video title");
    expect(html).not.toContain("Caption");
    expect(html).not.toContain("Show on homepage");
  });

  it("slideshow photos have a description and no caption or slideshow label for cinematic@2", () => {
    expect(capabilities.photoCaptionEditable).toBe(false);
    const html = fieldsHtml("photos");
    expect(html).toContain("Describe this photo");
    expect(html).toContain("Up to 7 photos");
    expect(html).not.toContain("Slideshow label");
    expect(html).not.toContain("Caption");
  });

  it("Menu and footer and External forms are separate parts; only the forms are off the page", () => {
    const menu = fieldsHtml("menu");
    const forms = fieldsHtml("forms");
    expect(menu).toContain("Footer logo");
    expect(menu).toContain("Rename the tabs and menu links");
    expect(menu).not.toContain("Tryouts form URL");
    expect(forms).toContain("Tryouts form URL");
    expect(forms).toContain("Media credentials form URL");
    expect(forms).toContain("National anthem request form URL");
    expect(forms).not.toContain("Footer logo");
    expect(HOMEPAGE_PARTS.filter(part => part.offPage).map(part => part.id)).toEqual(["forms"]);
    expect(HOMEPAGE_PARTS.map(part => part.id)).toHaveLength(11);
  });

  it("the form links warn on a non-HTTPS address before Save", () => {
    const value = draft();
    value.revamp!.navigation.destinations.tryouts = "http://example.com/form";
    const html = renderToStaticMarkup(createElement(HomepagePartFields, { part: "forms", e: editorFor(value) }));
    expect(html).toContain("Use a full HTTPS address");
    expect(fieldsHtml("forms")).not.toContain("Use a full HTTPS address");
  });

  it("keeps the 7-photo, 10-option and 30-link limits", () => {
    expect(capabilities.maxPhotos).toBe(7);
    const prices = read("components/admin/homepage/CinematicHomepageFields.tsx");
    expect(prices).toContain("content.prices.rows.length >= 10");
    expect(PREVIEW_PIECES).toContain("revamp.navigation");
  });
});

describe("Homepage Overview: numbering", () => {
  it("numbers blocks in page order and gives Menu and footer two numbers", () => {
    const rect = (top: number) => ({ top, left: 0, width: 10, height: 100 });
    expect(numberParts({ menu: [rect(0), rect(900)], hero: [rect(100)], match: [rect(300)], prices: [rect(300)], sponsors: [rect(800)] }))
      .toEqual({ menu: [1, 6], hero: [2], match: [3], prices: [4], sponsors: [5] });
  });
});

describe("The Edit in … chips", () => {
  it("are gone for cinematic@2 (routed to the Overview) and stay for every other template", () => {
    const entry = read("components/admin/homepage/HomepageEditor.tsx");
    const route = entry.indexOf('.editableSections.includes("revamp")) return <HomepageOverviewEditor />');
    expect(route).toBeGreaterThan(-1);
    expect(entry.indexOf("return classic ?")).toBeGreaterThan(route);
    for (const file of ["HomepageOverviewEditor", "HomepageOverviewPreview", "HomepagePartFields", "HomepageOverviewSkeleton"]) {
      const source = read(`components/admin/homepage/${file}.tsx`);
      expect(source).not.toContain("Edit in ");
      expect(source).not.toContain("cinematic-editor-shortcuts");
      expect(source).not.toContain("hp-shared-links");
    }
    // The other templates' editor is the one that still has the shortcut row (Diverse City is untouched).
    expect(entry).toContain('className="hp-shared-links"');
    expect(entry).toContain('"Edit in About"');
  });
});
