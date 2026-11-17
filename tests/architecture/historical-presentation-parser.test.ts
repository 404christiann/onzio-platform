import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ALLOWED = new Set(["scripts/pilot-site-coordination.ts"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("historical presentation validation boundary", () => {
  it("limits the historical parser to stored-event readers", () => {
    const usages = ["app", "components", "lib", "scripts"]
      .flatMap((directory) => sourceFiles(resolve(ROOT, directory)))
      .filter((path) => readFileSync(path, "utf8").includes("parseHistoricalPresentationDocument"))
      .map((path) => relative(ROOT, path).replaceAll("\\", "/"));
    expect(usages.sort()).toEqual([...ALLOWED].sort());
  });
});
