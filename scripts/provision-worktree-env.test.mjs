import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// The script copies env files into worker worktrees, where Next.js loads .env.local by
// itself. These tests pin that it refuses anything that is not local and never prints values.

const script = join(import.meta.dirname, "provision-worktree-env.sh");
const root = mkdtempSync(join(tmpdir(), "provision-env-test-"));
after(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const SECRET = "s3cr3t-value-that-must-not-print";
function setup(local, test_) {
  const dir = join(root, `c${++n}`); const src = join(dir, "src"); const wt = join(dir, "wt");
  mkdirSync(src, { recursive: true }); mkdirSync(wt);
  if (local !== null) writeFileSync(join(src, ".env.local"), local);
  if (test_ !== null) writeFileSync(join(src, ".env.test"), test_);
  return { src, wt };
}
const run = ({ src, wt }) => spawnSync("bash", [script, wt], { env: { ...process.env, CODEX_LOOP_ENV_DIR: src }, encoding: "utf8" });
const good = `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SERVICE_ROLE_KEY=${SECRET}\nONZIO_ENVIRONMENT=local\n`;
const goodTest = `SUPABASE_TEST_URL=http://localhost:54321\nSUPABASE_TEST_ANON_KEY=${SECRET}\n`;

test("loopback files are copied with mode 600 and no value is printed", () => {
  const c = setup(good, goodTest); const r = run(c);
  assert.equal(r.status, 0, r.stderr);
  for (const f of [".env.local", ".env.test"]) assert.equal(statSync(join(c.wt, f)).mode & 0o777, 0o600);
  assert.ok(!(r.stdout + r.stderr).includes(SECRET));
});

test("a hosted Supabase URL in .env.local is refused and nothing is copied", () => {
  const c = setup(`NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co\nK=${SECRET}\n`, goodTest); const r = run(c);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /NEXT_PUBLIC_SUPABASE_URL is not a loopback address/);
  assert.ok(!existsSync(join(c.wt, ".env.local")) && !existsSync(join(c.wt, ".env.test")));
  assert.ok(!(r.stdout + r.stderr).includes(SECRET));
});

test("a loopback-looking host that is only a prefix of a real one is refused", () => {
  const c = setup(`NEXT_PUBLIC_SUPABASE_URL=http://localhost.evil.example\n`, goodTest);
  assert.equal(run(c).status, 1);
});

test("a live Stripe key anywhere is refused, whatever the variable is called", () => {
  for (const key of ["sk_live_abc", "rk_live_abc", "pk_live_abc"]) {
    const c = setup(`${good}SOMETHING_ELSE=${key}\n`, goodTest);
    assert.equal(run(c).status, 1, key);
    assert.ok(!existsSync(join(c.wt, ".env.local")));
  }
});

test("a hosted project hidden in a variable the loopback check does not name is still refused", () => {
  const c = setup(`${good}WEBHOOK_TARGET=https://abcdefghijkl.supabase.co/functions/v1/x\n`, goodTest);
  assert.equal(run(c).status, 1);
});

test("a hosted URL in .env.test is refused too", () => {
  const c = setup(good, `SUPABASE_TEST_URL=https://abcdefghijkl.supabase.co\n`);
  assert.equal(run(c).status, 1);
  assert.ok(!existsSync(join(c.wt, ".env.local")));
});

test("a missing source file copies nothing and fails", () => {
  const c = setup(good, null); const r = run(c);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(join(c.wt, ".env.local")));
});

test("a comment that only mentions a live key prefix is not a live key", () => {
  const c = setup(good, `# Stripe test-mode values only. Tests reject sk_live_ values.\n${goodTest}`);
  assert.equal(run(c).status, 0);
});
