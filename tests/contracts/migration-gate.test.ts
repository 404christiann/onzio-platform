import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareMigrations, NOT_APPLIED_MESSAGE } from "../../scripts/check-migrations-applied.mjs";

const root = process.cwd();
const SCRIPT = resolve(root, "scripts/check-migrations-applied.mjs");
const WORKFLOW_FILE = readFileSync(resolve(root, ".github/workflows/migration-gate.yml"), "utf8");
// The header comment names the forbidden commands; only the steps must be free of them.
const WORKFLOW = WORKFLOW_FILE.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");

const listed = (...rows: [string, string][]) => ({ migrations: rows.map(([local, remote]) => ({ local, remote, time: "" })) });

function runGate(list: unknown) {
  try {
    const stdout = execFileSync("node", [SCRIPT], { input: JSON.stringify(list), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (error) {
    const failed = error as { status: number; stdout: string; stderr: string };
    return { status: failed.status, stdout: failed.stdout, stderr: failed.stderr };
  }
}

describe("production migration gate", () => {
  it("passes when every branch migration is applied to production", () => {
    const list = listed(["20261124120000", "20261124120000"], ["20261125000000", "20261125000000"]);
    expect(compareMigrations(list)).toEqual({ localOnly: [], remoteOnly: [] });
    expect(runGate(list).status).toBe(0);
  });

  it("fails with the exact message when the branch adds a migration production does not have", () => {
    const list = listed(["20261124120000", "20261124120000"], ["20261126000000", ""]);
    expect(compareMigrations(list).localOnly).toEqual(["20261126000000"]);
    const result = runGate(list);
    expect(result.status).toBe(1);
    expect(result.stderr?.trim()).toBe("apply to prod first (needs christian's go), then re-run");
    expect(NOT_APPLIED_MESSAGE).toBe("apply to prod first (needs christian's go), then re-run");
  });

  it("only warns when production has a migration the branch lacks", () => {
    const list = listed(["20261124120000", "20261124120000"], ["", "20261127000000"]);
    expect(compareMigrations(list)).toEqual({ localOnly: [], remoteOnly: ["20261127000000"] });
    const result = runGate(list);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("::warning");
  });

  it("refuses output that is not a migration list", () => {
    expect(() => compareMigrations({ message: "error" })).toThrow(/no migrations array/);
  });

  it("the workflow is read-only and keeps the production ref in a secret", () => {
    for (const write of ["db push", "migration repair", "migration up", "db reset", "db query", "migration squash"]) {
      expect(WORKFLOW).not.toContain(write);
    }
    expect(WORKFLOW).toContain('--project-ref "$SUPABASE_PROJECT_REF"');
    expect(WORKFLOW).toMatch(/supabase migration list --linked\b/);
    expect(WORKFLOW).not.toMatch(/--project-ref [a-z]{20}\b/);
  });

  it("skips fork pull requests and runs without secrets instead of failing", () => {
    expect(WORKFLOW).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(WORKFLOW).toContain('echo "present=false" >> "$GITHUB_OUTPUT"');
  });
});
