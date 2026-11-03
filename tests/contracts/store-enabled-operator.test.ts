import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function listFilesRecursively(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...listFilesRecursively(path));
    else files.push(path);
  }
  return files;
}

describe("store_enabled backfill safety", () => {
  it("E1's migration unconditionally backfills every existing club to store_enabled = true", () => {
    const migration = read(
      "supabase/migrations/20260812120200_club_store_enabled.sql",
    );
    expect(migration).toContain(
      "alter table onzio.clubs\n  add column store_enabled boolean not null default false;",
    );
    // The unconditional backfill (no WHERE clause) is what proves no
    // pre-existing club silently loses its store when this column lands.
    expect(migration).toMatch(/^update onzio\.clubs set store_enabled = true;$/m);
  });
});

describe("operator script: scripts/set-club-store-enabled.ts", () => {
  it("is dry-run by default and requires --execute to write", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain("execute: flags.has(\"--execute\")");
    expect(source).toContain("if (!execute) {");
    expect(source).toMatch(/Dry run only[\s\S]*no write performed/);
  });

  it("guards non-loopback targets with a --confirm-project=<ref> refusal, mirroring set-diverse-city-live-price.ts", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain("LOOPBACK_HOSTS");
    expect(source).toContain("isLoopback");
    expect(source).toContain("--confirm-project=");
    expect(source).toMatch(/Refusing non-local write without --confirm-project=/);
  });

  it("parses club slug plus --enable/--disable and refuses when both or neither are given", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain('flags.has("--enable")');
    expect(source).toContain('flags.has("--disable")');
    expect(source).toContain("Pass exactly one of --enable or --disable");
  });

  it("updates onzio.clubs.store_enabled via the service-role client and reconciles the write", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain(".schema(\"onzio\")");
    expect(source).toContain('.update({ store_enabled: enabled })');
    expect(source).toContain("Reconciliation failed: store_enabled did not persist as expected");
  });

  it("is never imported or referenced from any app/ route file (standalone CLI tool only)", () => {
    const appFiles = listFilesRecursively(resolve(process.cwd(), "app")).filter(
      (path) => /\.(tsx?|jsx?)$/.test(path),
    );
    for (const file of appFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/set-club-store-enabled/);
    }
  });
});
