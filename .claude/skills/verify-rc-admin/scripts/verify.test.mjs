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

// ---------------------------------------------------------------------------------------------
// RC-ADMIN-01b: gates 3 and 4 on routes with no editable field, and on either Save button.
const report = join(here, "report.mjs");
const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");

function runDir(files) {
  const out = mkdtempSync(join(tmpdir(), "rcv-report-"));
  mkdirSync(join(out, "results"));
  const put = (name, value) => writeFileSync(join(out, "results", `${name}.json`), JSON.stringify(value));
  put("run", { package: "TEST", route: "/admin/x", touched: "", head: "0".repeat(40), base: "origin/main", baseSha: "1".repeat(40) });
  put("scope", { failures: [], warnings: [], changedFiles: 1, appFiles: ["a.ts"], selectorDebtIdentical: true });
  put("repo-gates", { typecheck: true, unit: true, unitSummary: "ok", architecture: true, architectureSummary: "ok", selectorDebtIdentical: true });
  put("payload-chick-fil-a", { gate: 2, editor: "chick-fil-a", touched: false, identical: true, head: [], base: [] });
  put("diverse-city", { gate: 6, sharedFix: false, pages: [{ path: "/admin", status: 200, h1: "Dashboard", errors: [], sameAsMain: true }] });
  for (const [name, value] of Object.entries(files)) put(name, value);
  const result = spawnSync("node", [report, out], { encoding: "utf8" });
  return { result, summary: JSON.parse(readFileSync(join(out, "summary.json"), "utf8")), html: readFileSync(join(out, "report.html"), "utf8") };
}
const STEPS = Object.fromEntries(["clean", "dirty", "saving", "saved", "retry", "conflict", "discard"].map((k) => [k, "pass"]));
const na = (extra = {}) => ({ applicable: false, reason: "/admin/x has no editable field and no Save button", ...extra });
const visualNa = Object.fromEntries([[390, "light"], [390, "dark"], [1440, "light"], [1440, "dark"]].map(([w, s]) => [`visual-x-${w}-${s}`, na({ gate: 4, width: w, scheme: s })]));
const visualRan = (overrides = {}) => Object.fromEntries([[390, "light"], [390, "dark"], [1440, "light"], [1440, "dark"]].map(([w, s]) => [`visual-x-${w}-${s}`,
  { gate: 4, width: w, scheme: s, applicable: true, cls: 0, overflow: 0, formViolations: [], dialogViolations: [], newFormViolations: [], newDialogViolations: [], ...overrides }]));

test("01b: a route with no editable field reports gates 3 and 4 as not applicable and the run passes", () => {
  const { result, summary, html } = runDir({
    "save-behaviour": na({ gate: 3, steps: {} }),
    ...visualNa, "reduced-motion": na({ gate: 4, samples: [] }),
  });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /gate 3 N\/A\s+Save behaviour: not applicable: /);
  assert.match(result.stdout, /gate 4 N\/A\s+Visual.*: not applicable: /);
  assert.match(result.stdout, /verify-rc-admin: PASS/);
  for (const id of [3, 4]) {
    const g = summary.gates.find((x) => x.id === id);
    assert.equal(g.na, true); assert.equal(g.pass, true);
  }
  assert.equal(summary.gates.filter((g) => g.na).length, 2, "only gates 3 and 4 may be not applicable");
  assert.match(html, /class="na">N\/A/);
});

test("01b: not applicable never hides a failing gate that did apply", () => {
  const na34 = { "save-behaviour": na({ gate: 3, steps: {} }), ...visualNa, "reduced-motion": na({ gate: 4, samples: [] }) };
  const payloadFail = runDir({ ...na34, "payload-chick-fil-a": { gate: 2, editor: "chick-fil-a", touched: false, identical: false, head: [], base: [] } });
  assert.equal(payloadFail.result.status, 1);
  assert.match(payloadFail.result.stdout, /gate 2 FAIL/);
  const dcFail = runDir({ ...na34, "diverse-city": { gate: 6, sharedFix: false, pages: [{ path: "/admin", status: 200, h1: "x", errors: [], sameAsMain: false }] } });
  assert.equal(dcFail.result.status, 1);
  assert.match(dcFail.result.stdout, /gate 6 FAIL/);
});

test("01b: gate 3 and 4 results that are missing, partial or failing still fail", () => {
  assert.equal(runDir({ ...visualNa, "reduced-motion": na({ gate: 4, samples: [] }) }).result.status, 1, "gate 3 not run is a failure, not N/A");
  assert.equal(runDir({ "save-behaviour": na({ gate: 3, steps: {} }) }).result.status, 1, "gate 4 not run is a failure, not N/A");
  const mixed = { ...visualRan(), "visual-x-1440-dark": na({ gate: 4, width: 1440, scheme: "dark" }) };
  const partial = runDir({ "save-behaviour": { gate: 3, applicable: true, steps: STEPS }, ...mixed, "reduced-motion": { gate: 4, applicable: true, samples: [] } });
  assert.equal(partial.result.status, 1, "one sample that did not run among samples that did is a failure");
  const failStep = runDir({ "save-behaviour": { gate: 3, applicable: true, steps: { ...STEPS, conflict: "FAIL: x" } }, ...visualRan(), "reduced-motion": { gate: 4, applicable: true, samples: [] } });
  assert.equal(failStep.result.status, 1);
  assert.match(failStep.result.stdout, /gate 3 FAIL/);
});

test("01b: an editor that ran passes unchanged, with either Save button", () => {
  for (const saveButton of ["admin", "page"]) {
    const { result, summary } = runDir({ "save-behaviour": { gate: 3, applicable: true, saveButton, steps: STEPS }, ...visualRan(), "reduced-motion": { gate: 4, applicable: true, samples: [] } });
    assert.equal(result.status, 0, result.stdout);
    assert.ok(summary.gates.every((g) => !g.na));
    assert.match(result.stdout, new RegExp(`gate 3 PASS\\s+Save behaviour: ${saveButton} Save button: clean: pass`));
  }
});

test("01b: a phone Save bar problem fails gate 4", () => {
  const bar = { kind: "page", problems: ["Save is not in a fixed bottom bar under 768px"] };
  const { result } = runDir({ "save-behaviour": { gate: 3, applicable: true, saveButton: "page", steps: STEPS }, ...{ ...visualRan(), "visual-x-390-light": { ...visualRan()["visual-x-390-light"], saveBar: bar } }, "reduced-motion": { gate: 4, applicable: true, samples: [] } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /gate 4 FAIL.*phone Save bar \(light\): Save is not in a fixed bottom bar/);
});

test("01b: the spec finds the Save button by either marker and never selects only the old one", () => {
  assert.match(spec, /const SAVE_BUTTON = "\[data-admin-save-button\], \[data-page-save-button\]"/);
  assert.match(spec, /const SAVE_CHECK = "\[data-admin-save-check\], \[data-page-save-check\]"/);
  const outsideConstants = spec.split("\n").filter((line) => line.includes("data-admin-save-button") && !line.trimStart().startsWith("//") && !line.includes("const SAVE_BUTTON"));
  assert.deepEqual(outsideConstants, [], "gates 2, 3 and 4 must go through saveLocator/SAVE_BUTTON");
  assert.doesNotMatch(spec, /data-admin-save-check\]"\)\)/, "the check mark is found through SAVE_CHECK");
});

test("01b: the spec maps the page Save states and checks the phone bottom bar", () => {
  for (const state of ["retry", "conflict"]) assert.match(spec, new RegExp(`kind === "page"\\) await expect\\(button\\)\\.toHaveAttribute\\("data-state", "${state}"\\)`));
  assert.match(spec, /position === "fixed"/, "the bar must be fixed under 768px");
  assert.match(spec, /checkSaveBar\(page\)/);
  assert.match(spec, /Reload saved pages\?\|Discard changes/, "the discard control is the editor's Reload saved page or PageFrame's Discard changes");
});

test("01b: not applicable needs a route outside EDITORS with no field and no Save button, and records it for gates 3 and 4", () => {
  assert.match(spec, /if \(editorFor\(ROUTE\)\) return \{ applicable: true \}/, "a listed editor is always applicable");
  assert.match(spec, /if \(await saveLocator\(page\)\.count\(\)\) return \{ applicable: true \}/, "a Save button without a field is a broken editor, not N/A");
  assert.equal([...spec.matchAll(/record\([^\n]*applicable: false/g)].length, 3, "save behaviour, visual and reduced-motion each record it");
});
