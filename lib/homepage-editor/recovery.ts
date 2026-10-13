import { z } from "zod";
import { cinematicHomepageContentSchema } from "@/lib/cinematic-homepage-content";
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
  revamp: cinematicHomepageContentSchema.optional(),
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

const recoveryRecordSchema = z.object({
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
  }).nullable(),
}).strict();

export type HomepageRecoveryDraft = z.infer<typeof recoveryDraftSchema>;
export type HomepageRecoveryScope = z.infer<typeof recoveryScopeSchema>;
export type HomepageRecoveryRecord = z.infer<typeof recoveryRecordSchema>;

export type HomepageRecoveryResult =
  | { kind: "restore"; draft: HomepageRecoveryDraft }
  | { kind: "reconcile"; operationId: string; draft: HomepageRecoveryDraft }
  | { kind: "conflict"; draft: HomepageRecoveryDraft; reason: "CONTENT_CHANGED" | "DESIGN_CHANGED" }
  | { kind: "ignore"; reason: string };

// Proposed default from the approved plan (section 8): best-effort local
// recovery, not version history. Identify this limit in recovery messaging.
const RECOVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pure decision only: never touches IndexedDB, storage or the network. The
 * caller resolves the concrete record from browser storage and supplies the
 * server's current revision/design/identity so a stale or foreign draft is
 * never silently applied over newer content.
 */
export function resolveHomepageRecovery(input: {
  record: unknown;
  scope: HomepageRecoveryScope;
  serverRevision: string;
  designRevision: string;
  now: string;
}): HomepageRecoveryResult {
  const parsed = recoveryRecordSchema.safeParse(input.record);
  if (!parsed.success) return { kind: "ignore", reason: "INVALID_RECORD" };
  const record = parsed.data;

  if (
    record.scope.origin !== input.scope.origin ||
    record.scope.userId !== input.scope.userId ||
    record.scope.clubId !== input.scope.clubId
  ) {
    return { kind: "ignore", reason: "IDENTITY_MISMATCH" };
  }

  const savedAt = Date.parse(record.savedAt);
  const now = Date.parse(input.now);
  if (Number.isNaN(savedAt) || Number.isNaN(now)) {
    return { kind: "ignore", reason: "INVALID_TIMESTAMP" };
  }
  if (now - savedAt > RECOVERY_RETENTION_MS) {
    return { kind: "ignore", reason: "EXPIRED" };
  }

  // An in-flight save whose response was lost is ambiguous, not stale: check
  // whether it actually committed before treating a changed revision as a
  // conflict with someone else's newer content.
  if (record.submitted && input.serverRevision !== record.baseRevision) {
    return { kind: "reconcile", operationId: record.submitted.operationId, draft: record.draft };
  }

  if (input.designRevision !== record.designRevision) {
    return { kind: "conflict", draft: record.draft, reason: "DESIGN_CHANGED" };
  }
  if (input.serverRevision !== record.baseRevision) {
    return { kind: "conflict", draft: record.draft, reason: "CONTENT_CHANGED" };
  }

  return { kind: "restore", draft: record.draft };
}

/** Restore only fields changed by this draft. Concurrently saved words stay
 * current, and operator-owned presentation inputs always come from the server.
 * An edited ordered ticket-option list replaces that list, like photo order. */
export function mergeCinematicHomepageRecovery(
  baseline: import("@/lib/cinematic-homepage-content").CinematicHomepageContent | undefined,
  recovered: import("@/lib/cinematic-homepage-content").CinematicHomepageContent,
  current: import("@/lib/cinematic-homepage-content").CinematicHomepageContent,
): import("@/lib/cinematic-homepage-content").CinematicHomepageContent {
  function merge(before: unknown, after: unknown, latest: unknown): unknown {
    if (JSON.stringify(before) === JSON.stringify(after)) return structuredClone(latest);
    if (after && typeof after === "object" && !Array.isArray(after)) {
      const prior = before && typeof before === "object" && !Array.isArray(before) ? before as Record<string, unknown> : {};
      const edited = after as Record<string, unknown>;
      const output = latest && typeof latest === "object" && !Array.isArray(latest) ? structuredClone(latest) as Record<string, unknown> : {};
      for (const key of new Set([...Object.keys(prior), ...Object.keys(edited)])) {
        if (JSON.stringify(prior[key]) === JSON.stringify(edited[key])) continue;
        if (!Object.hasOwn(edited, key)) delete output[key];
        else output[key] = merge(prior[key], edited[key], output[key]);
      }
      return output;
    }
    return structuredClone(after);
  }
  const result = merge(baseline, recovered, current) as import("@/lib/cinematic-homepage-content").CinematicHomepageContent;
  result.presentation = structuredClone(current.presentation);
  return result;
}
