import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";
import {
  homepageDraft,
  RECOVERY_SCOPE,
  recoveryRecord,
  SAVE_OPERATION,
  type HomepageDraftFixture,
} from "../fixtures/homepage-editor";

type RecoveryResult =
  | { kind: "restore"; draft: HomepageDraftFixture }
  | { kind: "reconcile"; operationId: string; draft: HomepageDraftFixture }
  | { kind: "conflict"; draft: HomepageDraftFixture; reason: string }
  | { kind: "ignore"; reason: string };
type ResolveRecovery = (input: {
  record: unknown;
  scope: typeof RECOVERY_SCOPE;
  serverRevision: string;
  designRevision: string;
  now: string;
}) => RecoveryResult;

async function resolveRecord(record: unknown, overrides: Partial<Parameters<ResolveRecovery>[0]> = {}) {
  const resolveRecovery = await loadContract<ResolveRecovery>("@/lib/homepage-editor/recovery", "resolveHomepageRecovery");
  return resolveRecovery({
    record, scope: { ...RECOVERY_SCOPE }, serverRevision: "revision-1",
    designRevision: "design-1", now: "2026-09-15T13:00:00Z", ...overrides,
  });
}

describe("local homepage recovery decisions — actual IndexedDB belongs to browser coverage", () => {
  it("restores the complete unsaved draft only when its baseline and identity match", async () => {
    const record = recoveryRecord();
    const result = await resolveRecord(record);
    expect(result).toEqual({ kind: "restore", draft: record.draft });
    expect(record.baseline).toEqual(homepageDraft());
  });

  it.each(["origin", "userId", "clubId"] as const)("never restores another %s's draft", async (key) => {
    const record = recoveryRecord();
    record.scope[key] = "another-identity";
    const result = await resolveRecord(record);
    expect(result.kind).toBe("ignore");
    expect(result).not.toHaveProperty("draft");
  });

  it("preserves a stale draft as a conflict rather than silently restoring over newer content", async () => {
    const record = recoveryRecord();
    const result = await resolveRecord(record, { serverRevision: "revision-2" });
    expect(result).toMatchObject({ kind: "conflict", draft: record.draft, reason: "CONTENT_CHANGED" });
  });

  it("does not restore fields against a changed website design", async () => {
    const record = recoveryRecord();
    const result = await resolveRecord(record, { designRevision: "design-2" });
    expect(result).toMatchObject({ kind: "conflict", draft: record.draft, reason: "DESIGN_CHANGED" });
  });

  it("reconciles an uncertain submitted operation before treating its changed revision as a conflict", async () => {
    const record = recoveryRecord();
    record.submitted = { operationId: SAVE_OPERATION, snapshot: structuredClone(record.draft) };
    const result = await resolveRecord(record, { serverRevision: "revision-2" });
    expect(result).toEqual({ kind: "reconcile", operationId: SAVE_OPERATION, draft: record.draft });
  });

  it("retains a failed photo's file reference and successful photos for retry", async () => {
    const record = recoveryRecord();
    record.draft.photos.items[1] = {
      ...record.draft.photos.items[1], rowId: null, assetId: null, url: null,
      upload: "failed", localFileKey: "photo-file-2",
      error: { code: "STAGING_UPLOAD_FAILED", message: "Connection interrupted" },
    };
    const result = await resolveRecord(record);
    expect(result).toEqual({ kind: "restore", draft: record.draft });
  });

  it("does not restore a draft beyond the planned seven-day retention window", async () => {
    const record = recoveryRecord();
    const result = await resolveRecord(record, { now: "2026-09-23T12:00:00Z" });
    expect(result.kind).toBe("ignore");
    expect(result).not.toHaveProperty("draft");
  });

  it("rejects an otherwise valid recovery record with an invalid timestamp", async () => {
    const record = recoveryRecord();
    record.savedAt = "not-a-date";
    expect((await resolveRecord(record)).kind).toBe("ignore");
  });

  it("checks identity before attempting to reconcile another user's submitted operation", async () => {
    const record = recoveryRecord();
    record.scope.userId = "66666666-6666-4666-8666-666666666666";
    record.submitted = { operationId: SAVE_OPERATION, snapshot: structuredClone(record.draft) };
    const result = await resolveRecord(record, { serverRevision: "revision-2" });
    expect(result.kind).toBe("ignore");
    expect(result).not.toHaveProperty("draft");
    expect(result).not.toHaveProperty("operationId");
  });

  it.each([null, "corrupt JSON", {}, { schemaVersion: 999 }])("ignores malformed or unsupported recovery data %# without throwing", async (record) => {
    expect((await resolveRecord(record)).kind).toBe("ignore");
  });
});
