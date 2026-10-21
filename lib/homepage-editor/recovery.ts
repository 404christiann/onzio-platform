import { z } from "zod";
import { resolveHomepageBindings, resolveHomepageCapabilities, sameHomepageBindingMeaning, type HomepageBindingIdentity, type HomepageBindings, type HomepageRenderer } from "./capabilities";
import { homepageHeroSchema, homepageStorySchema, homepageVideoSchema } from "./contract";

// A recovered draft is browser-authored, not server-validated content: it can
// include queued/failed photos with no saved identity yet. This mirrors
// HomepagePhoto from ./model, not the save-request photo shape in ./contract.
const recoveryPhotoSchema = z.object({
  clientId: z.string(),
  rowId: z.string().nullable(),
  assetId: z.string().nullable(),
  url: z.string().nullable(),
  alt: z.string(),
  order: z.number(),
  upload: z.enum(["queued", "uploading", "ready", "failed"]),
  localFileKey: z.string().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
}).strict();

const recoveryDraftSchema = z.object({
  hero: homepageHeroSchema,
  photos: z.object({
    seasonLabel: z.string(),
    items: z.array(recoveryPhotoSchema),
  }).strict(),
  story: homepageStorySchema,
  video: homepageVideoSchema,
}).strict();

const recoveryScopeSchema = z.object({
  origin: z.string().min(1),
  userId: z.string().min(1),
  clubId: z.string().min(1),
}).strict();

const recoveryRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  scope: recoveryScopeSchema,
  savedAt: z.string(),
  baseRevision: z.string(),
  designRevision: z.string(),
  baseline: recoveryDraftSchema,
  draft: recoveryDraftSchema,
  submitted: z.object({
    operationId: z.string(),
    snapshot: recoveryDraftSchema,
  }).strict().nullable(),
}).strict();

const recoveryRecordSchema = z.discriminatedUnion("schemaVersion", [
  recoveryRecordV1Schema,
  recoveryRecordV1Schema.extend({ schemaVersion: z.literal(2), binding: z.unknown().optional() }),
]);
const bindingIdentitySchema = z.object({ key: z.string(), revision: z.number().int().positive().safe() }).strict();

export type HomepageRecoveryDraft = z.infer<typeof recoveryDraftSchema>;
export type HomepageRecoveryScope = z.infer<typeof recoveryScopeSchema>;
export type HomepageRecoveryRecord = z.infer<typeof recoveryRecordSchema>;
export type HomepageRecoveryReason = "CONTENT_CHANGED" | "DESIGN_CHANGED" | "BINDING_CHANGED" | "UNSUPPORTED_EDIT" | "EXTRA_LOCAL_CHANGES";
export type HomepageRecoveryResult =
  | { kind: "restore"; draft: HomepageRecoveryDraft }
  | { kind: "reconcile"; operationId: string; draft: HomepageRecoveryDraft }
  | { kind: "committed" }
  | { kind: "unresolved" }
  | { kind: "conflict"; draft: HomepageRecoveryDraft; reason: HomepageRecoveryReason; allowedAction: "apply" | "review-only" }
  | { kind: "ignore"; reason: string };

const RECOVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function parseHomepageRecoveryRecord(record: unknown): HomepageRecoveryRecord | null {
  const parsed = recoveryRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export function currentHomepageBinding(design: HomepageRenderer & { binding?: unknown }): HomepageBindingIdentity | null {
  const parsed = bindingIdentitySchema.safeParse(design.binding);
  const installed = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(design) });
  return parsed.success && sameHomepageBindingMeaning(parsed.data, installed) ? parsed.data : null;
}

export function overlayHomepageRecovery(input: {
  record: HomepageRecoveryRecord;
  current: HomepageRecoveryDraft;
  bindings: HomepageBindings;
}): HomepageRecoveryDraft | null {
  const { record, bindings } = input;
  const draft = structuredClone(input.current);
  const fields = new Set<string>();
  for (const binding of Object.values(bindings.elements)) {
    if (binding.kind === "shortcut") continue;
    for (const field of binding.fields) fields.add(`${binding.section}.${field}`);
  }
  function copyEditedFields<T extends object>(section: string, before: T, recovered: T, target: T): boolean {
    for (const field in recovered) {
      if (before[field] === recovered[field]) continue;
      if (!fields.has(`${section}.${field}`)) return false;
      target[field] = recovered[field];
    }
    return true;
  }
  for (const section of ["hero", "story", "video"] as const) {
    if (!copyEditedFields(section, record.baseline[section], record.draft[section], draft[section])) return null;
  }
  for (const field of ["seasonLabel", "items"] as const) {
    if (JSON.stringify(record.baseline.photos[field]) === JSON.stringify(record.draft.photos[field])) continue;
    if (!fields.has(`photos.${field}`)) return null;
    if (field === "items") draft.photos.items = structuredClone(record.draft.photos.items);
    else draft.photos.seasonLabel = record.draft.photos.seasonLabel;
  }
  return draft;
}

export function resolveHomepageRecovery(input: {
  record: unknown;
  scope: HomepageRecoveryScope;
  serverRevision: string;
  designRevision: string;
  design: HomepageRenderer & { binding?: unknown };
  now: string;
  operation?: "unchecked" | "not-committed" | "committed" | "unresolved";
}): HomepageRecoveryResult {
  const record = parseHomepageRecoveryRecord(input.record);
  if (!record) return { kind: "ignore", reason: "INVALID_RECORD" };
  if (
    record.scope.origin !== input.scope.origin ||
    record.scope.userId !== input.scope.userId ||
    record.scope.clubId !== input.scope.clubId
  ) return { kind: "ignore", reason: "IDENTITY_MISMATCH" };
  const savedAt = Date.parse(record.savedAt);
  const now = Date.parse(input.now);
  if (Number.isNaN(savedAt) || Number.isNaN(now)) return { kind: "ignore", reason: "INVALID_TIMESTAMP" };
  if (now - savedAt > RECOVERY_RETENTION_MS) return { kind: "ignore", reason: "EXPIRED" };

  const conflict = (reason: HomepageRecoveryReason, allowedAction: "apply" | "review-only" = "review-only"): HomepageRecoveryResult =>
    ({ kind: "conflict", draft: record.draft, reason, allowedAction });
  if (record.submitted) {
    if (!input.operation || input.operation === "unchecked") return { kind: "reconcile", operationId: record.submitted.operationId, draft: record.draft };
    if (input.operation === "committed") {
      return JSON.stringify(record.draft) === JSON.stringify(record.submitted.snapshot)
        ? { kind: "committed" } : conflict("EXTRA_LOCAL_CHANGES");
    }
    if (input.operation !== "not-committed") return { kind: "unresolved" };
  }
  const tokenChanged = input.designRevision !== record.designRevision;
  const revisionChanged = input.serverRevision !== record.baseRevision;
  const currentBinding = currentHomepageBinding(input.design);
  const storedBinding = record.schemaVersion === 2 ? bindingIdentitySchema.safeParse(record.binding) : null;
  const compatible = !!currentBinding && (record.schemaVersion === 1 ? !tokenChanged :
    !!storedBinding?.success && sameHomepageBindingMeaning(storedBinding.data, currentBinding));
  if (!compatible) {
    // A negative status does not cancel a request still waiting to reach SQL.
    if (record.submitted && !tokenChanged && !revisionChanged) return { kind: "unresolved" };
    return conflict(record.schemaVersion === 1 && tokenChanged ? "DESIGN_CHANGED" : "BINDING_CHANGED");
  }
  const bindings = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(input.design) });
  if (!overlayHomepageRecovery({ record, current: record.baseline, bindings })) {
    if (record.submitted && !tokenChanged && !revisionChanged) return { kind: "unresolved" };
    return conflict("UNSUPPORTED_EDIT");
  }
  if (tokenChanged || revisionChanged) return conflict(tokenChanged ? "DESIGN_CHANGED" : "CONTENT_CHANGED", "apply");
  return { kind: "restore", draft: record.draft };
}

export function homepageSaveFailureSettlesOperation(code: string): boolean {
  return ["CONTENT_CHANGED", "DESIGN_CHANGED", "INVALID_HOMEPAGE_PAYLOAD", "SECTION_UNAVAILABLE", "FIELD_UNAVAILABLE", "INVALID_PHOTO", "VIDEO_SOURCE_REQUIRED"].includes(code);
}
