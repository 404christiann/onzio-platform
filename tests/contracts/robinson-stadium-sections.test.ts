import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  emptyRobinsonContent, hydrateRobinsonContent, robinsonContentSchema, robinsonSaveSchema,
  type RobinsonContent, type RobinsonSaveRequest,
} from "@/lib/cinematic-robinson-content";
import { addBlock, addInfoRow, setImage, unusedUploads, updateBlock } from "@/lib/cinematic-robinson-editor";
import { createSaveLifecycle } from "@/components/admin/ui/useSaveState";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";
import {
  ROBINSON_SECTIONS, buildRobinsonSaveInput, changedRobinsonSections, robinsonPageState, robinsonSectionOnly, robinsonSectionSlice, robinsonSectionSummary,
} from "@/components/admin/stadium/robinson-sections";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Test club" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicRobinson from "@/components/cinematic/CinematicRobinson";

const reference = () => structuredClone(robinsonReferenceContent) as RobinsonContent;
const snapshot = { revision: "7", designRevision: "design-1" };
const OP = "6b0e6f1c-5d0a-4a0b-9d6e-0c7f1b0b7a11";

/** The save request expression as RobinsonStadiumEditor built it before RC-ADMIN-02, kept here verbatim as the reference. */
function legacyRequest(pending: RobinsonSaveRequest | null, draft: RobinsonContent, uploads: string[]) {
  return pending ?? { operationId: OP, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: unusedUploads(uploads, draft) };
}
const bytes = (value: unknown) => JSON.stringify(robinsonSaveSchema.parse(value));
const build = (pending: RobinsonSaveRequest | null, draft: RobinsonContent, uploads: string[]) =>
  buildRobinsonSaveInput({ pending, operationId: OP, snapshot, draft, uploads });

describe("Robinson Stadium sections", () => {
  it("lists the nine sections in the fixed page order", () => {
    expect(ROBINSON_SECTIONS.map(section => section.id)).toEqual(["heading", "seating", "story", "info", "match", "lockers", "food", "route", "directions"]);
    expect(ROBINSON_SECTIONS.map(section => section.title)).toEqual(["Page heading", "Seating map", "Story", "Stadium Info", "Next home match", "Lockers image", "Food & Beverage", "Road to the Match", "Directions"]);
  });

  it("maps every section to its own existing visible flag in the saved content, and nothing else", () => {
    const content = emptyRobinsonContent();
    const schemaKeys = Object.keys(robinsonContentSchema.shape).filter(key => key !== "images");
    expect(ROBINSON_SECTIONS.map(section => section.id).sort()).toEqual([...schemaKeys].sort());
    for (const section of ROBINSON_SECTIONS) {
      expect(typeof content[section.id].visible).toBe("boolean");
      const toggled = { ...content, [section.id]: { ...content[section.id], visible: !content[section.id].visible } } as RobinsonContent;
      expect(robinsonContentSchema.safeParse(toggled).success).toBe(true);
      expect(changedRobinsonSections(toggled, content)).toEqual([section.id]);
    }
  });

  it("marks only the sections whose fields or pictures changed", () => {
    const saved = reference(), draft = structuredClone(saved);
    expect(changedRobinsonSections(draft, saved)).toEqual([]);
    draft.story.quote += " x";
    draft.images.bus.alt = "A bus";
    draft.food.steps[1].label = "Changed";
    expect(changedRobinsonSections(draft, saved)).toEqual(["story", "food", "route"]);
    expect(robinsonSectionSlice(draft, "heading")).toBe(robinsonSectionSlice(saved, "heading"));
  });

  it("isolates one section for the preview without touching the draft", () => {
    const draft = reference(), copy = structuredClone(draft);
    for (const section of ROBINSON_SECTIONS) {
      const only = robinsonSectionOnly(draft, section.id);
      expect(robinsonContentSchema.safeParse(only).success).toBe(true);
      expect(ROBINSON_SECTIONS.filter(other => only[other.id].visible).map(other => other.id)).toEqual([section.id]);
      expect({ ...only[section.id], visible: draft[section.id].visible }).toEqual(draft[section.id]);
    }
    expect(draft).toEqual(copy);
  });

  it("renders the real public page component with just that section", () => {
    const draft = reference();
    const html = (id: (typeof ROBINSON_SECTIONS)[number]["id"]) => renderToStaticMarkup(createElement(CinematicRobinson, {
      content: hydrateRobinsonContent(robinsonSectionOnly({ ...draft, directions: { ...draft.directions, visible: false } }, id), []),
      ticketing: { purchaseUrl: "", missingPurchaseLabel: "x" },
    }));
    expect(html("heading")).toContain('id="r-title"');
    expect(html("heading")).not.toContain("r-story");
    expect(html("story")).toContain("r-story");
    expect(html("story")).not.toContain('id="r-title"');
    expect(html("food")).toContain("r-food");
    expect(html("info")).toContain("r-info-card");
    const directions = renderToStaticMarkup(createElement(CinematicRobinson, { content: hydrateRobinsonContent(robinsonSectionOnly(draft, "directions"), []), ticketing: { purchaseUrl: "", missingPurchaseLabel: "x" } }));
    expect(directions).toContain('id="parking-lot-no-5"');
    expect(directions).not.toContain("r-story");
  });

  it("summarises each section from the draft", () => {
    const draft = reference();
    expect(robinsonSectionSummary(draft, "directions")).toBe(`${draft.directions.blocks.length} sections`);
    expect(robinsonSectionSummary(emptyRobinsonContent(), "info")).toBe("0 rows · 0 marked No");
  });
});

describe("Robinson Stadium save request is unchanged", () => {
  it("untouched load then save sends a byte-identical request", () => {
    const loaded = reference(), draft = structuredClone(loaded);
    expect(bytes(build(null, draft, []))).toBe(bytes(legacyRequest(null, draft, [])));
    expect(JSON.parse(bytes(build(null, draft, []))).content).toEqual(loaded);
    expect(JSON.stringify(robinsonSaveSchema.parse(build(null, draft, [])).content)).toBe(JSON.stringify(robinsonContentSchema.parse(loaded)));
  });

  it("matches the previous builder for representative edits", () => {
    const upload = randomUUID(), replaced = randomUUID();
    const edits: Array<[string, (content: RobinsonContent) => RobinsonContent, string[]]> = [
      ["text", content => ({ ...content, heading: { ...content.heading, title: "New title" } }), []],
      ["flag", content => ({ ...content, story: { ...content.story, visible: !content.story.visible } }), []],
      ["info row", addInfoRow, []],
      ["directions block", content => updateBlock(addBlock(content), 0, { heading: "Renamed" }), []],
      ["new image kept", content => setImage(content, "seating", upload), [upload]],
      ["replaced upload retired", content => setImage(setImage(content, "seating", replaced), "seating", upload), [replaced, upload]],
    ];
    for (const [name, edit, uploads] of edits) {
      const draft = edit(reference());
      expect(bytes(build(null, draft, uploads)), name).toBe(bytes(legacyRequest(null, draft, uploads)));
    }
    expect(build(null, setImage(setImage(reference(), "seating", replaced), "seating", upload), [replaced, upload]).retiredMediaAssetIds).toEqual([replaced]);
  });

  it("re-sends a pending request exactly as it was, whatever the draft says now", () => {
    const pending = robinsonSaveSchema.parse({ operationId: randomUUID(), expectedRevision: "3", designRevision: "d", content: reference(), retiredMediaAssetIds: [] });
    const later = { ...reference(), heading: { ...reference().heading, title: "Edited after" } };
    expect(build(pending, later, [randomUUID()])).toBe(pending);
  });
});

describe("Robinson Stadium editor wiring", () => {
  const source = readFileSync("components/admin/stadium/RobinsonStadiumEditor.tsx", "utf8");
  it("previews with the public page component and saves through the visitor-pages route", () => {
    expect(source).toContain('import CinematicRobinson from "@/components/cinematic/CinematicRobinson"');
    expect(source).toContain('saveVisitorPageEditor<RobinsonContent>("robinson"');
    expect(source).toContain("robinsonSaveSchema.safeParse");
  });
  it("uses the page frame, preview cards, split dialog and the unsaved guard", () => {
    for (const name of ["PageFrame", "PreviewCards", 'mode="split"', "useUnsavedGuard", "robinsonPageState", "PageFrameSkeleton", "PreviewCardsSkeleton", "Load latest and keep my edits", "Reload saved page"]) {
      expect(source, name).toContain(name);
    }
  });
});

describe("Robinson Stadium Save button states", () => {
  const state = (over: Partial<Parameters<typeof robinsonPageState>[0]>) => robinsonPageState({ base: "clean", busy: false, uploading: false, pending: false, conflict: false, saveFailed: false, ...over });

  it("maps failures the way the page frame expects, and a running save wins", () => {
    expect(state({ base: "dirty" })).toBe("dirty");
    expect(state({ base: "dirty", pending: true })).toBe("retry");
    expect(state({ base: "dirty", conflict: true })).toBe("conflict");
    expect(state({ base: "dirty", saveFailed: true })).toBe("error");
    expect(state({ base: "dirty", pending: true, busy: true })).toBe("saving");
    expect(state({ base: "dirty", uploading: true })).toBe("clean");
  });

  it("goes retry -> saving -> saved -> clean when Retry same save succeeds", async () => {
    vi.useFakeTimers();
    try {
      let phase: "idle" | "saving" | "saved" = "idle";
      const lifecycle = createSaveLifecycle(next => { phase = next; });
      const shown: string[] = [];
      const record = (flags: Partial<Parameters<typeof robinsonPageState>[0]>) => shown.push(state({ base: phase === "saving" ? "saving" : phase === "saved" ? "saved" : "dirty", ...flags }));
      record({ pending: true }); // an earlier save is awaiting confirmation
      let finish!: () => void;
      const saving = lifecycle.save(() => new Promise<void>(resolve => { finish = resolve; })); // the retry runs through useSaveState
      record({ pending: true, busy: true });
      finish();
      await vi.advanceTimersByTimeAsync(2000);
      await saving;
      record({}); // committed: pending cleared, nothing left unsaved
      expect(shown).toEqual(["retry", "saving", "saved"]);
      await vi.advanceTimersByTimeAsync(5000);
      expect(phase).toBe("idle");
    } finally { vi.useRealTimers(); }
  });

  it("sends Retry same save through the same save action as Save, not around it", () => {
    const source = readFileSync("components/admin/stadium/RobinsonStadiumEditor.tsx", "utf8");
    expect(source).not.toMatch(/onRetry=/);
    expect(source).toContain("saveAction.save()");
  });
});
