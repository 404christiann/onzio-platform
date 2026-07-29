import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Rose City export evidence", () => {
  it("requires a timestamp paired with explicit final-freeze authorization", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/export-rose-city-rehearsal.mjs"),
      "utf8",
    );

    expect(source).toContain(
      '"--authorize-final-freeze=rose-city-production"',
    );
    expect(source).toContain(
      "finalFreeze !== Boolean(freezeAtArgument)",
    );
    expect(source).toContain('"rose-city-final-frozen-export"');
    expect(source).toContain("finalCutoverArtifact: finalFreeze");
  });

  it("allows only attested final exports through reconciliation and planning", () => {
    const reconciler = readFileSync(
      resolve(process.cwd(), "scripts/reconcile-rose-city-export.mjs"),
      "utf8",
    );
    const planner = readFileSync(
      resolve(process.cwd(), "scripts/plan-rose-city-import.ts"),
      "utf8",
    );

    for (const source of [reconciler, planner]) {
      expect(source).toContain('"rose-city-final-frozen-export"');
      expect(source).toContain("finalCutoverArtifact");
      expect(source).toContain("frozenSource");
      expect(source).toContain("startedAt");
    }
  });
});
