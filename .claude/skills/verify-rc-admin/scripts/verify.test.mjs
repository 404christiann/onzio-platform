// node --test .claude/skills/verify-rc-admin/scripts/verify.test.mjs
// Hermetic: temp git repos and stub binaries only; never touches the shared stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEnvText } from "./check-env-target.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const verify = join(here, "verify.sh");

// A repo whose origin/main is its first commit, plus stubs for every tool that reaches a
// database or server. Each stub appends its name and arguments to calls.log.
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "rcv-test-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  const calls = join(root, "calls.log");
  mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(bin);
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  writeFileSync(join(repo, "supabase", "migrations", "20260101000000_base.sql"), "create table onzio.t (id int);\n");
  writeFileSync(join(repo, "app.ts"), "export const a = 1;\n");
  mkdirSync(join(repo, "tests", "architecture"), { recursive: true });
  writeFileSync(join(repo, "tests", "architecture", "cinematic-2-selector-debt.json"), "{}\n"); // gate 5 reads it
  git("add", "-A"); git("commit", "-qm", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  for (const tool of ["supabase", "docker", "npx", "npm", "curl", "psql", "lsof"]) {
    const path = join(bin, tool);
    writeFileSync(path, `#!/bin/sh\necho "${tool} $*" >> "${calls}"\nexit 1\n`);
    chmodSync(path, 0o755);
  }
  // The lock script is the door to every db action; a stub records any attempt to open it.
  const lock = join(repo, "scripts", "with-local-db-lock.sh");
  writeFileSync(lock, `#!/bin/sh\necho "with-local-db-lock $*" >> "${calls}"\nexit 1\n`);
  chmodSync(lock, 0o755);
  const run = () => spawnSync("bash", [verify, "run", "--worktree", repo, "--route", "/admin/stadium", "--package", "TEST"], {
    encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const called = () => (existsSync(calls) ? readFileSync(calls, "utf8") : "");
  return { repo, run, called };
}

test("fix 1: a scope failure exits non-zero before the doctor, the lock or any db reset", () => {
  const box = sandbox();
  writeFileSync(join(box.repo, "supabase", "migrations", "20260202000000_new.sql"), "alter table onzio.t add b int;\n");
  const result = box.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /gate 1 \(scope\) failed; stopped before any database action/);
  assert.equal(box.called(), "", `no db, server or lock tool may run, got:\n${box.called()}`);
});

test("fix 1 control: an in-scope change gets past gate 1 and reaches the doctor", () => {
  const box = sandbox();
  writeFileSync(join(box.repo, "app.ts"), "export const a = 2;\n");
  box.run();
  assert.match(box.called(), /^supabase --version/m, "with a clean scope the run proceeds to the doctor (so the stubs are live)");
  assert.doesNotMatch(box.called(), /db reset|with-local-db-lock/, "the doctor fails in the sandbox, so nothing reaches the database");
});

const local = "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SERVICE_ROLE_KEY=x\nONZIO_ENVIRONMENT=production\n";

test("fix 2: the env target check accepts only the shared local stack", () => {
  assert.deepEqual(checkEnvText(local, ".env.local"), []);
  assert.deepEqual(checkEnvText(local.replace("127.0.0.1", "localhost"), ".env.local"), []);
  assert.deepEqual(checkEnvText("SUPABASE_TEST_URL=http://127.0.0.1:54321\nSUPABASE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n", ".env.test"), []);
});

test("fix 2: production, hosted, rehearsal-stack, wrong-port and missing targets are refused", () => {
  const refused = (text, file = ".env.local") => checkEnvText(text, file).join("; ");
  assert.match(refused("NEXT_PUBLIC_SUPABASE_URL=https://ioalthwsdrlzrubomrow.supabase.co\n"), /production project ioalthwsdrlzrubomrow/);
  assert.match(refused(`${local}SUPABASE_DB_URL=postgresql://postgres.ioalthwsdrlzrubomrow:pw@aws-0.pooler.supabase.com:6543/postgres\n`), /production project/);
  assert.match(refused("NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\n"), /hosted Supabase/);
  assert.match(refused("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\n"), /rehearsal stack \(port 55321\)/);
  assert.match(refused(`${local}SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres\n`), /rehearsal stack \(port 55322\)/);
  assert.match(refused("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3000\n"), /port 3000, expected 54321/);
  assert.match(refused("NEXT_PUBLIC_SUPABASE_URL=http://10.0.0.5:54321\n"), /not loopback/);
  assert.match(refused(`${local}SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:54322/postgres?host=db.example.com\n`), /redirects the connection/);
  assert.match(refused("ONZIO_ENVIRONMENT=staging\n"), /NEXT_PUBLIC_SUPABASE_URL is missing/);
  assert.match(refused("SUPABASE_LOCAL=1\n", ".env.test"), /SUPABASE_TEST_URL is missing/);
  // Names the URL pattern does not know: libpq variables and a database URL under any name.
  assert.match(refused(`${local}PGHOST=db.example.com\n`), /PGHOST is not loopback/);
  assert.match(refused(`${local}PGPORT=55322\n`), /PGPORT points at the onzio-rose-city-2027 rehearsal stack/);
  assert.match(refused(`${local}PGPORT=5432\n`), /PGPORT is 5432, expected 54322/);
  assert.match(refused(`${local}ANALYTICS_CONN=postgresql://u:p@10.1.2.3:5432/db\n`), /ANALYTICS_CONN is not loopback/);
  assert.deepEqual(checkEnvText(`${local}PGHOST=127.0.0.1\nPGPORT=54322\nWAREHOUSE=postgres://postgres@localhost:54322/postgres\n`), []);
});

test("fix 2: the doctor refuses a worktree whose .env.local points at production", () => {
  const box = sandbox();
  writeFileSync(join(box.repo, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=https://ioalthwsdrlzrubomrow.supabase.co\n");
  writeFileSync(join(box.repo, ".env.test"), "SUPABASE_TEST_URL=http://127.0.0.1:54321\n");
  const result = spawnSync("bash", [verify, "doctor", "--worktree", box.repo], { encoding: "utf8", env: process.env });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /env-target: FAIL \.env\.local: NEXT_PUBLIC_SUPABASE_URL names the production project/);
  assert.doesNotMatch(result.stdout + result.stderr, /ioalthwsdrlzrubomrow\.supabase\.co/, "values are never printed");
});
