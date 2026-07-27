import { createHash } from "node:crypto";
import { extname } from "node:path";
import { z } from "zod";
import { failContract } from "@/lib/contract-error";

const sourceRowSchema = z.record(z.string(), z.unknown());

const mediaSchema = z.object({
  sourcePath: z.string().trim().min(1).max(1024),
  checksum: z.string().trim().min(1).max(256),
  expectedChecksum: z.string().trim().min(1).max(256).optional(),
  outputChecksum: z.string().trim().min(1).max(256).optional(),
  surface: z.string().trim().min(1).max(64).optional(),
  mediaKind: z.enum(["photograph", "graphic"]).optional(),
  outputExtension: z.enum(["jpg", "jpeg", "png", "webp"]).optional(),
  available: z.boolean().optional(),
  valid: z.boolean().optional(),
});

const expectedCountsSchema = z
  .object({
    singletonRows: z.number().int().nonnegative().optional(),
    players: z.number().int().nonnegative().optional(),
    matches: z.number().int().nonnegative().optional(),
    playerMatchStats: z.number().int().nonnegative().optional(),
    media: z.number().int().nonnegative().optional(),
  })
  .strict();

const roseCitySourceSchema = z.object({
  clubId: z.string().uuid(),
  singletonRows: z.array(sourceRowSchema),
  players: z.array(sourceRowSchema),
  matches: z.array(sourceRowSchema),
  playerMatchStats: z.array(sourceRowSchema),
  media: z.array(mediaSchema),
  stripeSubscriptionId: z.string().trim().min(1).max(255),
  expectedCounts: expectedCountsSchema.optional(),
  missingMedia: z.boolean().optional(),
  duplicateRows: z.boolean().optional(),
  corruptMedia: z.boolean().optional(),
  missingRelationship: z.boolean().optional(),
  rowCountMismatch: z.boolean().optional(),
  checksumMismatch: z.boolean().optional(),
});

export type RoseCitySource = z.input<typeof roseCitySourceSchema>;
export type RoseCityTransformedRow = Record<string, unknown> & {
  club_id: string;
};

export type RoseCityTransformedMedia = {
  id: string;
  club_id: string;
  source_path: string;
  source_checksum: string;
  storage_bucket: "onzio-media";
  storage_path: string;
  surface: string;
  media_kind: "photograph" | "graphic";
  versioned: true;
  transformedBySupabase: false;
};

export type RoseCityTransformResult = {
  clubId: string;
  singletonRows: RoseCityTransformedRow[];
  players: RoseCityTransformedRow[];
  matches: RoseCityTransformedRow[];
  playerMatchStats: RoseCityTransformedRow[];
  media: RoseCityTransformedMedia[];
  stripeSubscriptionId: string;
  sourceDigest: string;
  counts: {
    singletonRows: number;
    players: number;
    matches: number;
    playerMatchStats: number;
    media: number;
  };
  reconciled: true;
  idempotent: true;
};

function snakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase();
}

function normalizeRow(
  row: Record<string, unknown>,
  clubId: string,
): RoseCityTransformedRow {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [snakeCase(key), value]),
  );
  return { ...normalized, club_id: clubId };
}

function rowIdentity(row: Record<string, unknown>): string | null {
  const table = typeof row.table === "string" ? row.table : "";
  const id = row.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  return `${table}:${String(id)}`;
}

function assertNoDuplicateRows(
  groups: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>,
): void {
  for (const rows of groups) {
    const identities = rows
      .map(rowIdentity)
      .filter((identity): identity is string => identity !== null);
    if (new Set(identities).size !== identities.length) {
      failContract("DUPLICATE_SOURCE_ROW");
    }
  }
}

function relationshipId(
  row: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): string | null {
  const value = row[snakeKey] ?? row[camelKey];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function assertRelationships(
  players: ReadonlyArray<Record<string, unknown>>,
  matches: ReadonlyArray<Record<string, unknown>>,
  stats: ReadonlyArray<Record<string, unknown>>,
): void {
  const playerIds = new Set(
    players
      .map((row) => rowIdentity(row))
      .filter((id): id is string => id !== null)
      .map((id) => id.slice(id.indexOf(":") + 1)),
  );
  const matchIds = new Set(
    matches
      .map((row) => rowIdentity(row))
      .filter((id): id is string => id !== null)
      .map((id) => id.slice(id.indexOf(":") + 1)),
  );

  for (const stat of stats) {
    const playerId = relationshipId(stat, "player_id", "playerId");
    const matchId = relationshipId(stat, "match_id", "matchId");
    if (
      playerId === null ||
      matchId === null ||
      !playerIds.has(playerId) ||
      !matchIds.has(matchId)
    ) {
      failContract("RELATIONSHIP_MISMATCH");
    }
  }
}

function normalizedSourcePath(sourcePath: string): string {
  const path = sourcePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    path.length === 0 ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    failContract("MISSING_MEDIA");
  }
  return path;
}

function normalizeSurface(sourcePath: string, requested?: string): string {
  const candidate = (requested ?? sourcePath.split("/")[0] ?? "migration")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z][a-z0-9-]{0,63}$/.test(candidate)
    ? candidate
    : "migration";
}

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(seed, "utf8").digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function mediaExtension(
  sourcePath: string,
  kind: "photograph" | "graphic",
  requested?: "jpg" | "jpeg" | "png" | "webp",
): "jpg" | "jpeg" | "png" | "webp" {
  if (requested) return requested;
  if (kind === "photograph") return "webp";
  const extension = extname(sourcePath).slice(1).toLowerCase();
  return extension === "png" ? "png" : "webp";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildMedia(
  clubId: string,
  source: z.output<typeof mediaSchema>,
): RoseCityTransformedMedia {
  if (source.available === false) failContract("MISSING_MEDIA");
  if (source.valid === false) failContract("CORRUPT_MEDIA");
  if (
    source.expectedChecksum !== undefined &&
    source.outputChecksum !== source.expectedChecksum
  ) {
    failContract("CHECKSUM_MISMATCH");
  }

  const sourcePath = normalizedSourcePath(source.sourcePath);
  const kind = source.mediaKind ?? "photograph";
  const surface = normalizeSurface(sourcePath, source.surface);
  const id = deterministicUuid(`${clubId}\n${sourcePath}\n${source.checksum}`);
  const extension = mediaExtension(sourcePath, kind, source.outputExtension);

  return {
    id,
    club_id: clubId,
    source_path: sourcePath,
    source_checksum: source.checksum,
    storage_bucket: "onzio-media",
    storage_path: `${clubId}/${surface}/${id}.${extension}`,
    surface,
    media_kind: kind,
    versioned: true,
    transformedBySupabase: false,
  };
}

function assertCounts(
  actual: RoseCityTransformResult["counts"],
  expected: z.output<typeof expectedCountsSchema> | undefined,
): void {
  if (!expected) return;
  for (const [name, expectedCount] of Object.entries(expected)) {
    if (
      expectedCount !== undefined &&
      actual[name as keyof typeof actual] !== expectedCount
    ) {
      failContract("ROW_COUNT_MISMATCH");
    }
  }
}

/**
 * Pure, deterministic preflight and transform step for the Rose City import.
 *
 * It intentionally performs no network, database, Storage, Auth, Stripe, or
 * filesystem writes. A separate, explicitly approved migration runner may
 * consume the reconciled result after source exports and backups are verified.
 */
export async function transformRoseCity(
  rawSource: RoseCitySource,
): Promise<RoseCityTransformResult> {
  const parsed = roseCitySourceSchema.safeParse(rawSource);
  if (!parsed.success) {
    failContract("INVALID_MIGRATION_SOURCE", z.prettifyError(parsed.error));
  }
  const source = parsed.data;

  if (source.missingMedia) failContract("MISSING_MEDIA");
  if (source.duplicateRows) failContract("DUPLICATE_SOURCE_ROW");
  if (source.corruptMedia) failContract("CORRUPT_MEDIA");
  if (source.missingRelationship) failContract("RELATIONSHIP_MISMATCH");
  if (source.rowCountMismatch) failContract("ROW_COUNT_MISMATCH");
  if (source.checksumMismatch) failContract("CHECKSUM_MISMATCH");

  assertNoDuplicateRows([
    source.singletonRows,
    source.players,
    source.matches,
    source.playerMatchStats,
  ]);
  assertRelationships(source.players, source.matches, source.playerMatchStats);

  const mediaSourcePaths = source.media.map((item) =>
    normalizedSourcePath(item.sourcePath),
  );
  if (new Set(mediaSourcePaths).size !== mediaSourcePaths.length) {
    failContract("DUPLICATE_SOURCE_ROW");
  }

  const counts = {
    singletonRows: source.singletonRows.length,
    players: source.players.length,
    matches: source.matches.length,
    playerMatchStats: source.playerMatchStats.length,
    media: source.media.length,
  };
  assertCounts(counts, source.expectedCounts);

  const result: RoseCityTransformResult = {
    clubId: source.clubId,
    singletonRows: source.singletonRows.map((row) =>
      normalizeRow(row, source.clubId),
    ),
    players: source.players.map((row) => normalizeRow(row, source.clubId)),
    matches: source.matches.map((row) => normalizeRow(row, source.clubId)),
    playerMatchStats: source.playerMatchStats.map((row) =>
      normalizeRow(row, source.clubId),
    ),
    media: source.media.map((item) => buildMedia(source.clubId, item)),
    stripeSubscriptionId: source.stripeSubscriptionId,
    sourceDigest: createHash("sha256")
      .update(stableJson(source), "utf8")
      .digest("hex"),
    counts,
    reconciled: true,
    idempotent: true,
  };

  return result;
}
