import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

// Regression tests for scripts/codex-loop-verify.sh. That script decides what the merge bot
// treats as evidence, so each failure mode found while building it is pinned here. They run
// against a throwaway git repository with stubbed npm and npx; nothing touches the real repo.

const scripts = join(import.meta.dirname);
const stubNpm = `#!/bin/sh
# stub: "npm run <script> [-- args]" or "npm test [-- args]". Behavior comes from files in the
# working copy (.stub/<script>.exit, .out, .json), so the base commit and the change differ.
case "$1" in test) script=suite ;; *) script="$2" ;; esac
echo "HOME=$HOME"
echo "ARGS=$*"
echo "SUPABASE_LOCAL=\${SUPABASE_LOCAL-unset}"
d=.stub
[ -f "$d/$script.out" ] && cat "$d/$script.out"
for a in "$@"; do case "$a" in --outputFile=*) out="\${a#--outputFile=}";; esac; done
if [ -n "$out" ]; then
  if [ -f "$d/$script.json" ]; then cp "$d/$script.json" "$out"
  else echo '{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"numPendingTests":0,"testResults":[]}' > "$out"; fi
fi
code=0; [ -f "$d/$script.exit" ] && code=$(cat "$d/$script.exit")
exit "$code"
`;
// The types stub also fails if an ignored leftover folder is present in its working directory,
// the way tsc picked up stale copies of old code under test-results/.
// "npx vitest run <files>" has its own stub files (.stub/vitest.*): the baseline and rerun use it.
const stubNpx = stubNpm.replace('case "$1" in test) script=suite ;; *) script="$2" ;; esac', 'case "$1" in vitest) script=vitest ;; *) script=types; [ -d test-results ] && { echo "error: leaked test-results"; exit 1; } ;; esac');

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t.invalid", ...args], { encoding: "utf8", stdio: "pipe" });
const root = mkdtempSync(join(tmpdir(), "codex-verify-test-"));
// The fake local API must run in its own process: spawnSync blocks this one, so a server here
// could never answer the script's reachability check.
let apiProcess; let apiUrl;
before(async () => {
  apiProcess = spawn(process.execPath, ["-e", `require("http").createServer((q,r)=>{r.statusCode=401;r.end("{}")}).listen(0,"127.0.0.1",function(){console.log(this.address().port)})`], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise(resolve => apiProcess.stdout.once("data", d => resolve(String(d).trim())));
  apiUrl = `http://127.0.0.1:${port}`;
});
after(() => { apiProcess?.kill(); rmSync(root, { recursive: true, force: true }); });

let counter = 0;
function put(dir, path, text) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
// base: files committed on main. change: files committed on top (the change under test).
function fixture({ base = {}, change = {} } = {}) {
  const dir = join(root, `fx${++counter}`); mkdirSync(dir);
  const origin = join(dir, "origin.git"); const repo = join(dir, "repo"); const bin = join(dir, "bin");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, repo], { stdio: "pipe" });
  mkdirSync(bin);
  put(bin, "npm", stubNpm); put(bin, "npx", stubNpx); chmodSync(join(bin, "npm"), 0o755); chmodSync(join(bin, "npx"), 0o755);
  put(repo, ".gitignore", "node_modules/\ntest-results/\n");
  for (const f of ["codex-loop-verify.sh", "with-local-db-lock.sh"]) { mkdirSync(join(repo, "scripts"), { recursive: true }); copyFileSync(join(scripts, f), join(repo, "scripts", f)); chmodSync(join(repo, "scripts", f), 0o755); }
  for (const [p, t] of Object.entries(base)) put(repo, p, t);
  put(repo, "README.txt", "base\n");
  for (const tool of ["vitest", "tsc"]) { put(repo, `node_modules/.bin/${tool}`, "#!/bin/sh\nexit 0\n"); chmodSync(join(repo, "node_modules/.bin", tool), 0o755); }
  git(repo, "checkout", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "base"); git(repo, "push", "-q", "origin", "main");
  git(repo, "checkout", "-q", "-b", "change");
  for (const [p, t] of Object.entries(change)) put(repo, p, t);
  put(repo, "CHANGE.md", "change\n");
  git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "change");
  const envFile = join(dir, "env.test");
  return { dir, repo, bin, worktrees: join(dir, "wt"), envFile, writeEnv: text => writeFileSync(envFile, text) };
}
function run(fx, { checks, env = {}, up = true } = {}) {
  fx.writeEnv(`SUPABASE_TEST_URL=${up ? apiUrl : "http://127.0.0.1:1"}\nSUPABASE_TEST_ANON_KEY=anon\nSUPABASE_TEST_SERVICE_ROLE_KEY=svc\n${env.extraEnvFile ?? ""}`);
  const out = join(fx.dir, "out.md");
  const e = { ...process.env, PATH: `${fx.bin}:${process.env.PATH}`, CODEX_LOOP_ENV_FILE: fx.envFile, CODEX_LOOP_WORKTREES: fx.worktrees };
  delete e.CODEX_LOOP_TRUST_DIFF; delete e.CODEX_LOOP_VERIFY;
  if (checks) e.CODEX_LOOP_VERIFY = checks;
  if (env.allowStale) e.CODEX_LOOP_ALLOW_STALE_SCRIPT = "1";
  const result = spawnSync("bash", [join(fx.repo, "scripts/codex-loop-verify.sh"), fx.repo, out], { env: e, encoding: "utf8", timeout: 120000 });
  return { status: result.status, stderr: result.stderr, md: existsSync(out) ? readFileSync(out, "utf8") : "" };
}
const row = (md, label) => md.split("\n").find(l => l.startsWith(`| ${label} |`)) ?? "";

test("everything passing exits 0 and reports every check as PASS", () => {
  const r = run(fixture());
  assert.equal(r.status, 0, r.stderr);
  for (const label of ["Types", "Lint", "Contracts", "Architecture", "Build", "Database", "Whole suite"]) assert.match(row(r.md, label), /\| PASS \|/, label);
});

test("a failure the base commit does not have is a NEW FAILURE and exits 1", () => {
  const r = run(fixture({ change: { ".stub/lint.exit": "1", ".stub/lint.out": "error: unused thing\n" } }), { checks: "lint" });
  assert.equal(r.status, 1);
  assert.match(row(r.md, "Lint"), /NEW FAILURES/);
});

test("a failure identical to the base commit is SAME AS BASELINE and does not block", () => {
  const stub = { ".stub/lint.exit": "1", ".stub/lint.out": "error: existing problem\n" };
  const r = run(fixture({ base: stub }), { checks: "lint" });
  assert.equal(r.status, 0, r.md);
  assert.match(row(r.md, "Lint"), /SAME AS BASELINE/);
});

test("a stale link on the cached baseline copy is refreshed (regression: baseline could not start, every failure looked new)", () => {
  const stub = { ".stub/lint.exit": "1", ".stub/lint.out": "error: existing problem\n" };
  const fx = fixture({ base: stub });
  assert.equal(run(fx, { checks: "lint" }).status, 0);
  const cached = join(fx.worktrees, `.baseline-${git(fx.repo, "rev-parse", "--short=7", "main").trim()}`);
  rmSync(join(cached, "node_modules"), { force: true });
  symlinkSync(join(fx.dir, "does-not-exist"), join(cached, "node_modules"));
  const second = run(fx, { checks: "lint" });
  assert.equal(second.status, 0, second.md);
  assert.match(row(second.md, "Lint"), /SAME AS BASELINE/);
});

test("a failure with nothing identifiable counts against the change, never as same-as-baseline", () => {
  const r = run(fixture({ base: { ".stub/lint.exit": "1" }, change: {} }), { checks: "lint" });
  assert.equal(r.status, 1);
  assert.match(row(r.md, "Lint"), /NEW FAILURES/);
});

test("ignored files in the working directory do not affect the result: the change is checked on a clean checkout (regression: stale test-results/ failed types and build)", () => {
  const fx = fixture();
  put(fx.repo, "test-results/pilot/old/copy.ts", "// stale generated copy of old code\n");
  const r = run(fx, { checks: "types" });
  assert.equal(r.status, 0, r.md);
  assert.match(row(r.md, "Types"), /\| PASS \|/);
});

test("the clean checkout used for verification is removed afterwards", () => {
  const fx = fixture();
  assert.equal(run(fx, { checks: "types" }).status, 0);
  const leftovers = existsSync(fx.worktrees) ? execFileSync("ls", ["-A", fx.worktrees], { encoding: "utf8" }).split("\n").filter(n => n.startsWith(".verify-")) : [];
  assert.deepEqual(leftovers, []);
});

test("middleware.ts is app code, not check configuration, and is not refused", () => {
  const r = run(fixture({ change: { "middleware.ts": "export {};\n" } }), { checks: "types" });
  assert.equal(r.status, 0, r.md);
});

test("a copy of the script that differs from origin/main is refused (regression: a stale coordinator worktree reported failures a newer script had fixed)", () => {
  const fx = fixture();
  const other = join(fx.dir, "other");
  execFileSync("git", ["clone", "-q", join(fx.dir, "origin.git"), other], { stdio: "pipe" });
  writeFileSync(join(other, "scripts/codex-loop-verify.sh"), `${readFileSync(join(other, "scripts/codex-loop-verify.sh"), "utf8")}\n# newer logic\n`);
  git(other, "commit", "-qam", "newer verify script"); git(other, "push", "-q", "origin", "main");
  const stale = run(fx, { checks: "types" });
  assert.equal(stale.status, 64);
  assert.match(stale.stderr, /differs from origin\/main/);
  const forced = run(fx, { checks: "types", env: { allowStale: true } });
  assert.equal(forced.status, 0, forced.stderr);
});

test("a worktree without installed dependencies is refused, not reported as passing", () => {
  const fx = fixture();
  rmSync(join(fx.repo, "node_modules"), { recursive: true });
  assert.equal(run(fx).status, 64);
});

for (const file of ["package.json", ".eslintrc.json", "tailwind.config.ts", "playwright.e2e.config.ts", "scripts/other.sh", ".github/workflows/x.yml", "supabase/config.toml"]) {
  test(`a change to ${file} is refused (exit 3)`, () => {
    const r = run(fixture({ change: { [file]: "x\n" } }));
    assert.equal(r.status, 3);
    assert.match(r.md, /Not run\./);
    assert.ok(r.md.includes(file), r.md);
  });
}

test("root-level markdown does not trigger a refusal", () => {
  assert.equal(run(fixture({ change: { "HANDOFF.md": "note\n" } }), { checks: "types" }).status, 0);
});

test("a database-touching change with a subset that omits the database suites exits 1 (regression: subset exited 0)", () => {
  const r = run(fixture({ change: { "lib/data.ts": "export const x = 1;\n" } }), { checks: "types,lint,contracts" });
  assert.equal(r.status, 1, r.md);
  assert.match(row(r.md, "Database"), /NOT RUN \| not selected/);
  assert.match(row(r.md, "Whole suite"), /NOT RUN \| not selected/);
  assert.match(r.md, /Not verified/);
});

test("a database-touching change with local Supabase down exits 1", () => {
  const r = run(fixture({ change: { "supabase/migrations/1_x.sql": "select 1;\n" } }), { up: false });
  assert.equal(r.status, 1);
  assert.match(row(r.md, "Database"), /NOT RUN \| local Supabase is not running/);
});

test("a change that cannot affect the database may leave the suites NOT RUN and still exit 0", () => {
  const r = run(fixture({ change: { "docs/x.md": "x\n" } }), { up: false });
  assert.equal(r.status, 0, r.md);
  assert.match(row(r.md, "Database"), /NOT RUN/);
});

test("any hosted Supabase URL in the env file is refused, not just SUPABASE_TEST_URL (regression: only one variable was checked)", () => {
  for (const extra of ["NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co\n", "SUPABASE_URL=https://abc.supabase.co\n", "SUPABASE_DB_URL=postgresql://postgres:pw@db.abc.supabase.co:5432/postgres\n"]) {
    const r = run(fixture({ change: { "lib/data.ts": "export const x = 1;\n" } }), { env: { extraEnvFile: extra } });
    assert.equal(r.status, 1, extra);
    assert.match(row(r.md, "Build"), /NOT RUN \| refusing: not a loopback address/, extra);
    assert.match(row(r.md, "Database"), /NOT RUN \| refusing/, extra);
  }
});

test("loopback database URLs are accepted", () => {
  const r = run(fixture(), { env: { extraEnvFile: "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n" } });
  assert.equal(r.status, 0, r.md);
});

test("checks run with an empty temporary HOME, not the real one (regression: credentials on disk were reachable)", () => {
  const fx = fixture();
  const r = run(fx, { checks: "lint" });
  assert.equal(r.status, 0);
  const logs = /logs kept in (\S+)/.exec(r.stderr)[1];
  const log = readFileSync(join(logs, "lint.log"), "utf8");
  assert.match(log, /HOME=\//);
  assert.ok(!log.includes(`HOME=${process.env.HOME}\n`), log);
});

test("the runner refuses CODEX_LOOP_VERIFY=off for a database-touching change but allows it for docs", () => {
  const runner = readFileSync(join(scripts, "codex-loop.sh"), "utf8");
  const fn = /^verify_gate\(\) \{[\s\S]*?^\}/m.exec(runner)[0];
  for (const [file, expected] of [["lib/data.ts", 1], ["docs/x.md", 0]]) {
    const fx = fixture({ change: { [file]: "x\n" } });
    const out = join(fx.dir, "gate.md");
    const result = spawnSync("bash", ["-c", `${fn}\nverify_gate "$1" "$2"`, "_", fx.repo, out], { env: { ...process.env, CODEX_LOOP_VERIFY: "off" }, encoding: "utf8" });
    assert.equal(result.status, expected, `${file}: ${result.stderr}`);
    assert.match(readFileSync(out, "utf8"), expected ? /Not skipped/ : /Skipped on request/);
  }
});

// ---- speed: the baseline reruns only failing files; the whole suite does not repeat other rows
const failing = file => JSON.stringify({ numTotalTests: 1, numPassedTests: 0, numFailedTests: 1, numPendingTests: 0, testResults: [{ name: `/x/${file}`, status: "failed", assertionResults: [{ status: "failed", fullName: "rule" }] }] });
const logOf = (r, name, which = 1) => readFileSync(join(r.stderr.match(/logs kept in (\S+) \(baseline: (\S+)\)/)[which], `${name}.log`), "utf8");

test("the baseline reruns only the files that failed on the change, not the whole check", () => {
  const f = failing("tests/architecture/a.test.ts");
  const fx = fixture({ base: { ".stub/vitest.json": f, ".stub/vitest.exit": "1" }, change: { ".stub/test:architecture.json": f, ".stub/test:architecture.exit": "1" } });
  const r = run(fx, { checks: "architecture" });
  assert.equal(r.status, 0, r.md);
  assert.match(row(r.md, "Architecture"), /SAME AS BASELINE/);
  const base = logOf(r, "architecture", 2);
  assert.match(base, /ARGS=vitest run tests\/architecture\/a\.test\.ts /);
  assert.doesNotMatch(base, /test:architecture/);
});

test("a failure that is new in a file and fails again on rerun is a NEW FAILURE", () => {
  const f = failing("tests/architecture/a.test.ts");
  const fx = fixture({ change: { ".stub/test:architecture.json": f, ".stub/test:architecture.exit": "1", ".stub/vitest.json": f, ".stub/vitest.exit": "1" } });
  const r = run(fx, { checks: "architecture" });
  assert.equal(r.status, 1, r.md);
  assert.match(row(r.md, "Architecture"), /NEW FAILURES/);
});

test("database failures are rerun and compared with SUPABASE_LOCAL=1, as npm run test:db runs them", () => {
  const f = failing("tests/database/a.test.ts");
  const fx = fixture({ base: { ".stub/vitest.json": f, ".stub/vitest.exit": "1" }, change: { ".stub/test:db.json": f, ".stub/test:db.exit": "1", "lib/x.ts": "export {};\n" } });
  const r = run(fx, { checks: "db,suite" });
  assert.match(logOf(r, "db", 2), /SUPABASE_LOCAL=1/);
});

test("the whole suite does not run the contracts, architecture and database files again, and the row says so", () => {
  const r = run(fixture());
  assert.equal(r.status, 0, r.stderr);
  const suite = logOf(r, "suite");
  for (const dir of ["contracts", "architecture", "database"]) assert.ok(suite.includes(`--exclude=tests/${dir}/**`), dir);
  assert.match(row(r.md, "Whole suite"), /ran as their own rows above and are not run twice/);
});

test("the whole suite on its own runs everything", () => {
  const r = run(fixture(), { checks: "suite" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(logOf(r, "suite"), /--exclude/);
  assert.doesNotMatch(row(r.md, "Whole suite"), /not run twice/);
});
