import { describe, expect, it } from "vitest";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { resolveHomepageBindings, resolveHomepageCapabilities, type HomepageRenderer } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, reduceHomepageEditor } from "@/lib/homepage-editor/model";
import { currentHomepageBinding, homepageSaveFailureSettlesOperation, overlayHomepageRecovery, parseHomepageRecoveryRecord, resolveHomepageRecovery, type HomepageRecoveryRecord } from "@/lib/homepage-editor/recovery";
import { homepageDraft, RECOVERY_SCOPE, recoveryRecord, SAVE_OPERATION } from "../fixtures/homepage-editor";

const renderer: HomepageRenderer = { templateKey: null, slideshowVariant: "legacy", heroVariant: "editable" };
const bindings = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(renderer) });
const binding = { key: bindings.key, revision: bindings.revision };
const design = { ...renderer, binding };
const options = { scope: RECOVERY_SCOPE, now: "2026-09-15T13:00:00Z", serverRevision: "revision-1", designRevision: "design-1", design };
function v2(): HomepageRecoveryRecord & { schemaVersion: 2 } {
  return { ...recoveryRecord(), schemaVersion: 2, binding };
}
function decide(record: unknown, overrides: Partial<Parameters<typeof resolveHomepageRecovery>[0]> = {}) {
  return resolveHomepageRecovery({ ...options, record, ...overrides });
}
function pending(record: HomepageRecoveryRecord): HomepageRecoveryRecord {
  return { ...record, submitted: { operationId: SAVE_OPERATION, snapshot: structuredClone(record.draft) } };
}
function overlay(record: HomepageRecoveryRecord, current = homepageDraft(), target = bindings) {
  return overlayHomepageRecovery({ record, current, bindings: target });
}

describe("binding-aware browser draft decisions", () => {
  it("keeps strict version-one data and rejects unsupported core fields", () => {
    const legacy = recoveryRecord();
    expect(parseHomepageRecoveryRecord(legacy)).toEqual(legacy);
    expect(decide({ ...legacy, binding })).toEqual({ kind: "ignore", reason: "INVALID_RECORD" });
    expect(decide({ ...v2(), request: {} })).toEqual({ kind: "ignore", reason: "INVALID_RECORD" });
    expect(decide({ ...v2(), schemaVersion: 3 })).toEqual({ kind: "ignore", reason: "INVALID_RECORD" });
  });

  it.each([undefined, null, "unknown", {}, { key: binding.key }, { key: "uninstalled/homepage", revision: 1 },
    ...[0, -1, 1.5, 2, Number.MAX_SAFE_INTEGER + 1].map(revision => ({ ...binding, revision })),
  ])("retains valid words when version-two binding evidence is unavailable or incompatible %#", evidence => {
    const record = { ...v2(), binding: evidence };
    expect(parseHomepageRecoveryRecord(record)).not.toBeNull();
    const before = JSON.stringify(record);
    for (let reload = 0; reload < 3; reload += 1) {
      expect(decide(record)).toMatchObject({ kind: "conflict", reason: "BINDING_CHANGED", allowedAction: "review-only", draft: record.draft });
      expect(JSON.stringify(record)).toBe(before);
    }
  });

  it.each([undefined, null, { key: "uninstalled/homepage", revision: 1 }, { ...binding, revision: 0 }, { ...binding, revision: 2 }])(
    "does not invent current server evidence from the installed resolver %#", evidence => {
      expect(currentHomepageBinding({ ...renderer, binding: evidence })).toBeNull();
      expect(decide(v2(), { design: { ...renderer, binding: evidence } })).toMatchObject({ kind: "conflict", allowedAction: "review-only" });
    },
  );

  it("requires installed revision one even when saved and SQL both claim revision two", () => {
    const revisionTwo = { ...binding, revision: 2 };
    expect(decide({ ...v2(), binding: revisionTwo }, { design: { ...renderer, binding: revisionTwo } })).toMatchObject({ kind: "conflict", allowedAction: "review-only" });
  });

  it.each([
    { templateKey: "editorial@1", slideshowVariant: "editorial" },
    { templateKey: "academy@1", slideshowVariant: "none" },
    { ...renderer, slideshowVariant: "matchday" },
    { ...renderer, heroVariant: "legacy-fixed" },
  ] satisfies HomepageRenderer[])("requires the saved owner, field, caption and hero profile to match the installed profile %#", target => {
    const targetBinding = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(target) });
    expect(decide(v2(), { design: { ...target, binding: { key: targetBinding.key, revision: targetBinding.revision } } })).toMatchObject({ kind: "conflict", allowedAction: "review-only" });
  });

  it("restores real legacy records only with the original token and current binding proof", () => {
    const record = recoveryRecord();
    expect(decide(record)).toEqual({ kind: "restore", draft: record.draft });
    expect(decide(record, { serverRevision: "revision-2" })).toMatchObject({ kind: "conflict", reason: "CONTENT_CHANGED", allowedAction: "apply" });
    expect(decide(record, { designRevision: "design-2" })).toMatchObject({ kind: "conflict", reason: "DESIGN_CHANGED", allowedAction: "review-only" });
    expect(decide(record, { design: { ...renderer } })).toMatchObject({ kind: "conflict", allowedAction: "review-only" });
    expect(record).not.toHaveProperty("binding");
  });

  it("restores exact version-two drafts but requires review for either changed guard", () => {
    const record = v2();
    expect(decide(record)).toEqual({ kind: "restore", draft: record.draft });
    expect(decide(record, { serverRevision: "revision-2" })).toMatchObject({ kind: "conflict", reason: "CONTENT_CHANGED", allowedAction: "apply" });
    expect(decide(record, { designRevision: "design-2" })).toMatchObject({ kind: "conflict", reason: "DESIGN_CHANGED", allowedAction: "apply" });
  });

  for (const version of [1, 2]) {
    it.each([
      {}, { designRevision: "design-2" }, { serverRevision: "revision-2", designRevision: "design-2" },
      { design: { ...renderer, binding: null } },
      { design: { ...renderer, binding: { key: "unknown", revision: 1 } } },
    ])(`checks version-${version} submitted operations before any guard or binding mismatch %#`, overrides => {
      const record = pending(version === 1 ? { ...recoveryRecord(), schemaVersion: 1 } : v2());
      expect(decide(record, overrides)).toEqual({ kind: "reconcile", operationId: SAVE_OPERATION, draft: record.draft });
      expect(decide(record, { ...overrides, operation: "committed" })).toEqual({ kind: "committed" });
      expect(decide(record, { ...overrides, operation: "unresolved" })).toEqual({ kind: "unresolved" });
    });
  }

  it("checks shape, scope and retention before looking up even a reportedly committed operation", () => {
    const record = pending(v2());
    for (const field of ["origin", "userId", "clubId"] as const) {
      expect(decide({ ...record, scope: { ...record.scope, [field]: "another" } }, { operation: "committed" })).toEqual({ kind: "ignore", reason: "IDENTITY_MISMATCH" });
    }
    expect(decide(record, { now: "2026-09-22T12:00:00Z" }).kind).toBe("reconcile");
    expect(decide(record, { now: "2026-09-22T12:00:00.001Z", operation: "committed" })).toEqual({ kind: "ignore", reason: "EXPIRED" });
    expect(decide({ ...record, savedAt: "bad" }, { operation: "committed" })).toEqual({ kind: "ignore", reason: "INVALID_TIMESTAMP" });
    expect(decide({ ...record, draft: {} }, { operation: "committed" })).toEqual({ kind: "ignore", reason: "INVALID_RECORD" });
  });

  it("retains residual local changes and file references beyond a committed submitted snapshot", () => {
    const record = pending(v2());
    record.draft.photos.items[0] = { ...record.draft.photos.items[0], upload: "queued", localFileKey: "extra-file" };
    const before = structuredClone(record);
    expect(decide(record, { design: { ...renderer, binding: null }, operation: "committed" })).toMatchObject({ kind: "conflict", reason: "EXTRA_LOCAL_CHANGES", allowedAction: "review-only", draft: record.draft });
    expect(record).toEqual(before);
  });

  it("does not treat receipt absence with live request guards and incompatible metadata as settled", () => {
    const record = pending({ ...v2(), binding: { ...binding, revision: 2 } });
    expect(decide(record, { operation: "not-committed" })).toEqual({ kind: "unresolved" });
    expect(decide(record, { operation: "not-committed", designRevision: "design-2" })).toMatchObject({ kind: "conflict", allowedAction: "review-only" });
  });

  it.each(["OPERATION_REUSED", "NOT_AUTHORIZED", "AUTHENTICATION_REQUIRED", "UNKNOWN_TENANT", "SESSION_EXPIRED", "DATABASE_OPERATION_FAILED", "SAVE_FAILED", "future-code"])("retains save uncertainty on %s", code => {
    expect(homepageSaveFailureSettlesOperation(code)).toBe(false);
  });
  it.each(["CONTENT_CHANGED", "DESIGN_CHANGED", "INVALID_HOMEPAGE_PAYLOAD", "SECTION_UNAVAILABLE", "FIELD_UNAVAILABLE", "INVALID_PHOTO", "VIDEO_SOURCE_REQUIRED"])("permits editing after known rejection %s", code => {
    expect(homepageSaveFailureSettlesOperation(code)).toBe(true);
  });
});

describe("edited local field overlay", () => {
  it("copies only the edited headline and preserves current intro and second headline", () => {
    const record = v2();
    record.draft = structuredClone(record.baseline);
    record.draft.hero.headline_line_one = "Recovered headline";
    const current = homepageDraft();
    current.hero.intro = "Another administrator's intro";
    current.hero.headline_line_two = "Current second headline";
    const before = structuredClone(current);
    expect(overlay(record, current)?.hero).toEqual({ ...current.hero, headline_line_one: "Recovered headline" });
    expect(current).toEqual(before);
  });

  it("handles duplicated story visibility once through local bindings", () => {
    const academy = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities({ templateKey: "academy@1", slideshowVariant: "none" }) });
    const record = v2();
    record.draft = structuredClone(record.baseline);
    record.draft.story.visible = !record.baseline.story.visible;
    const current = homepageDraft();
    current.story.heading = "New current heading";
    expect(overlay(record, current, academy)?.story).toEqual({ ...current.story, visible: record.draft.story.visible });
  });

  it("never treats About, Shop or Programs shortcuts as local edit rights", () => {
    const editorial = { templateKey: "editorial@1", slideshowVariant: "editorial" } satisfies HomepageRenderer;
    const target = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(editorial) });
    const record = v2();
    record.draft.story.heading = "Shared About words";
    expect(overlay(record, homepageDraft(), target)).toBeNull();
    expect(decide({ ...record, binding: { key: target.key, revision: target.revision } }, {
      design: { ...editorial, binding: { key: target.key, revision: target.revision } }, serverRevision: "revision-2",
    })).toMatchObject({ kind: "conflict", reason: "UNSUPPORTED_EDIT", allowedAction: "review-only" });
  });

  it("replaces ordered photo items atomically while preserving an unedited current caption", () => {
    const record = v2();
    record.draft.photos.items.reverse();
    record.draft.photos.items[0] = { ...record.draft.photos.items[0], clientId: "interrupted-photo", rowId: null,
      assetId: null, url: null, order: 0, upload: "uploading", localFileKey: "photo-file" };
    const current = homepageDraft();
    current.photos.seasonLabel = "Administrator's new caption";
    expect(overlay(record, current)?.photos).toEqual({ seasonLabel: current.photos.seasonLabel, items: record.draft.photos.items });
  });

  it("changes an edited caption without replacing untouched current photos", () => {
    const record = v2();
    record.draft.photos.seasonLabel = "Recovered caption";
    const current = homepageDraft();
    current.photos.items.splice(0, 1);
    expect(overlay(record, current)?.photos).toEqual({ seasonLabel: "Recovered caption", items: current.photos.items });
  });

  it("blocks the whole overlay when a changed caption is not represented", () => {
    const record = v2();
    record.draft.photos.seasonLabel = "Unavailable caption";
    const noCaption = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities({ ...renderer, slideshowVariant: "matchday" }) });
    expect(overlay(record, homepageDraft(), noCaption)).toBeNull();
  });
});

describe("submitted operation identity with the unchanged save serializer", () => {
  it.each([1, 2])("reconstructs version-%s exact retry JSON from the original baseline, tokens, snapshot and UUID", version => {
    const initial = createHomepageEditorState({ content: homepageDraft(), revision: "revision-1", designRevision: "design-1", editableSections: resolveHomepageCapabilities(renderer).editableSections });
    const edited = reduceHomepageEditor(initial, { type: "field-changed", field: "hero.headline_line_one", value: "Submitted headline" });
    const submitted = reduceHomepageEditor(edited, { type: "save-started", operationId: SAVE_OPERATION });
    const core = { ...recoveryRecord(), baseline: submitted.baseline, draft: submitted.draft, submitted: submitted.submitted };
    const raw: unknown = JSON.parse(JSON.stringify(version === 1 ? core : { ...core, schemaVersion: 2, binding }));
    const record = parseHomepageRecoveryRecord(raw);
    if (!record) throw new Error("Expected a valid retained record");
    expect(decide(record, { operation: "not-committed" })).toEqual({ kind: "restore", draft: record.draft });
    const restored = { ...initial, baseline: record.baseline, draft: record.draft, baseRevision: record.baseRevision,
      designRevision: record.designRevision, submitted: record.submitted, save: "failed" as const };
    expect(JSON.stringify(buildHomepageSaveRequest(restored, renderer, "77777777-7777-4777-8777-777777777777"))).toBe(JSON.stringify(buildHomepageSaveRequest(submitted, renderer, SAVE_OPERATION)));
    expect(reduceHomepageEditor(restored, { type: "field-changed", field: "hero.intro", value: "Must stay frozen" })).toBe(restored);
    expect(restored.baseline.hero.headline_line_one).toBe(initial.baseline.hero.headline_line_one);
  });

  it("requires reviewed stale rebase before creating an unsent current draft and a new operation", () => {
    const record = pending(v2());
    const before = JSON.stringify(record);
    expect(decide(record, { operation: "not-committed", serverRevision: "revision-2", designRevision: "design-2" })).toMatchObject({ kind: "conflict", allowedAction: "apply" });
    const current = homepageDraft();
    current.hero.headline_line_two = "Saved later";
    const draft = overlay(record, current);
    if (!draft) throw new Error("Expected compatible local edits");
    const rebased = { ...createHomepageEditorState({ content: current, revision: "revision-2", designRevision: "design-2", editableSections: resolveHomepageCapabilities(renderer).editableSections }), draft };
    const newOperation = "77777777-7777-4777-8777-777777777777";
    expect(buildHomepageSaveRequest(rebased, renderer, newOperation)).toMatchObject({ operationId: newOperation, expectedRevision: "revision-2", designRevision: "design-2", sections: { hero: { intro: record.draft.hero.intro, headline_line_two: current.hero.headline_line_two } } });
    expect(JSON.stringify(record)).toBe(before);
    expect(record.submitted?.operationId).toBe(SAVE_OPERATION);
  });
});
