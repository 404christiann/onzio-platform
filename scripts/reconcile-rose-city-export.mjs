import { createHash } from "node:crypto";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const EXPECTED_HOST = "nsgtkwqkbyxkiwrhzsje.supabase.co";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseChecksumLedger(contents) {
  return new Map(
    contents
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([0-9a-f]{64})  (.+)$/);
        if (!match) throw new Error(`Invalid checksum line: ${line}`);
        return [match[2], match[1]];
      }),
  );
}

function rowKey(row, columns) {
  return columns.map((column) => String(row[column] ?? "")).join("\u001f");
}

function duplicateKeys(rows, columns) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const key = rowKey(row, columns);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function relationshipCheck({
  name,
  sourceRows,
  sourceColumn,
  targetRows,
  targetColumn = "id",
}) {
  const targets = new Set(
    targetRows.map((row) => String(row[targetColumn] ?? "")),
  );
  const missing = sourceRows
    .filter((row) => !targets.has(String(row[sourceColumn] ?? "")))
    .map((row) => ({
      sourceId: row.id ?? null,
      missingValue: row[sourceColumn] ?? null,
    }));
  return {
    name,
    checkedCount: sourceRows.length,
    status: missing.length === 0 ? "passed" : "failed",
    missing,
  };
}

function visitStrings(value, callback) {
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

function parseStorageReference(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== EXPECTED_HOST) return null;

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
    transformed: transformedIndex >= 0,
  };
}

async function main() {
  const exportDirectory = process.argv[2] ? resolve(process.argv[2]) : null;
  if (!exportDirectory || process.argv.length !== 3) {
    throw new Error(
      "Usage: node scripts/reconcile-rose-city-export.mjs /absolute/private/export-directory",
    );
  }

  const manifest = await readJson(resolve(exportDirectory, "manifest.json"));
  const recognizedKind = [
    "rose-city-local-rehearsal-export",
    "rose-city-final-frozen-export",
  ].includes(manifest.kind);
  const validFrozenEvidence =
    manifest.kind !== "rose-city-final-frozen-export" ||
    (manifest.frozenSource === true &&
      manifest.finalCutoverArtifact === true &&
      typeof manifest.freeze?.startedAt === "string");
  if (
    !recognizedKind ||
    !validFrozenEvidence ||
    manifest.sourceHost !== EXPECTED_HOST
  ) {
    throw new Error("Refusing to reconcile an unexpected export package.");
  }

  const ledgerPath = resolve(exportDirectory, "checksums.sha256");
  const ledger = parseChecksumLedger(await readFile(ledgerPath, "utf8"));
  const checksumFailures = [];
  for (const [file, expected] of ledger) {
    const bytes = await readFile(resolve(exportDirectory, file));
    const actual = sha256(bytes);
    if (actual !== expected) checksumFailures.push({ file, expected, actual });
  }

  const tables = {};
  for (const table of manifest.database.tables) {
    if (table.status !== "exported") continue;
    tables[table.table] = await readJson(
      resolve(exportDirectory, "database", `${table.table}.json`),
    );
  }

  const primaryKeys = {
    about_page_content: ["id"],
    behind_the_rose_section: ["id"],
    club_logo_page_content: ["id"],
    goalkeeper_match_stats: ["id"],
    goalkeeper_season_stats: ["player_id", "season_id"],
    homepage_slideshow_photos: ["id"],
    homepage_slideshow_settings: ["id"],
    league_standings: ["id"],
    league_standings_settings: ["id"],
    matches: ["id"],
    player_match_stats: ["id"],
    player_photos: ["id"],
    player_season_stats: ["player_id", "season_id"],
    players: ["id"],
    seasons: ["id"],
    shop_carousel_photos: ["id"],
    shop_kit_photos: ["id"],
    shop_kit_section: ["id"],
    shop_purchase_details: ["id"],
    site_branding: ["id"],
    site_social_links: ["id"],
    site_sponsor_logos: ["id"],
    staff: ["id"],
    stripe_subscription: ["id"],
  };
  const duplicateTableKeys = Object.entries(primaryKeys)
    .map(([table, columns]) => ({
      table,
      columns,
      duplicates: duplicateKeys(tables[table] ?? [], columns),
    }))
    .filter((result) => result.duplicates.length > 0);

  const relationships = [
    relationshipCheck({
      name: "matches.season_id -> seasons.id",
      sourceRows: tables.matches ?? [],
      sourceColumn: "season_id",
      targetRows: tables.seasons ?? [],
    }),
    relationshipCheck({
      name: "player_match_stats.player_id -> players.id",
      sourceRows: tables.player_match_stats ?? [],
      sourceColumn: "player_id",
      targetRows: tables.players ?? [],
    }),
    relationshipCheck({
      name: "player_match_stats.match_id -> matches.id",
      sourceRows: tables.player_match_stats ?? [],
      sourceColumn: "match_id",
      targetRows: tables.matches ?? [],
    }),
    relationshipCheck({
      name: "goalkeeper_match_stats.player_id -> players.id",
      sourceRows: tables.goalkeeper_match_stats ?? [],
      sourceColumn: "player_id",
      targetRows: tables.players ?? [],
    }),
    relationshipCheck({
      name: "goalkeeper_match_stats.match_id -> matches.id",
      sourceRows: tables.goalkeeper_match_stats ?? [],
      sourceColumn: "match_id",
      targetRows: tables.matches ?? [],
    }),
    relationshipCheck({
      name: "player_season_stats.player_id -> players.id",
      sourceRows: tables.player_season_stats ?? [],
      sourceColumn: "player_id",
      targetRows: tables.players ?? [],
    }),
    relationshipCheck({
      name: "player_season_stats.season_id -> seasons.id",
      sourceRows: tables.player_season_stats ?? [],
      sourceColumn: "season_id",
      targetRows: tables.seasons ?? [],
    }),
    relationshipCheck({
      name: "goalkeeper_season_stats.player_id -> players.id",
      sourceRows: tables.goalkeeper_season_stats ?? [],
      sourceColumn: "player_id",
      targetRows: tables.players ?? [],
    }),
    relationshipCheck({
      name: "goalkeeper_season_stats.season_id -> seasons.id",
      sourceRows: tables.goalkeeper_season_stats ?? [],
      sourceColumn: "season_id",
      targetRows: tables.seasons ?? [],
    }),
    relationshipCheck({
      name: "player_photos.player_id -> players.id",
      sourceRows: tables.player_photos ?? [],
      sourceColumn: "player_id",
      targetRows: tables.players ?? [],
    }),
  ];

  const storage = await readJson(
    resolve(exportDirectory, "storage", "inventory.json"),
  );
  const storageObjects = new Map();
  const storageArtifactFailures = [];
  for (const bucket of storage.buckets) {
    for (const object of bucket.objects) {
      const key = `${bucket.name}\u001f${object.path}`;
      storageObjects.set(key, object);
      const ledgerChecksum = ledger.get(object.localRelativePath);
      const localStats = await stat(
        resolve(exportDirectory, object.localRelativePath),
      );
      if (
        ledgerChecksum !== object.checksumSha256 ||
        localStats.size !== object.byteSize
      ) {
        storageArtifactFailures.push({
          bucket: bucket.name,
          path: object.path,
          checksumMatches: ledgerChecksum === object.checksumSha256,
          sizeMatches: localStats.size === object.byteSize,
        });
      }
    }
  }

  const references = [];
  for (const [table, rows] of Object.entries(tables)) {
    rows.forEach((row, rowIndex) => {
      visitStrings(row, (value) => {
        const parsed = parseStorageReference(value);
        if (parsed) references.push({ table, rowIndex, ...parsed });
      });
    });
  }
  const missingStorageReferences = references.filter(
    (reference) =>
      !storageObjects.has(`${reference.bucket}\u001f${reference.path}`),
  );
  const transformedSourceReferences = references.filter(
    (reference) => reference.transformed,
  );

  const failures = {
    checksumFailures,
    storageArtifactFailures,
    duplicateTableKeys,
    relationshipFailures: relationships.filter(
      (relationship) => relationship.status !== "passed",
    ),
    missingStorageReferences,
  };
  const passed = Object.values(failures).every((items) => items.length === 0);
  const report = {
    formatVersion: 1,
    kind: "rose-city-export-reconciliation",
    reconciledAt: new Date().toISOString(),
    status: passed ? "passed" : "failed",
    sourceHost: EXPECTED_HOST,
    checksumLedger: {
      checkedFileCount: ledger.size,
      failureCount: checksumFailures.length,
    },
    database: {
      tableCount: Object.keys(tables).length,
      rowCount: Object.values(tables).reduce(
        (total, rows) => total + rows.length,
        0,
      ),
      duplicatePrimaryKeyTableCount: duplicateTableKeys.length,
      relationships,
    },
    storage: {
      bucketCount: storage.bucketCount,
      objectCount: storage.objectCount,
      totalBytes: storage.totalBytes,
      verifiedArtifactCount: storageObjects.size,
      artifactFailureCount: storageArtifactFailures.length,
      databaseReferenceCount: references.length,
      missingDatabaseReferenceCount: missingStorageReferences.length,
      sourceRuntimeTransformationReferenceCount:
        transformedSourceReferences.length,
    },
    failures,
  };

  const reportRelativePath = "reconciliation.json";
  const reportContents = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(resolve(exportDirectory, reportRelativePath), reportContents, {
    mode: 0o600,
  });
  await chmod(resolve(exportDirectory, reportRelativePath), 0o600);
  ledger.set(reportRelativePath, sha256(reportContents));
  await writeFile(
    ledgerPath,
    `${[...ledger.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, digest]) => `${digest}  ${file}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
  await chmod(ledgerPath, 0o600);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: report.status,
        checksumFiles: report.checksumLedger.checkedFileCount,
        databaseTables: report.database.tableCount,
        databaseRows: report.database.rowCount,
        relationships: report.database.relationships.length,
        storageObjects: report.storage.objectCount,
        storageBytes: report.storage.totalBytes,
        databaseStorageReferences: report.storage.databaseReferenceCount,
        missingStorageReferences:
          report.storage.missingDatabaseReferenceCount,
        sourceRuntimeTransformationReferences:
          report.storage.sourceRuntimeTransformationReferenceCount,
      },
      null,
      2,
    )}\n`,
  );
  if (!passed) process.exitCode = 2;
}

await main();
