import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";
import {
  homepageDraft,
  photoFixture,
  SAVE_OPERATION,
  type EditorActionFixture,
  type EditorStateFixture,
  type HomepageSection,
} from "../fixtures/homepage-editor";

type Create = (input: {
  content: ReturnType<typeof homepageDraft>;
  revision: string;
  designRevision: string;
  editableSections: HomepageSection[];
  allowedPieces?: string[];
  editableFields?: string[];
}) => EditorStateFixture;
type Reduce = (state: EditorStateFixture, action: EditorActionFixture | { type: "save-reconciled-not-committed" } | { type: "disclosure-opened"; mode: "primary" | "more" }) => EditorStateFixture;
type Dirty = (state: EditorStateFixture) => HomepageSection[];
type Blocker = (state: EditorStateFixture) => string | null;

async function helpers(input: Partial<Parameters<Create>[0]> = {}) {
  const create = await loadContract<Create>("@/lib/homepage-editor/model", "createHomepageEditorState");
  const reduce = await loadContract<Reduce>("@/lib/homepage-editor/model", "reduceHomepageEditor");
  const dirty = await loadContract<Dirty>("@/lib/homepage-editor/model", "getDirtyHomepageSections");
  const blocker = await loadContract<Blocker>("@/lib/homepage-editor/model", "getHomepageSaveBlocker");
  const state = create({
    content: homepageDraft(),
    revision: "revision-1",
    designRevision: "design-1",
    editableSections: ["hero", "photos", "story", "video"],
    ...input,
  });
  return { state, reduce, dirty, blocker };
}

describe("homepage editor model edge cases", () => {
  it("selects story text and CTA independently", async () => {
    const { state, reduce } = await helpers({ allowedPieces: ["story.text", "story.cta"] });
    const text = reduce(state, { type: "piece-selected", piece: "story.text" });
    const cta = reduce(text, { type: "piece-selected", piece: "story.cta" });
    expect(text.selection).toBe("story.text");
    expect(cta.selection).toBe("story.cta");
    expect(cta.draft).toEqual(state.draft);
  });

  it("opens an explicit disclosure for the current piece without changing selection", async () => {
    const { state, reduce } = await helpers();
    const selected = reduce(state, { type: "piece-selected", piece: "hero.intro" });
    const opened = reduce(selected, { type: "disclosure-opened", mode: "more" });
    expect(opened.selection).toBe("hero.intro");
    expect(opened.disclosure).toEqual({ piece: "hero.intro", mode: "more" });
  });

  it("allows shared shortcuts without making an unavailable section editable", async () => {
    const { state, reduce, dirty } = await helpers({
      editableSections: ["hero"],
      allowedPieces: ["hero.heading", "shared.story"],
    });
    const selected = reduce(state, { type: "piece-selected", piece: "shared.story" });
    expect(selected.selection).toBe("shared.story");
    expect(dirty(selected)).toEqual([]);
  });

  it("rejects nested field paths and supports the photos season label", async () => {
    const { state, reduce, dirty } = await helpers();
    const rejected = reduce(state, { type: "field-changed", field: "hero.intro.extra", value: "ignored" });
    expect(rejected.draft).toEqual(state.draft);
    const changed = reduce(state, { type: "field-changed", field: "photos.seasonLabel", value: "2027 season" });
    expect(changed.draft.photos.seasonLabel).toBe("2027 season");
    expect(dirty(changed)).toEqual(["photos"]);
  });

  it("does not block on dormant over-limit photos", async () => {
    const { state, reduce, blocker } = await helpers({ editableSections: ["hero", "story"] });
    const changed = reduce(state, { type: "photos-changed", photos: Array.from({ length: 7 }, (_, i) => photoFixture(i + 1)) });
    expect(changed.draft.photos.items).toHaveLength(2);
    expect(blocker(changed)).toBe("NO_CHANGES");
  });

  it("does not block a dirty hero save on dormant over-limit photos", async () => {
    const { state, reduce, blocker } = await helpers({ editableSections: ["hero"] });
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Changed" });
    edited.draft.photos.items = Array.from({ length: 7 }, (_, i) => photoFixture(i + 1));
    expect(blocker(edited)).toBeNull();
  });

  it.each([
    ["hero", "hero.intro"],
    ["story", "story.heading"],
    ["video", "video.title"],
  ] as const)("uses semantic field equality for %s regardless of object key order", async (_section, field) => {
    const { state, reduce, dirty } = await helpers();
    const edited = reduce(state, { type: "field-changed", field, value: field.includes("intro") ? state.draft.hero.intro : field.includes("heading") ? state.draft.story.heading : state.draft.video.title });
    if (_section === "hero") {
      edited.draft.hero = Object.fromEntries(Object.entries(edited.draft.hero).reverse()) as typeof edited.draft.hero;
    } else if (_section === "story") {
      edited.draft.story = Object.fromEntries(Object.entries(edited.draft.story).reverse()) as typeof edited.draft.story;
    } else {
      edited.draft.video = Object.fromEntries(Object.entries(edited.draft.video).reverse()) as typeof edited.draft.video;
    }
    expect(dirty(edited)).toEqual([]);
  });

  it("clears saved status and errors only after an actual content edit", async () => {
    const { state, reduce } = await helpers();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Changed" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const failed = reduce(saving, { type: "save-failed", code: "NETWORK_ERROR", message: "Lost" });
    const same = reduce(failed, { type: "field-changed", field: "hero.intro", value: "Changed" });
    expect(same.save).toBe("failed");
    expect((same as unknown as { saveError: unknown }).saveError).toEqual({ code: "NETWORK_ERROR", message: "Lost" });
  });

  it("retries an uncertain failure with the original operation and snapshot", async () => {
    const { state, reduce } = await helpers();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Keep this" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const failed = reduce(saving, { type: "save-failed", code: "TIMEOUT", message: "Unknown result" });
    const retry = reduce(failed, { type: "save-started", operationId: "different-operation" });
    expect(retry.save).toBe("saving");
    expect(retry.submitted).toEqual(saving.submitted);
  });

  it("requires reconciliation before editing after an uncertain failure", async () => {
    const { state, reduce } = await helpers();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Keep this" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const failed = reduce(saving, { type: "save-failed", code: "TIMEOUT", message: "Unknown result" });
    const reconciled = reduce(failed, { type: "save-reconciled-not-committed" });
    const changed = reduce(reconciled, { type: "field-changed", field: "hero.intro", value: "After rollback" });
    expect(reconciled.submitted).toBeNull();
    expect(changed.draft.hero.intro).toBe("After rollback");
  });
});
