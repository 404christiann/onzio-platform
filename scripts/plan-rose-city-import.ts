import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  buildRoseCityImportPlan,
  deterministicUuid,
  ROSE_CITY_SOURCE_TABLES,
  type PlannedMedia,
  type SourceRow,
} from "@/lib/migration/rose-city-plan";
import {
  normalizeGraphic,
  normalizePhoto,
} from "@/lib/media-processing";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EXPECTED_EXPORT_KINDS = new Set([
  "rose-city-local-rehearsal-export",
  "rose-city-final-frozen-export",
]);
const EXPECTED_SOURCE_HOST = "nsgtkwqkbyxkiwrhzsje.supabase.co";
const APPROVED_INPUT_EXCEPTION_FLAG =
  "--allow-approved-rehearsal-input-limit-pre-normalization";

process.umask(0o077);

type StorageObject = {
  path: string;
  byteSize: number;
  checksumSha256: string;
  localRelativePath: string;
  metadata?: {
    mimetype?: string;
    contentType?: string;
    size?: number;
  } | null;
};

type StorageBucket = {
  name: string;
  objects: StorageObject[];
};

type StorageInventory = {
  bucketCount: number;
  objectCount: number;
  totalBytes: number;
  buckets: StorageBucket[];
};

function usage(): string {
  return [
    "Usage:",
    "  npm run migration:plan:rose-city -- \\",
    "    /absolute/private/source-export \\",
    "    /absolute/private/empty-output-directory \\",
    `    ${APPROVED_INPUT_EXCEPTION_FLAG}`,
    "",
    "The planner performs no network calls and refuses repository-contained paths.",
  ].join("\n");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

async function assertPrivateDirectory(
  rawPath: string,
  role: "source" | "output",
): Promise<string> {
  if (!isAbsolute(rawPath)) {
    throw new Error(`${role} path must be absolute.`);
  }
  const path = resolve(rawPath);
  if (isInside(REPOSITORY_ROOT, path)) {
    throw new Error(`Refusing repository-contained ${role} path.`);
  }
  if (role === "source") {
    const details = await stat(path);
    if (!details.isDirectory()) throw new Error("Source path is not a directory.");
    return path;
  }
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
  if ((await readdir(path)).length !== 0) {
    throw new Error("Output directory must be empty.");
  }
  return path;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writePrivateFile(path: string, contents: Buffer | string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function writeJson(path: string, value: unknown) {
  await writePrivateFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseChecksumLedger(contents: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of contents.trim().split("\n").filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) throw new Error("Checksum ledger contains an invalid entry.");
    if (result.has(match[2])) throw new Error("Checksum ledger contains duplicates.");
    result.set(match[2], match[1]);
  }
  return result;
}

async function hashFile(path: string): Promise<string> {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function verifySourcePackage(sourceDirectory: string): Promise<{
  tables: Record<string, SourceRow[]>;
  authIdentityCount: number;
  storage: StorageInventory;
  sourceDigest: string;
}> {
  const manifest = (await readJson(
    resolve(sourceDirectory, "manifest.json"),
  )) as Record<string, unknown>;
  const finalFrozenExport =
    manifest.kind === "rose-city-final-frozen-export";
  const freeze =
    manifest.freeze && typeof manifest.freeze === "object"
      ? (manifest.freeze as Record<string, unknown>)
      : null;
  if (
    !EXPECTED_EXPORT_KINDS.has(String(manifest.kind)) ||
    (finalFrozenExport &&
      (manifest.frozenSource !== true ||
        manifest.finalCutoverArtifact !== true ||
        typeof freeze?.startedAt !== "string")) ||
    manifest.sourceHost !== EXPECTED_SOURCE_HOST ||
    manifest.status !== "complete"
  ) {
    throw new Error("Refusing an incomplete or unexpected source package.");
  }

  const ledger = parseChecksumLedger(
    await readFile(resolve(sourceDirectory, "checksums.sha256"), "utf8"),
  );
  const checksumFailures: string[] = [];
  for (const [file, expected] of ledger) {
    const actual = await hashFile(resolve(sourceDirectory, file));
    if (actual !== expected) checksumFailures.push(file);
  }
  if (checksumFailures.length > 0) {
    throw new Error(
      `Source checksum verification failed for ${checksumFailures.length} files.`,
    );
  }

  const declaredTables = (
    (manifest.database as { tables?: Array<Record<string, unknown>> })?.tables ?? []
  ).filter((table) => table.status === "exported");
  if (
    declaredTables.length !== ROSE_CITY_SOURCE_TABLES.length ||
    Number(
      (manifest.database as { tableCount?: number } | undefined)?.tableCount,
    ) !== ROSE_CITY_SOURCE_TABLES.length
  ) {
    throw new Error("Source manifest does not declare all 24 tables.");
  }

  const tables: Record<string, SourceRow[]> = {};
  for (const table of ROSE_CITY_SOURCE_TABLES) {
    const rows = (await readJson(
      resolve(sourceDirectory, "database", `${table}.json`),
    )) as SourceRow[];
    if (!Array.isArray(rows)) throw new Error(`${table} is not a row array.`);
    const declaration = declaredTables.find((item) => item.table === table);
    if (
      !declaration ||
      declaration.beforeCount !== rows.length ||
      declaration.exportedCount !== rows.length ||
      declaration.afterCount !== rows.length
    ) {
      throw new Error(`${table} row count does not match the source manifest.`);
    }
    tables[table] = rows;
  }

  const authUsers = (await readJson(
    resolve(sourceDirectory, "auth", "users.json"),
  )) as unknown[];
  if (
    !Array.isArray(authUsers) ||
    Number((manifest.auth as { userCount?: number } | undefined)?.userCount) !==
      authUsers.length
  ) {
    throw new Error("Auth identity count does not match the source manifest.");
  }

  const storage = (await readJson(
    resolve(sourceDirectory, "storage", "inventory.json"),
  )) as StorageInventory;
  const objects = storage.buckets.flatMap((bucket) =>
    bucket.objects.map((object) => ({ bucket: bucket.name, ...object })),
  );
  if (
    storage.bucketCount !== storage.buckets.length ||
    storage.objectCount !== objects.length ||
    Number((manifest.storage as { objectCount?: number } | undefined)?.objectCount) !==
      objects.length ||
    storage.totalBytes !==
      objects.reduce((total, object) => total + object.byteSize, 0)
  ) {
    throw new Error("Storage counts do not match the source manifest.");
  }
  const objectKeys = objects.map((object) => `${object.bucket}\u001f${object.path}`);
  if (new Set(objectKeys).size !== objectKeys.length) {
    throw new Error("Storage inventory contains duplicate bucket/path entries.");
  }
  for (const object of objects) {
    const artifact = resolve(sourceDirectory, object.localRelativePath);
    const details = await stat(artifact);
    if (
      details.size !== object.byteSize ||
      ledger.get(object.localRelativePath) !== object.checksumSha256
    ) {
      throw new Error("Storage artifact metadata does not reconcile.");
    }
  }

  const sourceDigest = sha256(
    stableJson({
      tables: Object.fromEntries(
        ROSE_CITY_SOURCE_TABLES.map((table) => [
          table,
          ledger.get(`database/${table}.json`),
        ]),
      ),
      auth: ledger.get("auth/users.json"),
      storage: objects
        .map((object) => ({
          bucket: object.bucket,
          path: object.path,
          byteSize: object.byteSize,
          checksumSha256: object.checksumSha256,
        }))
        .sort((left, right) =>
          `${left.bucket}/${left.path}`.localeCompare(
            `${right.bucket}/${right.path}`,
          ),
        ),
    }),
  );
  return {
    tables,
    authIdentityCount: authUsers.length,
    storage,
    sourceDigest,
  };
}

function visitStrings(
  value: unknown,
  callback: (value: string) => void,
): void {
  if (typeof value === "string") {
    callback(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => visitStrings(item, callback));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => visitStrings(item, callback));
  }
}

function parseStorageReference(value: string): {
  bucket: string;
  path: string;
} | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== EXPECTED_SOURCE_HOST) return null;
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const publicIndex = segments.findIndex(
    (segment, index) =>
      segment === "public" &&
      index >= 3 &&
      segments[index - 1] === "object",
  );
  const transformedIndex = segments.findIndex(
    (segment, index) =>
      segment === "public" &&
      index >= 4 &&
      segments[index - 1] === "image" &&
      segments[index - 2] === "render",
  );
  const index = publicIndex >= 0 ? publicIndex : transformedIndex;
  if (index < 0 || segments.length < index + 3) return null;
  return {
    bucket: segments[index + 1],
    path: segments.slice(index + 2).join("/"),
  };
}

function referencedObjects(tables: Record<string, SourceRow[]>): Set<string> {
  const references = new Set<string>();
  for (const rows of Object.values(tables)) {
    visitStrings(rows, (value) => {
      const reference = parseStorageReference(value);
      if (reference) {
        references.add(`${reference.bucket}\u001f${reference.path}`);
      }
    });
  }
  for (const row of tables.site_branding ?? []) {
    if (
      typeof row.club_logo_path === "string" &&
      row.club_logo_path.trim() !== ""
    ) {
      references.add(`logos_v2\u001f${row.club_logo_path}`);
    }
  }
  return references;
}

function extension(path: string): string {
  return extname(path).slice(1).toLowerCase();
}

function detectedFormat(bytes: Buffer): "jpeg" | "png" | "webp" | "gif" | "mp4" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (
    bytes.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
  ) {
    return "gif";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
    return "mp4";
  }
  return null;
}

function surfaceForBucket(bucket: string): string {
  const surfaces: Record<string, string> = {
    "about-page": "about",
    Aboutassets: "about",
    flags: "flags",
    homepage: "homepage",
    logos: "branding",
    logos_v2: "branding",
    "opponent-logos": "schedule",
    "player-action-photos": "roster",
    "roster-images": "roster",
    shop: "shop",
    sponsors: "sponsors",
    "staff-images": "roster",
    standings: "standings",
    videos: "homepage",
  };
  return surfaces[bucket] ?? "migration";
}

function intendedKind(
  bucket: string,
  path: string,
): "photograph" | "graphic" | null {
  if (
    [
      "homepage",
      "player-action-photos",
      "roster-images",
      "shop",
      "staff-images",
    ].includes(bucket)
  ) {
    return "photograph";
  }
  if (bucket === "about-page") {
    return /^color-/i.test(path) || extension(path) === "png"
      ? "graphic"
      : "photograph";
  }
  if (
    [
      "Aboutassets",
      "flags",
      "logos",
      "logos_v2",
      "opponent-logos",
      "sponsors",
      "standings",
    ].includes(bucket)
  ) {
    return "graphic";
  }
  return null;
}

async function firstBytes(path: string, length = 32): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function normalizeApprovedMigrationPhoto(bytes: Buffer) {
  const { data, info } = await sharp(bytes, {
    failOn: "warning",
    limitInputPixels: 36_000_000,
  })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    width: info.width,
    height: info.height,
    format: "webp" as const,
    mimeType: "image/webp" as const,
    hasAlpha: false,
    metadataStripped: true as const,
    checksumSha256: sha256(data),
  };
}

async function normalizeApprovedMigrationGraphic(bytes: Buffer) {
  const source = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: 36_000_000,
  })
    .rotate()
    .resize({
      width: 3000,
      height: 3000,
      fit: "inside",
      withoutEnlargement: true,
    });
  const [pngResult, webpResult] = await Promise.all([
    source
      .clone()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true }),
    source
      .clone()
      .webp({ quality: 82, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true }),
  ]);
  const keepPng = pngResult.data.length <= webpResult.data.length;
  const selected = keepPng ? pngResult : webpResult;
  return {
    bytes: selected.data,
    width: selected.info.width,
    height: selected.info.height,
    format: keepPng ? ("png" as const) : ("webp" as const),
    mimeType: keepPng ? ("image/png" as const) : ("image/webp" as const),
    hasAlpha: true,
    metadataStripped: true as const,
    checksumSha256: sha256(selected.data),
  };
}

async function processMedia(input: {
  sourceDirectory: string;
  outputDirectory: string;
  storage: StorageInventory;
  references: Set<string>;
  allowApprovedInputExceptions: boolean;
}): Promise<PlannedMedia[]> {
  const clubId = deterministicUuid("onzio:club:rose-city-futbol-club");
  const result: PlannedMedia[] = [];
  for (const bucket of [...input.storage.buckets].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    for (const object of [...bucket.objects].sort((left, right) =>
      left.path.localeCompare(right.path),
    )) {
      const sourceFile = resolve(input.sourceDirectory, object.localRelativePath);
      const key = `${bucket.name}\u001f${object.path}`;
      const referenced = input.references.has(key);
      const header = await firstBytes(sourceFile);
      const format = detectedFormat(header);
      const kind = intendedKind(bucket.name, object.path);
      const id = deterministicUuid(
        `onzio:rose-city:media:${bucket.name}:${object.path}:${object.checksumSha256}`,
      );
      const base: PlannedMedia = {
        id,
        sourceBucket: bucket.name,
        sourcePath: object.path,
        sourceChecksumSha256: object.checksumSha256,
        referenced,
        classification: "unsupported",
        surface: surfaceForBucket(bucket.name),
        importable: false,
        destinationPath: null,
        outputRelativePath: null,
        outputMimeType: null,
        outputByteSize: null,
        outputWidth: null,
        outputHeight: null,
        outputChecksumSha256: null,
        reason: null,
        migrationException: null,
      };

      if (object.byteSize === 0 && object.path.endsWith(".emptyFolderPlaceholder")) {
        result.push({
          ...base,
          classification: "placeholder",
          reason: "empty Storage folder placeholder; retained in inventory only",
        });
        continue;
      }
      if (format === "mp4") {
        result.push({
          ...base,
          classification: "video",
          reason: "Phase 4 media_assets supports photographs and graphics only",
        });
        continue;
      }
      if (format === "gif") {
        result.push({
          ...base,
          classification: "gif",
          reason: "Phase 4 rejects GIF input",
        });
        continue;
      }
      if (!format || !["jpeg", "png", "webp"].includes(format) || !kind) {
        result.push({
          ...base,
          classification: format ? "unsupported" : "corrupt",
          reason: format
            ? "no approved Phase 4 bucket classification"
            : "unrecognized or corrupt media signature",
        });
        continue;
      }
      if (
        (format === "jpeg" && !["jpg", "jpeg"].includes(extension(object.path))) ||
        (format !== "jpeg" && extension(object.path) !== format)
      ) {
        result.push({
          ...base,
          classification: "corrupt",
          reason: "file extension does not match the verified media signature",
        });
        continue;
      }
      if (kind === "graphic" && format === "jpeg") {
        result.push({
          ...base,
          classification: "unsupported",
          reason: "Phase 4 graphics accept PNG or WebP only",
        });
        continue;
      }
      const bytes = await readFile(sourceFile);
      let metadata: { width?: number; height?: number };
      try {
        metadata = await sharp(bytes, {
          failOn: "warning",
          // Decode metadata under the broader raw-input ceiling first, then
          // enforce the stricter per-kind width/height rules explicitly.
          limitInputPixels: 36_000_000,
        }).metadata();
      } catch {
        result.push({
          ...base,
          classification: "corrupt",
          reason: "Sharp could not decode the source image",
        });
        continue;
      }
      if (!metadata.width || !metadata.height) {
        result.push({
          ...base,
          classification: "corrupt",
          reason: "source image has no decoded dimensions",
        });
        continue;
      }
      const maximumDimension = kind === "photograph" ? 6000 : 3000;
      const maximumBytes =
        kind === "photograph" ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
      const exceedsBytes = object.byteSize > maximumBytes;
      const exceedsDimensions =
        metadata.width > maximumDimension ||
        metadata.height > maximumDimension;
      const approvedException =
        input.allowApprovedInputExceptions &&
        referenced &&
        (exceedsBytes || exceedsDimensions);
      if ((exceedsBytes || exceedsDimensions) && !approvedException) {
        result.push({
          ...base,
          classification: "unsupported",
          reason: exceedsBytes
            ? `${kind} exceeds the Phase 4 raw byte limit`
            : `${kind} exceeds the Phase 4 decoded dimension limit`,
        });
        continue;
      }

      let normalized;
      try {
        if (approvedException) {
          normalized =
            kind === "photograph"
              ? await normalizeApprovedMigrationPhoto(bytes)
              : await normalizeApprovedMigrationGraphic(bytes);
        } else {
          normalized =
            kind === "photograph"
              ? await normalizePhoto(bytes)
              : await normalizeGraphic(bytes);
        }
      } catch {
        result.push({
          ...base,
          classification: "corrupt",
          reason: "offline normalization failed",
        });
        continue;
      }
      const outputRelativePath = `media/${id}.${normalized.format}`;
      const destinationPath = `${clubId}/${base.surface}/${id}.${normalized.format}`;
      await writePrivateFile(
        resolve(input.outputDirectory, outputRelativePath),
        normalized.bytes,
      );
      result.push({
        ...base,
        classification: kind,
        importable: true,
        destinationPath,
        outputRelativePath,
        outputMimeType: normalized.mimeType,
        outputByteSize: normalized.bytes.length,
        outputWidth: normalized.width,
        outputHeight: normalized.height,
        outputChecksumSha256: normalized.checksumSha256,
        reason: null,
        migrationException: approvedException
          ? {
              code: "approved-rehearsal-input-limit-pre-normalization",
              approvedAt: "2026-07-27",
              scope: "referenced-asset-only",
            }
          : null,
      });
    }
  }
  return result;
}

async function outputChecksums(outputDirectory: string): Promise<void> {
  async function files(directory: string): Promise<string[]> {
    const result: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await files(path)));
      if (entry.isFile()) result.push(relative(outputDirectory, path));
    }
    return result;
  }
  const entries = [];
  for (const file of (await files(outputDirectory))
    .filter((item) => item !== "checksums.sha256")
    .sort()) {
    entries.push(`${await hashFile(resolve(outputDirectory, file))}  ${file}`);
  }
  await writePrivateFile(
    resolve(outputDirectory, "checksums.sha256"),
    `${entries.join("\n")}\n`,
  );
}

async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const positional = process.argv
    .slice(2)
    .filter((argument) => !argument.startsWith("--"));
  if (positional.length !== 2) {
    throw new Error(usage());
  }
  const unknownFlags = process.argv
    .slice(2)
    .filter(
      (argument) =>
        argument.startsWith("--") && argument !== APPROVED_INPUT_EXCEPTION_FLAG,
    );
  if (unknownFlags.length > 0) {
    throw new Error(`Unknown planner flag: ${unknownFlags.join(", ")}`);
  }
  const allowApprovedInputExceptions = process.argv.includes(
    APPROVED_INPUT_EXCEPTION_FLAG,
  );
  const sourceDirectory = await assertPrivateDirectory(positional[0], "source");
  const outputDirectory = await assertPrivateDirectory(positional[1], "output");
  if (
    isInside(sourceDirectory, outputDirectory) ||
    isInside(outputDirectory, sourceDirectory)
  ) {
    throw new Error("Source and output directories must not contain one another.");
  }

  const source = await verifySourcePackage(sourceDirectory);
  const references = referencedObjects(source.tables);
  const media = await processMedia({
    sourceDirectory,
    outputDirectory,
    storage: source.storage,
    references,
    allowApprovedInputExceptions,
  });
  if (
    references.size !== media.filter((item) => item.referenced).length
  ) {
    throw new Error("At least one database-to-Storage reference is missing.");
  }
  const inventorySummary = {
    sourceObjectCount: media.length,
    referencedObjectCount: media.filter((item) => item.referenced).length,
    unreferencedObjectCount: media.filter((item) => !item.referenced).length,
    importableObjectCount: media.filter((item) => item.importable).length,
    excludedObjectCount: media.filter((item) => !item.importable).length,
    referencedExcludedObjectCount: media.filter(
      (item) => item.referenced && !item.importable,
    ).length,
    approvedInputExceptionCount: media.filter(
      (item) => item.migrationException !== null,
    ).length,
  };
  if (
    allowApprovedInputExceptions &&
    inventorySummary.approvedInputExceptionCount !== 16
  ) {
    throw new Error(
      "Approved rehearsal exception requires exactly 16 referenced byte/dimension-limit assets.",
    );
  }
  await writeJson(resolve(outputDirectory, "media-inventory.json"), {
    formatVersion: 1,
    kind: "rose-city-media-inventory",
    sourceDigest: source.sourceDigest,
    summary: inventorySummary,
    media,
  });

  let plan;
  try {
    plan = buildRoseCityImportPlan({
      sourceTables: source.tables,
      media,
      sourceIdentityCount: source.authIdentityCount,
      verifiedSourceDigest: source.sourceDigest,
    });
  } catch (error) {
    await writeJson(resolve(outputDirectory, "BLOCKED.json"), {
      formatVersion: 1,
      kind: "rose-city-import-plan-blocker",
      sourceDigest: source.sourceDigest,
      status: "blocked",
      code: "REFERENCED_MEDIA_OUTSIDE_PHASE_4_LIMITS",
      message: error instanceof Error ? error.message : String(error),
      summary: inventorySummary,
    });
    await outputChecksums(outputDirectory);
    throw error;
  }
  const serialized = JSON.stringify(plan);
  if (
    /(?:eyJ[a-zA-Z0-9_-]{20,}\.|sb_secret_|sk_live_|service_role)/.test(
      serialized,
    )
  ) {
    throw new Error("Credential-shaped content was detected in the import plan.");
  }

  await writeJson(resolve(outputDirectory, "import-plan.json"), plan);
  await outputChecksums(outputDirectory);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "complete",
        sourceTables: ROSE_CITY_SOURCE_TABLES.length,
        sourceRows: plan.reconciliation.sourceRowCount,
        sourceObjects: plan.mediaSummary.sourceObjectCount,
        referencedObjects: plan.mediaSummary.referencedObjectCount,
        importableObjects: plan.mediaSummary.importableObjectCount,
        excludedObjects: plan.mediaSummary.excludedObjectCount,
        referencedExcludedObjects:
          plan.mediaSummary.referencedExcludedObjectCount,
        sourceDigest: plan.sourceDigest,
        planDigest: plan.planDigest,
        outputDirectory,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
