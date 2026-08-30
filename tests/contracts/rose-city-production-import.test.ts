import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertRoseCityProductionImportRetired,
  ROSE_CITY_CURRENT_PRODUCTION_STATE,
  ROSE_CITY_HISTORICAL_CUTOVER,
} from "@/lib/migration/rose-city-production-import";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("retired Rose City production import", () => {
  it("preserves frozen cutover inputs only as historical evidence", () => {
    expect(ROSE_CITY_HISTORICAL_CUTOVER).toMatchObject({
      productionProjectRef: "ioalthwsdrlzrubomrow",
      importedSourceRows: 209,
      importedMediaAssets: 515,
      domainsAtCutover: [
        "www.rosecityfutbolclub.com",
        "rosecityfutbolclub.com",
      ],
      memberEmailsAtCutover: [
        "christianjavieralcala@gmail.com",
        "info@rosecityfutbolclub.com",
      ],
    });
  });

  it("records the current hostname and sole active owner separately", () => {
    expect(ROSE_CITY_CURRENT_PRODUCTION_STATE).toEqual({
      recordedAt: "2026-08-06",
      primaryHostname: "onzio-platform.vercel.app",
      retiredHostnames: [
        "www.rosecityfutbolclub.com",
        "rosecityfutbolclub.com",
        "onzio-rcfc.vercel.app",
      ],
      activeOwnerEmails: ["christianjavieralcala@gmail.com"],
      removedIdentityEmails: ["info@rosecityfutbolclub.com"],
    });
  });

  it("fails every attempted production replay before reading inputs", () => {
    expect(() => assertRoseCityProductionImportRetired()).toThrow(
      /permanently retired/,
    );
  });

  it("retains no production mutation implementation", () => {
    const importer = source("scripts/import-rose-city-production.ts");

    expect(importer).toContain("assertRoseCityProductionImportRetired");
    expect(importer).not.toContain("createClient");
    expect(importer).not.toContain("service_role");
    expect(importer).not.toContain("db query");
    expect(importer).not.toContain(".upload(");
    expect(importer).not.toContain(".remove(");
    expect(importer).not.toContain("spawn(");
  });

  it("keeps the replay importer limited to loopback Supabase", () => {
    const localImporter = source("scripts/import-rose-city-local.ts");

    expect(localImporter).toContain("assertLoopbackUrl");
    expect(localImporter).toContain(
      '["127.0.0.1", "localhost", "::1", "[::1]"]',
    );
    expect(localImporter).toContain("must use a loopback host");
  });
});
