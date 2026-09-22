import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import { createHomepageEditorState, reduceHomepageEditor } from "@/lib/homepage-editor/model";
import type { HomepageRenderer } from "@/lib/homepage-editor/capabilities";

type Build = (state: ReturnType<typeof createHomepageEditorState>, renderer: HomepageRenderer, operationId: string) => { operationId: string; expectedRevision: string; designRevision: string; sections: Record<string, any> };
const renderer: HomepageRenderer = { templateKey: "editorial@1", slideshowVariant: "editorial", heroVariant: "editable" };
const state = () => createHomepageEditorState({ content: homepageDraft(), revision: "1", designRevision: "design", editableSections: ["hero", "photos"] });
describe("homepage preview save adapter", () => {
  it("sends only dirty available sections and strips unrendered hero fields", async () => {
    const build = await loadContract<Build>("@/lib/homepage-editor/adapter", "buildHomepageSaveRequest");
    const edited = reduceHomepageEditor(state(), { type: "field-changed", field: "hero.intro", value: "Working words" });
    const payload = build(edited, renderer, SAVE_OPERATION);
    expect(Object.keys(payload.sections)).toEqual(["hero"]);
    expect(payload.sections.hero.intro).toBe("Working words");
    expect(payload.sections.hero).not.toHaveProperty("eyebrow");
    expect(payload).not.toHaveProperty("club_id");
    expect(payload).toMatchObject({ operationId: SAVE_OPERATION, expectedRevision: "1", designRevision: "design" });
  });
  it("never sends preview URLs, queue state or unavailable photo captions", async () => {
    const build = await loadContract<Build>("@/lib/homepage-editor/adapter", "buildHomepageSaveRequest");
    const edited = reduceHomepageEditor(state(), { type: "photos-changed", photos: state().draft.photos.items.map((p, i) => ({ ...p, alt: `Edited ${i}` })) });
    const payload = build(edited, renderer, SAVE_OPERATION);
    expect(payload.sections.photos).not.toHaveProperty("seasonLabel");
    expect(Object.keys(payload.sections.photos.items[0]).sort()).toEqual(["alt", "assetId", "clientId", "order", "rowId"]);
  });
  it("reuses the original submitted operation and snapshot on retry", async () => {
    const build = await loadContract<Build>("@/lib/homepage-editor/adapter", "buildHomepageSaveRequest");
    const edited = reduceHomepageEditor(state(), { type: "field-changed", field: "hero.intro", value: "Original save" });
    const submitted = reduceHomepageEditor(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const failed = reduceHomepageEditor(submitted, { type: "save-failed", code: "NETWORK_ERROR", message: "Retry" });
    expect(build(failed, renderer, "11111111-1111-4111-8111-111111111111")).toEqual(build(edited, renderer, SAVE_OPERATION));
  });
});
