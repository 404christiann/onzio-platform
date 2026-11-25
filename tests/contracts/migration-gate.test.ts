import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyMigrationChanges, compareMigrations, EDITED_MESSAGE, NOT_APPLIED_MESSAGE } from "../../scripts/check-migrations-applied.mjs";

const root = process.cwd();
const SCRIPT = resolve(root, "scripts/check-migrations-applied.mjs");
const WORKFLOW_FILE = readFileSync(resolve(root, ".github/workflows/migration-gate.yml"), "utf8");
// The header comment names the forbidden commands; only the steps must be free of them.
const WORKFLOW = WORKFLOW_FILE.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");

const listed = (...rows: [string, string][]) => ({ migrations: rows.map(([local, remote]) => ({ local, remote, time: "" })) });

function runGate(list: unknown, args: string[] = []) {
  try {
    const input = typeof list === "string" ? list : JSON.stringify(list);
    const stdout = execFileSync("node", [SCRIPT, ...args], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
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

  it("passes a pull request that changes no migration, without needing secrets", () => {
    expect(classifyMigrationChanges("")).toEqual({ added: [], edited: [] });
    const result = runGate("", ["--changes"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("changed=false");
  });

  it("marks a pull request that adds a migration for the production check", () => {
    const diff = "A\0supabase/migrations/20261126000000_new.sql\0";
    expect(classifyMigrationChanges(diff)).toEqual({ added: ["supabase/migrations/20261126000000_new.sql"], edited: [] });
    const result = runGate(diff, ["--changes"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("changed=true");
  });

  it("fails a pull request that edits or deletes an existing migration, even one production already has", () => {
    for (const diff of ["M\0supabase/migrations/20261124120000_hero_video_poster.sql\0", "D\0supabase/migrations/20261124120000_hero_video_poster.sql\0"]) {
      expect(classifyMigrationChanges(diff).edited).toHaveLength(1);
      const result = runGate(diff, ["--changes"]);
      expect(result.status, diff).toBe(1);
      expect(result.stderr?.trim()).toBe(EDITED_MESSAGE);
    }
  });

  it("reads a non-ASCII migration name as itself, from real git -z output", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-gate-"));
    try {
      const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
      git("init", "-q");
      git("-c", "user.email=t@example.test", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base");
      mkdirSync(join(repo, "supabase/migrations"), { recursive: true });
      const name = "supabase/migrations/20261126000000_caf\u00e9.sql";
      writeFileSync(join(repo, name), "select 1;\n");
      git("add", ".");
      git("-c", "user.email=t@example.test", "-c", "user.name=t", "commit", "-q", "-m", "add");
      // Without -z git quotes the name ("supabase/migrations/...caf\303\251.sql"), which a line parser misses.
      expect(git("diff", "--no-renames", "--name-status", "HEAD~1", "HEAD", "--", "supabase/migrations")).toContain('"supabase/');
      const diff = git("diff", "--no-renames", "--name-status", "-z", "HEAD~1", "HEAD", "--", "supabase/migrations");
      expect(classifyMigrationChanges(diff)).toEqual({ added: [name], edited: [] });
      expect(runGate(diff, ["--changes"]).stdout).toContain("changed=true");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("fails on diff output it cannot parse instead of reading it as no change", () => {
    for (const bad of [
      'A\t"supabase/migrations/20261126000000_caf\\303\\251.sql"\n',
      "A\0supabase/migrations/one.sql\0M\0",
      'A\0"supabase/migrations/quoted.sql"\0',
      "R100\0supabase/migrations/old.sql\0",
      "A\0docs/not-a-migration.md\0",
    ]) {
      expect(() => classifyMigrationChanges(bad), JSON.stringify(bad)).toThrow(/unparseable/);
      expect(runGate(bad, ["--changes"]).status, JSON.stringify(bad)).toBe(1);
    }
  });

  it("fails, not passes, when a migration is added and a production secret is missing", () => {
    const step = WORKFLOW.slice(WORKFLOW.indexOf("- name: Require production secrets"), WORKFLOW.indexOf("- name: Set up Supabase CLI"));
    expect(step).toContain("if: steps.changes.outputs.changed == 'true'");
    for (const secret of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF"]) {
      expect(step).toContain(`[ -n "$${secret}" ] || missing=`);
    }
    expect(step).toContain("exit 1");
    expect(WORKFLOW).not.toContain("present=false");
    // Every production step depends on the migration diff, never on whether secrets happen to be set.
    expect(WORKFLOW.match(/if: steps\.changes\.outputs\.changed == 'true'/g)).toHaveLength(4);
  });

  it("runs on every pull request so it can be required, and skips only fork pull requests", () => {
    expect(WORKFLOW).not.toMatch(/paths:/);
    expect(WORKFLOW).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });
});
