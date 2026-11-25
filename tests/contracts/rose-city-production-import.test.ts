import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasOpsFile, readOpsFile } from "../helpers/ops-repo";

// The retired Rose City production importer and its frozen cutover evidence (production ref, owner emails) live in
// the private onzio-ops repo at the same paths. The checks on them run when an onzio-ops checkout is present and in
// onzio-ops CI (`npm run test:ops`); the loopback guard on the local replay importer stays here.

const EVIDENCE = "lib/migration/rose-city-production-import.ts";
const IMPORTER = "scripts/import-rose-city-production.ts";
const present = hasOpsFile(EVIDENCE) && hasOpsFile(IMPORTER);

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe.skipIf(!present)("retired Rose City production import (onzio-ops)", () => {
  const evidence = present ? readOpsFile(EVIDENCE) : "";
  const importer = present ? readOpsFile(IMPORTER) : "";

  it("preserves frozen cutover inputs only as historical evidence", () => {
    expect(evidence).toContain("export const ROSE_CITY_HISTORICAL_CUTOVER = Object.freeze({");
    expect(evidence).toContain('completedAt: "2026-07-27T23:00:09.000Z"');
    expect(evidence).toContain("importedSourceRows: 209,");
    expect(evidence).toContain("importedMediaAssets: 515,");
    expect(evidence).toContain("export const ROSE_CITY_CURRENT_PRODUCTION_STATE = Object.freeze({");
  });

  it("fails every attempted production replay before reading inputs", () => {
    expect(evidence).toMatch(/export function assertRoseCityProductionImportRetired\(\): never \{\s*throw new Error\(\s*"Rose City production import is permanently retired/);
    expect(importer).toContain('from "../lib/migration/rose-city-production-import"');
    expect(importer.trim().endsWith("assertRoseCityProductionImportRetired();")).toBe(true);
  });

  it("retains no production mutation implementation", () => {
    for (const forbidden of ["createClient", "service_role", "db query", ".upload(", ".remove(", "spawn("]) {
      expect(importer).not.toContain(forbidden);
    }
  });
});

describe("retired Rose City production import", () => {
  it("keeps the replay importer limited to loopback Supabase", () => {
    const localImporter = source("scripts/import-rose-city-local.ts");

    expect(localImporter).toContain("assertLoopbackUrl");
    expect(localImporter).toContain(
      '["127.0.0.1", "localhost", "::1", "[::1]"]',
    );
    expect(localImporter).toContain("must use a loopback host");
  });

  it("no longer ships the production importer or its evidence in this repo", () => {
    for (const path of [EVIDENCE, IMPORTER]) {
      expect(() => source(path), path).toThrow(/ENOENT/);
    }
  });
});
