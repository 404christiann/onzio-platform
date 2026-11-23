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
import { HOMEPAGE_PARTS, PREVIEW_PIECES, homepagePartTitle, type PartId } from "@/components/admin/homepage/homepage-parts";
import { chooseSplit, layoutPartButtons, measureParts, numberParts, watchFrameLayout } from "@/components/admin/homepage/HomepageOverviewPreview";
import { loadPreviewMediaNow, preparePreviewDocument, PREVIEW_DOCUMENT_ATTRIBUTE, PREVIEW_DOCUMENT_STYLE, PREVIEW_STATIC_ATTRIBUTE, setPreviewStatic } from "@/components/admin/homepage/preview-document";
import { EDIT_TARGET_REGISTRY } from "@/lib/admin-edit-targets";
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
    expect(editor).toContain("confirmLabel={DISCARD_CONFIRM.confirmLabel}");
    expect(read("components/admin/editor-copy.ts")).toContain('confirmLabel: "Discard and reload"');
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

// UI-PREVIEW-OVERVIEW-OVERLAY-FIX: a part's label and its overlay box come from the same part id, measured from the frame the
// column shows; the preview document loads every picture now so no section stays blank or zero-height.
describe("Homepage Overview overlay: one part id for label and box", () => {
  type FakeNode = { selector: string; rect: { top: number; left: number; width: number; height: number }; closest: (selector: string) => FakeNode | null; getBoundingClientRect: () => DOMRect };
  /** A rendered page where each selector finds one node with its own rect; `closest(x)` finds the node registered as `<selector>|<x>`. */
  const page = (rects: Record<string, FakeNode["rect"]>, total = 7000) => {
    const nodes = new Map<string, FakeNode>();
    const make = (selector: string, rect: FakeNode["rect"]): FakeNode => ({
      selector, rect, getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height } as DOMRect),
      closest: around => nodes.get(`${selector}|${around}`) ?? null,
    });
    for (const [selector, rect] of Object.entries(rects)) nodes.set(selector, make(selector.split("|")[0], rect));
    return {
      querySelector: (selector: string) => nodes.get(selector) ?? null,
      body: { getBoundingClientRect: () => ({ top: 0, left: 0, width: 1200, height: total }) },
    } as unknown as Document;
  };
  /** Every anchor of every on-page part gets its own distinct rect: part index * 1000 + anchor index * 100. */
  const rectFor = (partIndex: number, anchorIndex: number) => ({ top: partIndex * 1000 + anchorIndex * 100, left: partIndex, width: 1200 - partIndex, height: 400 + anchorIndex });
  const fullPage = () => {
    const rects: Record<string, FakeNode["rect"]> = {};
    HOMEPAGE_PARTS.forEach((part, partIndex) => part.anchors.forEach((anchor, anchorIndex) => {
      rects[anchor.selector] = rectFor(partIndex, anchorIndex);
      if (anchor.closest) rects[`${anchor.selector}|${anchor.closest}`] = rectFor(partIndex, anchorIndex);
    }));
    return page(rects, HOMEPAGE_PARTS.length * 1000);
  };

  it("every part's title is the registry label of the same id, and homepage-parts.ts writes no title of its own", () => {
    const source = read("components/admin/homepage/homepage-parts.ts");
    for (const part of HOMEPAGE_PARTS) {
      const label = EDIT_TARGET_REGISTRY.homepage.sections[part.id]?.label;
      expect(label, part.id).toBeTruthy();
      expect(part.title).toBe(label);
      expect(homepagePartTitle(part.id)).toBe(label);
      expect(source).not.toContain(`"${label}"`);
    }
    expect(Object.keys(EDIT_TARGET_REGISTRY.homepage.sections)).toEqual(HOMEPAGE_PARTS.map(part => part.id));
    expect(() => homepagePartTitle("nope" as PartId)).toThrow(/no label/);
  });

  it("measureParts files each rect under the part whose anchor found it, and only there", () => {
    const measured = measureParts(fullPage())!;
    HOMEPAGE_PARTS.forEach((part, partIndex) => {
      expect(measured.rects[part.id] ?? [], part.id).toEqual(part.anchors.map((_, anchorIndex) => rectFor(partIndex, anchorIndex)));
    });
    expect(measured.rects.menu).toHaveLength(2);
    expect(measured.rects.forms).toBeUndefined();
  });

  it("measureParts follows an anchor's fallback and nearest section, and leaves out a part whose block is missing", () => {
    const hero = HOMEPAGE_PARTS.find(part => part.id === "hero")!.anchors[0];
    const sponsors = HOMEPAGE_PARTS.find(part => part.id === "sponsors")!.anchors[0];
    const measured = measureParts(page({ [hero.fallback!]: { top: 10, left: 0, width: 1200, height: 500 }, [`${hero.fallback!}|section`]: { top: 10, left: 0, width: 1200, height: 500 }, [sponsors.selector]: { top: 900, left: 40, width: 100, height: 60 }, [`${sponsors.selector}|section`]: { top: 880, left: 0, width: 1200, height: 300 } }))!;
    expect(measured.rects.hero).toEqual([{ top: 10, left: 0, width: 1200, height: 500 }]);
    expect(measured.rects.sponsors).toEqual([{ top: 880, left: 0, width: 1200, height: 300 }]);
    expect(measured.rects.raffle).toBeUndefined();
  });

  it("layoutPartButtons gives every button its own part's title, number and scaled box, never a neighbour's", () => {
    const measured = measureParts(fullPage())!;
    const numbers = numberParts(measured.rects);
    const scale = 0.5;
    const buttons = layoutPartButtons(HOMEPAGE_PARTS, measured, numbers, 0, measured.total, scale);
    expect(buttons.length).toBe(HOMEPAGE_PARTS.filter(part => !part.offPage).reduce((sum, part) => sum + part.anchors.length, 0));
    for (const button of buttons) {
      const part = HOMEPAGE_PARTS.find(item => item.id === button.part)!;
      const rect = measured.rects[button.part]![button.index];
      expect(button.title).toBe(`Edit ${part.title}`);
      expect(button.label).toBe(`Edit ${part.title} (part ${numbers[button.part]![button.index]})`);
      expect({ top: button.top, left: button.left, width: button.width, height: button.height }).toEqual({ top: rect.top * scale, left: rect.left * scale, width: rect.width * scale, height: rect.height * scale });
    }
    // Swap two parts' blocks on the page: each title moves with its own part's box.
    const swapped = { ...measured, rects: { ...measured.rects, ticket: measured.rects.photos, photos: measured.rects.ticket } };
    const moved = layoutPartButtons(HOMEPAGE_PARTS, swapped, numberParts(swapped.rects), 0, swapped.total, 1);
    expect(moved.find(button => button.part === "ticket")!.top).toBe(measured.rects.photos![0].top);
    expect(moved.find(button => button.title === "Edit Ticket and map")!.part).toBe("ticket");
  });

  it("a column's buttons come from the measurement it is given (its own frame), offset into that column", () => {
    const frameA = measureParts(fullPage())!;
    // The second frame laid the page out without the raffle picture: everything below it sits 1590px higher.
    const shift = 1590;
    const frameB = { total: frameA.total - shift, rects: Object.fromEntries(Object.entries(frameA.rects).map(([part, list]) => [part, list!.map(rect => part === "menu" || part === "hero" ? rect : { ...rect, top: rect.top - shift })])) };
    const numbers = numberParts(frameA.rects);
    const offset = frameB.rects.ticket![0].top;
    const column = layoutPartButtons(HOMEPAGE_PARTS, frameB, numbers, offset, frameB.total - offset, 1);
    const ticket = column.find(button => button.part === "ticket")!;
    expect(ticket.top).toBe(0);
    expect(ticket.label).toBe(`Edit Ticket and map (part ${numbers.ticket![0]})`);
    for (const button of column) expect(button.top).toBe(frameB.rects[button.part]![button.index].top - offset);
  });

  it("buttons outside the column's slice are left out, and a block shorter than 40px becomes the hidden pill", () => {
    const measured = { total: 3000, rects: { hero: [{ top: 0, left: 0, width: 1200, height: 500 }], raffle: [{ top: 500, left: 0, width: 1200, height: 0 }], photos: [{ top: 2000, left: 0, width: 1200, height: 600 }] } };
    const buttons = layoutPartButtons(HOMEPAGE_PARTS, measured, numberParts(measured.rects), 0, 1500, 1);
    expect(buttons.map(button => button.part)).toEqual(["hero", "raffle"]);
    expect(buttons[1]).toMatchObject({ hidden: true, label: "Edit Raffle. Hidden on the page." });
    expect(layoutPartButtons(HOMEPAGE_PARTS, null, {}, 0, 1500, 1)).toEqual([]);
  });

  it("the column split balances the columns, holds through small edits and moves when the page changes shape", () => {
    const at = (tops: Partial<Record<PartId, number>>, total: number) => ({ total, rects: Object.fromEntries(Object.entries(tops).map(([part, top]) => [part, [{ top, left: 0, width: 1200, height: 100 }]])) });
    // Before the raffle picture arrives (zero height): the championship is nearest the middle.
    const early = at({ menu: 0, hero: 163, raffle: 671, ticket: 1322, photos: 1849, championship: 3440, video: 4614 }, 5861);
    expect(chooseSplit(early, null)).toBe("championship");
    // A small edit (40px taller hero) never moves it.
    expect(chooseSplit(at({ menu: 0, hero: 163, raffle: 711, ticket: 1362, photos: 1889, championship: 3480, video: 4654 }, 5901), "championship")).toBe("championship");
    // The 1590px raffle picture lands: the left column would be 5030px against 2423px, so the split moves to balance them.
    const late = at({ menu: 0, hero: 163, raffle: 671, ticket: 2912, photos: 3439, championship: 5030, video: 6204 }, 7451);
    expect(chooseSplit(late, "championship")).toBe("photos");
    expect(chooseSplit(late, "photos")).toBe("photos");
    // Near a tie, typing that makes the other block a few px closer to the middle does not flip the columns back and forth.
    const tie = at({ ticket: 2950, photos: 3550 }, 6500);
    expect(chooseSplit(tie, null)).toBe("ticket");
    expect(chooseSplit(at({ ticket: 2950, photos: 3500 }, 6500), "ticket")).toBe("ticket");
    expect(chooseSplit(at({ ticket: 2950, photos: 3500 }, 6500), null)).toBe("photos");
    // Menu and footer never splits the page; no blocks keeps whatever was there.
    expect(chooseSplit(at({ menu: 3700 }, 7400), null)).toBeNull();
    expect(read("components/admin/homepage/HomepageOverviewPreview.tsx")).not.toContain("split.current");
  });
});

describe("Preview frames load every picture and show every section", () => {
  type Listener = (records: { type: string; target: unknown; addedNodes: unknown[] }[]) => void;
  type FakeElement = {
    tag: string; nodeType: 1; children: FakeElement[];
    getAttribute(name: string): string | null; setAttribute(name: string, value: string): void; removeAttribute(name: string): void;
    matches(selector: string): boolean; querySelectorAll(selector: string): { forEach(each: (node: unknown) => void): void };
  };
  const fakeElement = (tag: string, loading?: string, children: FakeElement[] = []): FakeElement => {
    const attributes = new Map<string, string>(loading ? [["loading", loading]] : []);
    const element: FakeElement = {
      tag, nodeType: 1, children,
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
      matches: (selector: string) => selector.split(",").some(part => { const [, name, value] = part.match(/^(\w+)\[loading="(\w+)"\]$/) ?? []; return name === tag && attributes.get("loading") === value; }),
      querySelectorAll: (selector: string) => ({ forEach: (each: (node: unknown) => void) => { const walk = (node: FakeElement) => node.children.forEach(child => { if (child.matches(selector)) each(child); walk(child); }); walk(element); } }),
    };
    return element;
  };
  const fakeDocument = (body: FakeElement) => {
    const root = fakeElement("html", undefined, [body]);
    const head = { nodes: [] as { textContent: string; getAttribute: (name: string) => string | null; remove: () => void }[], appendChild(node: never) { this.nodes.push(node); } };
    const observers: { listener: Listener; disconnected: boolean }[] = [];
    class FakeObserver { private entry: { listener: Listener; disconnected: boolean }; constructor(listener: Listener) { this.entry = { listener, disconnected: false }; observers.push(this.entry); } observe() {} disconnect() { this.entry.disconnected = true; } }
    const doc = {
      documentElement: root, head,
      defaultView: { MutationObserver: FakeObserver },
      createElement: () => { const attrs = new Map<string, string>(); const node = { textContent: "", setAttribute: (n: string, v: string) => attrs.set(n, v), getAttribute: (n: string) => attrs.get(n) ?? null, remove: () => { head.nodes.splice(head.nodes.indexOf(node), 1); } }; return node; },
      querySelectorAll: root.querySelectorAll,
    };
    return { doc: doc as unknown as Document, root, head, observers };
  };

  it("marks the frame document, makes lazy pictures and embeds eager (now and as they render), and undoes it all on cleanup", () => {
    const lazy = fakeElement("img", "lazy");
    const embed = fakeElement("iframe", "lazy");
    const eager = fakeElement("img", "eager");
    const body = fakeElement("body", undefined, [fakeElement("section", undefined, [lazy, eager]), embed]);
    const { doc, root, head, observers } = fakeDocument(body);
    const cleanup = preparePreviewDocument(doc);
    expect(root.getAttribute(PREVIEW_DOCUMENT_ATTRIBUTE)).toBe("true");
    expect(root.getAttribute(PREVIEW_STATIC_ATTRIBUTE)).toBe("true");
    expect(lazy.getAttribute("loading")).toBe("eager");
    expect(embed.getAttribute("loading")).toBe("eager");
    expect(head.nodes).toHaveLength(1);
    expect(head.nodes[0].textContent).toBe(PREVIEW_DOCUMENT_STYLE);
    // A section that renders later (Schedule's result, partner logos) and a picture switched back to lazy.
    const late = fakeElement("img", "lazy");
    observers[0].listener([{ type: "childList", target: body, addedNodes: [fakeElement("div", undefined, [late])] }]);
    expect(late.getAttribute("loading")).toBe("eager");
    lazy.setAttribute("loading", "lazy");
    observers[0].listener([{ type: "attributes", target: lazy, addedNodes: [] }]);
    expect(lazy.getAttribute("loading")).toBe("eager");
    cleanup();
    expect(root.getAttribute(PREVIEW_DOCUMENT_ATTRIBUTE)).toBeNull();
    expect(root.getAttribute(PREVIEW_STATIC_ATTRIBUTE)).toBeNull();
    expect(head.nodes).toHaveLength(0);
    expect(observers[0].disconnected).toBe(true);
  });

  it("a playback frame is marked and loads pictures now but is never frozen; the toggle freezes and unfreezes it", () => {
    const lazy = fakeElement("img", "lazy");
    const { doc, root } = fakeDocument(fakeElement("body", undefined, [lazy]));
    const cleanup = preparePreviewDocument(doc, { playback: true });
    expect(root.getAttribute(PREVIEW_DOCUMENT_ATTRIBUTE)).toBe("true");
    expect(root.getAttribute(PREVIEW_STATIC_ATTRIBUTE)).toBeNull();
    expect(lazy.getAttribute("loading")).toBe("eager");
    setPreviewStatic(doc, true);
    expect(root.getAttribute(PREVIEW_STATIC_ATTRIBUTE)).toBe("true");
    setPreviewStatic(doc, false);
    expect(root.getAttribute(PREVIEW_STATIC_ATTRIBUTE)).toBeNull();
    cleanup();
  });

  it("HomepagePreviewFrame prepares its frame in its own mode and follows the Playback toggle; the Overview is always static", () => {
    const frame = read("components/admin/homepage/HomepagePreviewFrame.tsx");
    expect(frame).toMatch(/unprepare = preparePreviewDocument\(doc, \{ playback: playbackRef\.current \}\)/);
    expect(frame).toMatch(/playbackRef\.current = playback;/);
    expect(frame).toMatch(/useEffect\(\(\) => \{ if \(body\) setPreviewStatic\(body\.ownerDocument, !playback\); \}, \[body, playback\]\);/);
    expect(read("components/admin/homepage/HomepageOverviewPreview.tsx")).toMatch(/unprepare = preparePreviewDocument\(doc\);/);
  });

  it("loadPreviewMediaNow reports what it changed and leaves eager pictures alone", () => {
    const body = fakeElement("body", undefined, [fakeElement("img", "lazy"), fakeElement("img", "eager"), fakeElement("img")]);
    expect(loadPreviewMediaNow(body as unknown as Element)).toBe(1);
    expect(loadPreviewMediaNow(body as unknown as Element)).toBe(0);
  });

  it("the preview style only applies inside a static preview document and shows entrance effects in their final state", () => {
    const rules = PREVIEW_DOCUMENT_STYLE.split("}").map(rule => rule.trim()).filter(Boolean);
    // Every freeze or reveal rule needs a static preview: a playback preview keeps the page's motion.
    for (const rule of rules) for (const selector of rule.slice(0, rule.indexOf("{")).split(",")) expect(selector.trim()).toMatch(/^html\[data-preview="true"\]\[data-preview-static="true"\] /);
    expect(PREVIEW_DOCUMENT_STYLE).toMatch(/\[style\*="opacity: 0"\]\[style\*="transform"\][^{]*\{ opacity: 1 !important; transform: none !important; visibility: visible !important; \}/);
    expect(PREVIEW_DOCUMENT_STYLE).toContain("animation: none !important; transition: none !important;");
  });

  it("every same-origin preview frame prepares its document; the public components are untouched", () => {
    // ShopScaledFrame is not clipped (its box is as tall as the measured page) and measures itself from its own DOM, so it shares
    // neither cause; it is left to the Shop click-to-field work.
    for (const file of ["components/admin/homepage/HomepageOverviewPreview.tsx", "components/admin/homepage/HomepagePreviewFrame.tsx"]) {
      const source = read(file);
      expect(source, file).toMatch(/unprepare = preparePreviewDocument\(doc[,)]/);
      expect(source, file).toMatch(/unprepare\?\.\(\)/);
    }
    for (const file of ["components/cinematic/CinematicHome.tsx", "components/cinematic/CinematicEpisode.tsx", "components/cinematic/CinematicSponsors.tsx", "components/cinematic/CinematicPhotos.tsx"]) {
      expect(read(file)).not.toMatch(/data-preview|preparePreviewDocument/);
    }
  });

  it("watchFrameLayout re-measures on resizes of the body and every part block, DOM changes, media loads and fonts, and cleans up", () => {
    const resized: unknown[] = [];
    const listeners = new Map<string, unknown>();
    const fontListeners = new Map<string, unknown>();
    let frames: (() => void)[] = [];
    let disconnected = 0;
    let fontsReady!: () => void;
    const anchor = { closest: () => null };
    const doc = {
      querySelector: (selector: string) => selector === HOMEPAGE_PARTS[2].anchors[0].selector ? anchor : null,
      addEventListener: (type: string, listener: unknown, capture: boolean) => { if (capture) listeners.set(type, listener); },
      removeEventListener: (type: string) => { listeners.delete(type); },
      fonts: { ready: new Promise<void>(resolve => { fontsReady = resolve; }), addEventListener: (type: string, listener: unknown) => fontListeners.set(type, listener), removeEventListener: (type: string) => fontListeners.delete(type) },
      defaultView: {
        requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; },
        cancelAnimationFrame: () => { frames = []; },
        ResizeObserver: class { observe(node: unknown) { resized.push(node); } disconnect() { disconnected++; } },
        MutationObserver: class { observe() {} disconnect() { disconnected++; } },
      },
    };
    const body = { ownerDocument: doc } as unknown as HTMLElement;
    let changes = 0;
    const stop = watchFrameLayout(body, HOMEPAGE_PARTS, () => { changes++; });
    expect(resized).toEqual([body, anchor]);
    expect([...listeners.keys()].sort()).toEqual(["error", "load", "loadeddata", "loadedmetadata"]);
    expect([...fontListeners.keys()]).toEqual(["loadingdone"]);
    frames.forEach(run => run()); frames = [];
    expect(changes).toBe(1);
    (listeners.get("load") as () => void)();
    (listeners.get("loadedmetadata") as () => void)();
    frames.forEach(run => run()); frames = [];
    expect(changes).toBe(2);
    fontsReady();
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      frames.forEach(run => run()); frames = [];
      expect(changes).toBe(3);
      stop();
      expect(disconnected).toBe(2);
      expect(listeners.size).toBe(0);
      expect(fontListeners.size).toBe(0);
    });
  });
});
