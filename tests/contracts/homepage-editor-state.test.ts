import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";
import {
  homepageDraft,
  photoFixture,
  SAVE_OPERATION,
  type EditorActionFixture,
  type EditorStateFixture,
  type HomepageDraftFixture,
  type HomepageSection,
} from "../fixtures/homepage-editor";

type CreateState = (input: {
  content: HomepageDraftFixture;
  revision: string;
  designRevision: string;
  editableSections: HomepageSection[];
}) => EditorStateFixture;
type Reduce = (state: EditorStateFixture, action: EditorActionFixture) => EditorStateFixture;
type Dirty = (state: EditorStateFixture) => HomepageSection[];
type SaveBlocker = (state: EditorStateFixture) => string | null;

async function model(editableSections: HomepageSection[] = ["hero", "photos", "story", "video"]) {
  const create = await loadContract<CreateState>("@/lib/homepage-editor/model", "createHomepageEditorState");
  const reduce = await loadContract<Reduce>("@/lib/homepage-editor/model", "reduceHomepageEditor");
  const dirty = await loadContract<Dirty>("@/lib/homepage-editor/model", "getDirtyHomepageSections");
  return {
    reduce,
    dirty,
    state: create({ content: homepageDraft(), revision: "revision-1", designRevision: "design-1", editableSections }),
  };
}

describe("homepage piece selection contract", () => {
  it("starts neutral and selecting a piece does not change any content", async () => {
    const { state, reduce, dirty } = await model();
    expect(state.selection).toBeNull();
    expect(state.disclosure).toBeNull();
    const selected = reduce(state, { type: "piece-selected", piece: "hero.eyebrow" });
    expect(selected.selection).toBe("hero.eyebrow");
    expect(selected.disclosure).toBeNull();
    expect(selected.draft).toEqual(state.draft);
    expect(dirty(selected)).toEqual([]);
    expect(state.selection).toBeNull();
  });

  it("opens the selected piece on its second activation", async () => {
    const { state, reduce } = await model();
    const first = reduce(state, { type: "piece-selected", piece: "hero.heading" });
    const second = reduce(first, { type: "piece-selected", piece: "hero.heading" });
    expect(second.disclosure).toEqual({ piece: "hero.heading", mode: "primary" });
  });

  it("selecting another piece closes the old disclosure without changing words", async () => {
    const { state, reduce } = await model();
    const selected = reduce(state, { type: "piece-selected", piece: "hero.heading" });
    const open = reduce(selected, { type: "piece-selected", piece: "hero.heading" });
    const next = reduce(open, { type: "piece-selected", piece: "hero.intro" });
    expect(next.selection).toBe("hero.intro");
    expect(next.disclosure).toBeNull();
    expect(next.draft).toEqual(state.draft);
  });

  it("Close keeps selection, while Done returns to neutral and preserves edits", async () => {
    const { state, reduce, dirty } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "New introduction" });
    const selected = reduce(edited, { type: "piece-selected", piece: "hero.intro" });
    const open = reduce(selected, { type: "piece-selected", piece: "hero.intro" });
    const closed = reduce(open, { type: "disclosure-closed" });
    expect(closed.selection).toBe("hero.intro");
    expect(closed.disclosure).toBeNull();
    const done = reduce(closed, { type: "done" });
    expect(done.selection).toBeNull();
    expect(done.disclosure).toBeNull();
    expect(done.draft.hero.intro).toBe("New introduction");
    expect(dirty(done)).toEqual(["hero"]);
  });
});

describe("homepage dirty state and photo identity", () => {
  it("tracks changed sections and becomes clean when text is restored", async () => {
    const { state, reduce, dirty } = await model();
    const hero = reduce(state, { type: "field-changed", field: "hero.intro", value: "Changed" });
    const both = reduce(hero, { type: "field-changed", field: "story.heading", value: "Changed story" });
    expect(dirty(both)).toEqual(["hero", "story"]);
    const restored = reduce(both, { type: "field-changed", field: "hero.intro", value: state.draft.hero.intro });
    expect(dirty(restored)).toEqual(["story"]);
    expect(state.draft).toEqual(homepageDraft());
    expect(both.baseline).toEqual(homepageDraft());
  });

  it("keeps an explicitly cleared story field raw for the public default resolver", async () => {
    const { state, reduce, dirty } = await model();
    const cleared = reduce(state, { type: "field-changed", field: "story.bodySecondary", value: "" });
    expect(cleared.draft.story.bodySecondary).toBe("");
    expect(dirty(cleared)).toEqual(["story"]);
  });

  it("hidden story content is retained and visibility alone makes Story dirty", async () => {
    const { state, reduce, dirty } = await model();
    const hidden = reduce(state, { type: "field-changed", field: "story.visible", value: false });
    expect(hidden.draft.story).toEqual({ ...state.draft.story, visible: false });
    expect(dirty(hidden)).toEqual(["story"]);
  });

  it("photo reorder preserves identities/descriptions and does not mutate the baseline", async () => {
    const { state, reduce, dirty } = await model();
    const photos = [photoFixture(2), photoFixture(1)].map((photo, order) => ({ ...photo, order }));
    const moved = reduce(state, { type: "photos-changed", photos });
    expect(moved.draft.photos.items).toEqual(photos);
    expect(moved.baseline.photos.items).toEqual([photoFixture(1), photoFixture(2)]);
    expect(dirty(moved)).toEqual(["photos"]);
  });

  it.each(["queued", "uploading", "failed"] as const)("blocks saving while a photo is %s", async (upload) => {
    const { state, reduce } = await model();
    const blocker = await loadContract<SaveBlocker>("@/lib/homepage-editor/model", "getHomepageSaveBlocker");
    const edited = reduce(state, { type: "photos-changed", photos: [{ ...photoFixture(1), upload }] });
    expect(blocker(edited)).toBe("PHOTOS_NOT_READY");
  });

  it("allows a dirty draft to save when every remaining photo is ready", async () => {
    const { state, reduce } = await model();
    const blocker = await loadContract<SaveBlocker>("@/lib/homepage-editor/model", "getHomepageSaveBlocker");
    const edited = reduce(state, { type: "photos-changed", photos: [photoFixture(1)] });
    expect(blocker(edited)).toBeNull();
  });

  it("does not let unavailable sections enter dirty state", async () => {
    const { state, reduce, dirty } = await model(["hero", "story"]);
    const next = reduce(state, { type: "field-changed", field: "video.title", value: "Unavailable" });
    expect(next.draft.video).toEqual(state.draft.video);
    expect(dirty(next)).toEqual([]);
  });
});

describe("homepage save state contract — database atomicity needs HP-02 database tests", () => {
  it("captures all edited sections in one immutable submitted snapshot", async () => {
    const { state, reduce, dirty } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "New intro" });
    const both = reduce(edited, { type: "field-changed", field: "story.heading", value: "New story" });
    const saving = reduce(both, { type: "save-started", operationId: SAVE_OPERATION });
    expect(saving.save).toBe("saving");
    expect(saving.submitted).toEqual({ operationId: SAVE_OPERATION, snapshot: both.draft });
    expect(saving.submitted?.snapshot).not.toBe(both.draft);
    expect(dirty(saving)).toEqual(["hero", "story"]);
    expect(saving.baseline).toEqual(state.baseline);
  });

  it("blocks text changes while saving so the response cannot erase newer input", async () => {
    const { state, reduce } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Submitted intro" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const duringSave = reduce(saving, { type: "field-changed", field: "hero.intro", value: "Must not be accepted" });
    expect(duringSave.draft).toEqual(saving.draft);
    expect(duringSave.submitted).toEqual(saving.submitted);
  });

  it("a failed save preserves every draft field, photo and operation ID for safe retry", async () => {
    const { state, reduce, dirty } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Keep these words" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const failed = reduce(saving, { type: "save-failed", code: "NETWORK_ERROR", message: "Connection lost" });
    expect(failed.save).toBe("failed");
    expect(failed.draft).toEqual(saving.draft);
    expect(failed.baseline).toEqual(state.baseline);
    expect(failed.submitted).toEqual(saving.submitted);
    expect(dirty(failed)).toEqual(["hero"]);
  });

  it("a duplicate save start preserves the active operation and submitted snapshot", async () => {
    const { state, reduce } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Submitted once" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const duplicate = reduce(saving, { type: "save-started", operationId: "66666666-6666-4666-8666-666666666666" });
    expect(duplicate.save).toBe("saving");
    expect(duplicate.submitted).toEqual(saving.submitted);
    expect(duplicate.draft).toEqual(saving.draft);
  });

  it("blocks photo removal and reordering while their snapshot is being saved", async () => {
    const { state, reduce } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Submitted intro" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const changed = reduce(saving, { type: "photos-changed", photos: [{ ...photoFixture(2), order: 0 }] });
    expect(changed.draft.photos).toEqual(saving.draft.photos);
    expect(changed.submitted).toEqual(saving.submitted);
  });

  it("only a matching success clears all edited sections together", async () => {
    const { state, reduce, dirty } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "New intro" });
    const both = reduce(edited, { type: "field-changed", field: "story.heading", value: "New story" });
    const saving = reduce(both, { type: "save-started", operationId: SAVE_OPERATION });
    const saved = reduce(saving, { type: "save-succeeded", operationId: SAVE_OPERATION, content: both.draft, revision: "revision-2" });
    expect(saved.save).toBe("saved");
    expect(saved.baseline).toEqual(both.draft);
    expect(saved.draft).toEqual(both.draft);
    expect(saved.baseRevision).toBe("revision-2");
    expect(dirty(saved)).toEqual([]);
  });

  it("ignores a stale success response for a different operation", async () => {
    const { state, reduce, dirty } = await model();
    const edited = reduce(state, { type: "field-changed", field: "hero.intro", value: "Keep this draft" });
    const saving = reduce(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const stale = reduce(saving, { type: "save-succeeded", operationId: "66666666-6666-4666-8666-666666666666", content: homepageDraft(), revision: "old-revision" });
    expect(stale.draft).toEqual(saving.draft);
    expect(stale.baseRevision).toBe("revision-1");
    expect(stale.save).toBe("saving");
    expect(dirty(stale)).toEqual(["hero"]);
  });
});
