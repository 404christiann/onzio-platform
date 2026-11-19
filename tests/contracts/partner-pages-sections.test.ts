import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import copy from "@/assets/rose-city-stadium-2027/content.json";
import {
  emptyStadiumContent, hydrateStadiumContent, resetStadiumMapFraming, stadiumContentSchema, stadiumSaveSchema, stadiumCropSchema,
  type StadiumContent, type StadiumSaveRequest,
} from "@/lib/stadium-content";
import {
  CHICK_FIL_A_SECTIONS, chickFilAContentSchema, chickFilASaveSchema, emptyChickFilAContent, hydrateChickFilAContent,
  type ChickFilAContent, type ChickFilASaveRequest,
} from "@/lib/chick-fil-a-content";
import { createSaveLifecycle } from "@/components/admin/ui/useSaveState";
import {
  FOOTHILL_FLAGS, FOOTHILL_SECTIONS, applyFoothillCrop, buildFoothillSaveInput, changedFoothillSections, foothillPreviewSlice, foothillSectionOnly, foothillSectionSummary,
} from "@/components/admin/stadium/foothill-sections";
import {
  CHICK_FIL_A_CARDS, CHICK_FIL_A_CARD_IMAGES, buildChickFilASaveInput, changedChickFilACards, chickFilACardOnly, chickFilAFlag, chickFilAImageRules, chickFilAPreviewSlice,
} from "@/components/admin/chick-fil-a/chick-fil-a-sections";
import { partnerPageState } from "@/components/admin/stadium/partner-page-state";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Test club" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicStadium from "@/components/cinematic/CinematicStadium";
import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA";

const OP = "6b0e6f1c-5d0a-4a0b-9d6e-0c7f1b0b7a11";
const snapshot = { revision: "7", designRevision: "design-1" };
const ticketing = { purchaseUrl: "", missingPurchaseLabel: "x" };
const foothill = () => stadiumContentSchema.parse(structuredClone(copy)) as StadiumContent;

/** The save request expression the Foothill Transit editor built before RC-ADMIN-03, verbatim. */
const legacyFoothill = (pending: StadiumSaveRequest | null, draft: StadiumContent, retired: string[]) =>
  pending ?? { operationId: OP, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: [...new Set(retired)] };
/** The same for Chick-fil-A. */
const legacyChick = (pending: ChickFilASaveRequest | null, draft: ChickFilAContent, retired: string[]) =>
  pending ?? { operationId: OP, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: [...new Set(retired)] };
const fBytes = (value: unknown) => JSON.stringify(stadiumSaveSchema.parse(value));
const cBytes = (value: unknown) => JSON.stringify(chickFilASaveSchema.parse(value));
const fBuild = (pending: StadiumSaveRequest | null, draft: StadiumContent, retired: string[]) => buildFoothillSaveInput({ pending, operationId: OP, snapshot, draft, retired });
const cBuild = (pending: ChickFilASaveRequest | null, draft: ChickFilAContent, retired: string[]) => buildChickFilASaveInput({ pending, operationId: OP, snapshot, draft, retired });

describe("Foothill Transit cards and flags", () => {
  it("lists six cards in the page order, each with its own existing flag, and Always shown where the schema has none", () => {
    expect(FOOTHILL_SECTIONS.map(section => section.title)).toEqual(["Page heading", "Bus and map images", "Phone map", "Next match", "Ticket benefits", "Sections"]);
    const flags = Object.values(FOOTHILL_FLAGS).filter(Boolean);
    expect(new Set(flags).size).toBe(5);
    expect(FOOTHILL_FLAGS.images).toBeNull();
    const content = emptyStadiumContent();
    for (const flag of flags as Array<keyof StadiumContent>) expect(typeof content[flag]).toBe("boolean");
    expect([...flags].sort()).toEqual(["showBenefits", "showHeading", "showMap", "showMatch", "showSections"]);
  });

  it("keeps two levels: the page flag showSections and each block's visible, saved exactly where they were", () => {
    const draft = foothill();
    expect(draft.sections.length).toBeGreaterThan(1);
    const blockOff = structuredClone(draft); blockOff.sections[1].visible = false;
    expect(fBytes(fBuild(null, blockOff, []))).toBe(fBytes(legacyFoothill(null, blockOff, [])));
    expect(JSON.parse(fBytes(fBuild(null, blockOff, []))).content.sections[1].visible).toBe(false);
    expect(JSON.parse(fBytes(fBuild(null, blockOff, []))).content.showSections).toBe(draft.showSections);
    expect(changedFoothillSections(blockOff, draft)).toEqual(["sections"]);
    const pageOff = { ...draft, showSections: false };
    expect(changedFoothillSections(pageOff, draft)).toEqual(["sections"]);
    expect(JSON.parse(fBytes(fBuild(null, pageOff, []))).content.sections).toEqual(JSON.parse(fBytes(fBuild(null, draft, []))).content.sections);
  });

  it("isolates one card for the preview without touching the draft, and the real page renders just that part", () => {
    const draft = foothill(), before = structuredClone(draft);
    for (const section of FOOTHILL_SECTIONS) expect(stadiumContentSchema.safeParse(foothillSectionOnly(draft, section.id)).success).toBe(true);
    expect(draft).toEqual(before);
    const html = (id: (typeof FOOTHILL_SECTIONS)[number]["id"]) => renderToStaticMarkup(createElement(CinematicStadium, { content: hydrateStadiumContent(foothillSectionOnly(draft, id), []), ticketing }));
    expect(html("heading")).toContain('id="robinson-title"');
    expect(html("heading")).not.toContain("robinson-directions");
    expect(html("sections")).toContain("robinson-directions");
    expect(html("sections")).not.toContain('id="robinson-title"');
    expect(html("benefits")).toContain("robinson-includes");
    expect(html("benefits")).not.toContain("robinson-match\"");
    expect(html("match")).toContain("robinson-match");
    expect(html("match")).not.toContain("robinson-includes");
  });

  it("does not mark a card as edited when the saved row lists its keys in another order", () => {
    const draft = foothill();
    const reordered = JSON.parse(JSON.stringify(draft)) as StadiumContent;
    for (const slot of ["bus", "map", "partner"] as const) reordered.artwork[slot] = { alt: reordered.artwork[slot].alt, assetId: reordered.artwork[slot].assetId };
    reordered.phoneCardCrop = { height: draft.phoneCardCrop.height, width: draft.phoneCardCrop.width, y: draft.phoneCardCrop.y, x: draft.phoneCardCrop.x };
    expect(changedFoothillSections(draft, reordered)).toEqual([]);
  });

  it("marks only the cards whose own fields changed and summarises each from the draft", () => {
    const saved: StadiumContent = { ...foothill(), phoneMapLayout: "split" }, draft = structuredClone(saved);
    expect(changedFoothillSections(draft, saved)).toEqual([]);
    draft.title += " x"; draft.benefits[0].detail += " y"; draft.artwork.bus.alt = "A bus"; draft.phoneMapLayout = "full";
    expect(changedFoothillSections(draft, saved)).toEqual(["heading", "images", "map", "benefits"]);
    expect(foothillPreviewSlice(draft, "heading")).not.toBe(foothillPreviewSlice(saved, "heading"));
    expect(foothillSectionSummary(saved, "benefits")).toBe(`${saved.benefits.length} ${saved.benefits.length === 1 ? "benefit" : "benefits"}`);
  });
});

describe("Foothill Transit phone map crop control", () => {
  it("accepts a crop that fits and refuses one that leaves the image, exactly as the old editor did", () => {
    const draft = foothill();
    const moved = applyFoothillCrop(draft, "phoneCardCrop", "x", 10);
    expect(moved?.phoneCardCrop.x).toBeCloseTo(0.1);
    expect(stadiumCropSchema.safeParse(moved!.phoneCardCrop).success).toBe(true);
    const wide = { ...draft, phoneCardCrop: { x: 0, y: 0, width: 0.5, height: 0.5 } };
    expect(applyFoothillCrop(wide, "phoneCardCrop", "x", 60)).toBeNull();
    expect(applyFoothillCrop(wide, "phoneCardCrop", "width", 0)).toBeNull();
    expect(applyFoothillCrop(wide, "phoneCardCrop", "height", 101)).toBeNull();
    expect(applyFoothillCrop(wide, "phoneCardCrop", "x", Number.NaN)).toBeNull();
    expect(wide.phoneCardCrop).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
  });

  it("sends the same request as the old crop handler for the same edit", () => {
    const draft = foothill();
    const legacy = structuredClone(draft);
    const candidate = { ...legacy.phoneMapCrop, width: 40 / 100 };
    expect(stadiumCropSchema.safeParse(candidate).success).toBe(true);
    legacy.phoneMapCrop = candidate;
    const next = applyFoothillCrop(draft, "phoneMapCrop", "width", 40)!;
    expect(fBytes(fBuild(null, next, []))).toBe(fBytes(legacyFoothill(null, legacy, [])));
    const layout = { ...draft, phoneMapLayout: draft.phoneMapLayout === "full" ? "split" as const : "full" as const };
    expect(JSON.parse(fBytes(fBuild(null, layout, []))).content.phoneMapLayout).toBe(layout.phoneMapLayout);
  });

  it("still resets framing to a full image when the map is replaced", () => {
    const reset = resetStadiumMapFraming(foothill());
    expect(reset.phoneMapLayout).toBe("full");
    expect(reset.phoneCardCrop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("Foothill Transit save request is unchanged", () => {
  it("an untouched load then save sends a byte-identical request", () => {
    const draft = foothill();
    expect(fBytes(fBuild(null, draft, []))).toBe(fBytes(legacyFoothill(null, draft, [])));
    expect(JSON.stringify(stadiumSaveSchema.parse(fBuild(null, draft, [])).content)).toBe(JSON.stringify(stadiumContentSchema.parse(draft)));
  });
  it("matches the old builder for representative edits and retires images once", () => {
    const retired = randomUUID();
    const edits: Array<[string, (content: StadiumContent) => void, string[]]> = [
      ["text", content => { content.title = "New title"; }, []],
      ["page flag", content => { content.showMatch = !content.showMatch; }, []],
      ["block flag", content => { content.sections[0].visible = !content.sections[0].visible; }, []],
      ["block bullet", content => { content.sections[0].bullets.push("Another"); }, []],
      ["benefit", content => { content.benefits.push({ title: "T", detail: "D" }); }, []],
      ["reorder", content => { [content.sections[0], content.sections[1]] = [content.sections[1], content.sections[0]]; }, []],
      ["retired image twice", content => { content.artwork.partner.assetId = null; }, [retired, retired]],
    ];
    for (const [name, edit, ids] of edits) {
      const draft = foothill(); edit(draft);
      expect(fBytes(fBuild(null, draft, ids)), name).toBe(fBytes(legacyFoothill(null, draft, ids)));
    }
    expect(fBuild(null, foothill(), [retired, retired]).retiredMediaAssetIds).toEqual([retired]);
  });
  it("re-sends a pending request exactly as it was", () => {
    const pending = stadiumSaveSchema.parse({ operationId: randomUUID(), expectedRevision: "3", designRevision: "d", content: foothill(), retiredMediaAssetIds: [] });
    expect(fBuild(pending, { ...foothill(), title: "Edited after" }, [randomUUID()])).toBe(pending);
  });
});

describe("Chick-fil-A cards and flags", () => {
  it("has seven cards: six with a switch mapped 1:1 to a flag, and Background with none", () => {
    expect(CHICK_FIL_A_CARDS.map(card => card.id)).toEqual(["heading", "details", "steps", "map", "match", "restaurant", "background"]);
    const flagged = CHICK_FIL_A_CARDS.map(card => chickFilAFlag(card.id)).filter(Boolean);
    expect(flagged).toEqual([...CHICK_FIL_A_SECTIONS]);
    expect(chickFilAFlag("background")).toBeNull();
    const content = emptyChickFilAContent();
    for (const section of CHICK_FIL_A_SECTIONS) {
      const toggled = { ...content, sections: { ...content.sections, [section]: !content.sections[section] } };
      expect(chickFilAContentSchema.safeParse(toggled).success).toBe(true);
      expect(changedChickFilACards(toggled, content)).toEqual([section]);
    }
  });

  it("puts each image in the confirmed card, once", () => {
    expect(CHICK_FIL_A_CARD_IMAGES).toEqual({
      heading: [], details: ["mealPass"], steps: ["driveThru", "freeTicket", "enjoyGame"], map: ["map"], match: ["partner"], restaurant: ["restaurant"], background: ["background"],
    });
    expect(Object.values(CHICK_FIL_A_CARD_IMAGES).flat().sort()).toEqual(["background", "driveThru", "enjoyGame", "freeTicket", "map", "mealPass", "partner", "restaurant"]);
  });

  it("does not mark a card as edited when the saved row lists its keys in another order", () => {
    const draft = emptyChickFilAContent();
    const reordered = JSON.parse(JSON.stringify(draft)) as ChickFilAContent;
    for (const slot of Object.keys(reordered.artwork) as Array<keyof ChickFilAContent["artwork"]>) reordered.artwork[slot] = { alt: reordered.artwork[slot].alt, assetId: reordered.artwork[slot].assetId };
    reordered.sections = Object.fromEntries(Object.entries(reordered.sections).reverse()) as ChickFilAContent["sections"];
    expect(changedChickFilACards(draft, reordered)).toEqual([]);
  });

  it("keeps today's upload rules per slot: restaurant also takes JPEG, from the homepage bucket", () => {
    expect(chickFilAImageRules("restaurant")).toMatchObject({ allowedTypes: ["image/jpeg", "image/png", "image/webp"], bucket: "homepage", maxBytes: 15 * 1024 * 1024 });
    for (const slot of ["mealPass", "driveThru", "freeTicket", "enjoyGame", "map", "partner", "background"] as const) {
      expect(chickFilAImageRules(slot)).toMatchObject({ allowedTypes: ["image/png", "image/webp"], bucket: "homepage-artwork", maxBytes: 5 * 1024 * 1024 });
    }
  });

  it("renders the real page with just one card's section, and the background behind the match card", () => {
    const draft = { ...emptyChickFilAContent(), title: "Edited food title", detailsBody: "Tenant terms" };
    const html = (id: (typeof CHICK_FIL_A_CARDS)[number]["id"]) => renderToStaticMarkup(createElement(CinematicChickFilA, { content: hydrateChickFilAContent(chickFilACardOnly(draft, id), []), purchase: ticketing }));
    expect(html("heading")).toContain("Edited food title");
    expect(html("heading")).not.toContain("food-details");
    expect(html("details")).toContain("Tenant terms");
    expect(html("details")).not.toContain("Edited food title");
    expect(html("steps")).toContain("food-steps");
    expect(html("match")).toContain("food-match-area");
    expect(html("background")).toContain("food-match-area");
    expect(chickFilAPreviewSlice(draft, "match")).not.toBe(chickFilAPreviewSlice({ ...draft, artwork: { ...draft.artwork, background: { assetId: randomUUID(), alt: "" } } }, "match"));
    expect(changedChickFilACards({ ...draft, artwork: { ...draft.artwork, background: { assetId: randomUUID(), alt: "" } } }, draft)).toEqual(["background"]);
    expect(draft.sections).toEqual(emptyChickFilAContent().sections);
  });
});

describe("Chick-fil-A save request is unchanged", () => {
  const loaded = () => ({ ...emptyChickFilAContent(), title: "Food", detailsBody: "Terms", stepLabels: ["a", "b", "c"] as [string, string, string] });
  it("an untouched load then save sends a byte-identical request", () => {
    const draft = loaded();
    expect(cBytes(cBuild(null, draft, []))).toBe(cBytes(legacyChick(null, draft, [])));
    expect(JSON.parse(cBytes(cBuild(null, draft, []))).content).toEqual(draft);
  });
  it("matches the old builder for representative edits", () => {
    const id = randomUUID();
    const edits: Array<[string, (content: ChickFilAContent) => void, string[]]> = [
      ["text", content => { content.title = "New"; }, []],
      ["step", content => { content.stepLabels[1] = "Changed"; content.stepNumbers[2] = "9"; }, []],
      ["flag", content => { content.sections.restaurant = false; }, []],
      ["all flags off", content => { for (const key of CHICK_FIL_A_SECTIONS) content.sections[key] = false; }, []],
      ["image", content => { content.artwork.background.assetId = id; content.artwork.background.alt = "Seats"; }, []],
      ["retired", content => { content.artwork.map.assetId = null; }, [id, id]],
    ];
    for (const [name, edit, ids] of edits) {
      const draft = loaded(); edit(draft);
      expect(cBytes(cBuild(null, draft, ids)), name).toBe(cBytes(legacyChick(null, draft, ids)));
    }
    expect(cBuild(null, loaded(), [id, id]).retiredMediaAssetIds).toEqual([id]);
  });
  it("re-sends a pending request exactly as it was", () => {
    const pending = chickFilASaveSchema.parse({ operationId: randomUUID(), expectedRevision: "3", designRevision: "d", content: loaded(), retiredMediaAssetIds: [] });
    expect(cBuild(pending, { ...loaded(), title: "Edited after" }, [randomUUID()])).toBe(pending);
  });
});

describe("Save button states", () => {
  const state = (over: Partial<Parameters<typeof partnerPageState>[0]>) => partnerPageState({ base: "clean", busy: false, uploading: false, pending: false, conflict: false, saveFailed: false, ...over });
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
      const record = (flags: Partial<Parameters<typeof partnerPageState>[0]>) => shown.push(state({ base: phase === "saving" ? "saving" : phase === "saved" ? "saved" : "dirty", ...flags }));
      record({ pending: true });
      let finish!: () => void;
      const saving = lifecycle.save(() => new Promise<void>(resolve => { finish = resolve; }));
      record({ pending: true, busy: true });
      finish();
      await vi.advanceTimersByTimeAsync(2000);
      await saving;
      record({});
      expect(shown).toEqual(["retry", "saving", "saved"]);
    } finally { vi.useRealTimers(); }
  });
});

describe("editor wiring", () => {
  const foot = readFileSync("components/admin/stadium/StadiumEditor.tsx", "utf8"), chick = readFileSync("components/admin/chick-fil-a/ChickFilAEditor.tsx", "utf8");
  it("previews with the public page component and saves through the visitor-pages route", () => {
    expect(foot).toContain('import CinematicStadium, { type StadiumTicketing } from "@/components/cinematic/CinematicStadium"');
    expect(foot).toContain('saveVisitorPageEditor<StadiumContent>("stadium"');
    expect(foot).toContain("stadiumSaveSchema.safeParse");
    expect(chick).toContain('import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA"');
    expect(chick).toContain('saveVisitorPageEditor("chick-fil-a"');
    expect(chick).toContain("chickFilASaveSchema.safeParse");
  });
  it("uses the page frame, preview cards, split dialog, unsaved guard, conflict actions and discard confirm", () => {
    for (const source of [foot, chick]) {
      for (const name of ["PageFrame", "PreviewCards", 'mode="split"', "useUnsavedGuard", "partnerPageState", "PageFrameSkeleton", "PreviewCardsSkeleton", "Load latest and keep my edits", "Reload saved page", "DISCARD_CONFIRM.confirmLabel", "saveAction.save()", "SettledPreview"]) expect(source, name).toContain(name);
      expect(source).not.toMatch(/onRetry=/);
    }
  });
});
