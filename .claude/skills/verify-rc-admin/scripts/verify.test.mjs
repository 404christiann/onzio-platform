// node --test .claude/skills/verify-rc-admin/scripts/verify.test.mjs
// Hermetic: temp git repos and stub binaries only; never touches the shared stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEnvText } from "./check-env-target.mjs";
import { MIN_FREE_GB, diskRoomCheck, baseCacheDir, isStaleHolder, mayKillServer, runTimeoutSeconds, staleCacheDirs, sweepHolders, worktreeKey, writeHolder, holdersDir } from "./holders.mjs";
import { KIT_EDIT_SELECTOR, KIT_ENABLED_FIELD_SELECTOR, chooseOpenPath, firstMarkableIndex, isMarkable, isPhoneWidth, listProblems, retryLockCheck, sectionTryOrder, sheetBarProblems } from "./kit-path.mjs";

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
  assert.equal([...spec.matchAll(/record\([^\n]*applicable: false/g)].length, 4, "gate 3 (a declared lack, then the probe), visual and reduced-motion each record it");
});

// --- RC-ADMIN-01c: kit editors have no text field on the page, so the spec opens them through their Edit control.
const repoRoot = join(here, "..", "..", "..", "..");
const kitFile = (name) => readFileSync(join(repoRoot, "components", "admin", "ui", "editor-kit", name), "utf8");
const specSource = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");

test("01c: a visible kit Edit control selects the kit path over any row; anything else keeps the row path", () => {
  assert.equal(chooseOpenPath("kit"), "kit");
  assert.equal(chooseOpenPath("row"), "row");
  assert.equal(chooseOpenPath("none"), "row", "a timeout falls back to the row, so an old UI behaves as before");
});

test("01c: the retry step reads the form lock from the field on an old UI and from the Edit controls or the reopened dialog on a kit editor", () => {
  assert.equal(retryLockCheck("row", { editControls: 0, editControlsDisabled: 0 }), "field");
  assert.equal(retryLockCheck("row", { editControls: 3, editControlsDisabled: 3 }), "field");
  assert.equal(retryLockCheck("kit", { editControls: 3, editControlsDisabled: 3 }), "edit-controls");
  assert.equal(retryLockCheck("kit", { editControls: 3, editControlsDisabled: 2 }), "reopen-dialog-field", "one live Edit control means the dialog's field must be the locked thing");
  assert.equal(retryLockCheck("kit", { editControls: 0, editControlsDisabled: 0 }), "reopen-dialog-field", "no controls found never counts as locked");
});

test("01c: a part with no text field moves on through the dialog's sections; the opened section goes first", () => {
  assert.deepEqual(sectionTryOrder(4, 2), [2, 0, 1, 3]);
  assert.deepEqual(sectionTryOrder(3, -1), [0, 1, 2], "the phone sheet does not say which section is open");
  assert.deepEqual(sectionTryOrder(3, 9), [0, 1, 2]);
  assert.deepEqual(sectionTryOrder(0, -1), [], "no sections means no field, which the spec reports as a failure, never a guess");
});

test("01c: only editable text counts as the field: never a switch, a crop slider, a number, a hidden, disabled or read-only input, or the inert preview", () => {
  const parts = KIT_ENABLED_FIELD_SELECTOR.split(", ");
  assert.equal(parts.length, 3);
  for (const part of parts) {
    assert.match(part, /:enabled:not\(\[readonly\]\)/);
    assert.match(part, /:not\(\[data-editor-dialog-preview\] \*\)$/);
  }
  assert.ok(parts[0].startsWith("input:not([type])") && parts[1].startsWith("input[type=text]") && parts[2].startsWith("textarea"));
  assert.doesNotMatch(KIT_ENABLED_FIELD_SELECTOR, /range|number|checkbox|switch|file|search/);
});

test("01c: desktop and phone are told apart at the dialog's own breakpoint", () => {
  assert.equal(isPhoneWidth(390), true);
  assert.equal(isPhoneWidth(767), true);
  assert.equal(isPhoneWidth(768), false);
  assert.equal(isPhoneWidth(1440), false);
});

test("01c: a list field edit keeps the item count and Add/Remove agree with the limit line", () => {
  const ok = { items: 3, addDisabled: false, limit: "3 of 8 items.", removeDisabled: [false, false, false] };
  assert.deepEqual(listProblems(ok, { items: 3 }), []);
  assert.match(listProblems(ok, { items: 4 })[0], /changed the item count from 3 to 4/);
  assert.deepEqual(listProblems({ ...ok, items: 8, addDisabled: true, limit: "Maximum of 8 items reached." }, { items: 8 }), []);
  assert.match(listProblems({ ...ok, limit: "Maximum of 3 items reached." }, { items: 3 })[0], /Add is enabled at the maximum/);
  assert.match(listProblems({ ...ok, addDisabled: true }, { items: 3 })[0], /Add is disabled below the maximum/);
  assert.deepEqual(listProblems({ ...ok, removeDisabled: [true, true, true] }, { items: 3 }), [], "all at the minimum is fine");
  assert.match(listProblems({ ...ok, removeDisabled: [true, false, true] }, { items: 3 })[0], /Remove buttons are disabled and others are not/);
});

test("01c: the phone Save bar must not cover the open sheet and must be back on top after Done", () => {
  assert.deepEqual(sheetBarProblems({ openTopIsBar: false, closedBarVisible: true, closedTopIsBar: true }), []);
  assert.deepEqual(sheetBarProblems({ openTopIsBar: true, closedBarVisible: true, closedTopIsBar: true }), ["the Save bar covers the sheet while it is open"]);
  assert.deepEqual(sheetBarProblems({ openTopIsBar: false, closedBarVisible: false, closedTopIsBar: false }), ["the Save bar did not come back after Done"]);
  assert.deepEqual(sheetBarProblems({ openTopIsBar: false, closedBarVisible: true, closedTopIsBar: false }), ["the Save bar did not come back after Done"]);
});

test("01c: the skill's selector is the kit's marker, and the kit puts it on every Edit control it renders", () => {
  assert.equal(KIT_EDIT_SELECTOR, "[data-kit-edit]");
  const marker = kitFile("kitEdit.ts");
  assert.match(marker, /KIT_EDIT_ATTRIBUTE = "data-kit-edit"/);
  assert.match(marker, /KIT_EDIT_SELECTOR = `\[\$\{KIT_EDIT_ATTRIBUTE\}\]`/);
  assert.equal((kitFile("PreviewCards.tsx").match(/\{\.\.\.KIT_EDIT_PROPS\}/g) ?? []).length, 2, "PreviewCards: footer Edit and the preview overlay");
  assert.equal((kitFile("SectionCards.tsx").match(/\{\.\.\.KIT_EDIT_PROPS\}/g) ?? []).length, 1, "SectionCards: its Edit");
  assert.match(kitFile("index.ts"), /KIT_EDIT_ATTRIBUTE, KIT_EDIT_PROPS, KIT_EDIT_SELECTOR/);
  assert.match(kitFile("PreviewCards.tsx"), /data-preview-edit=""/, "existing attributes stay");
});

test("01c: the spec routes every row through the kit-aware opener and closes the dialog before Save, Discard and the gate 2 save", () => {
  assert.match(specSource, /chooseOpenPath\(winner === "row" && await kitEditLocator\(page\)\.isVisible\(\)/);
  assert.match(specSource, /if \(!\(await commitKit\(page\)\)\) await editor\.beforeSave\?\.\(page\);/, "gate 2: Done on a kit editor, the row's beforeSave otherwise");
  assert.match(specSource, /retryLockCheck\(/);
  assert.match(specSource, /sectionTryOrder\(count, active\)/, "the field search walks the dialog's sections");
  assert.match(specSource, /listProblems\(listBefore!/, "list fields are checked in gate 3");
  assert.match(specSource, /sheetBarProblems\(/, "the phone sheet and Save bar are checked in gate 4");
  const retry = specSource.slice(specSource.indexOf('step("retry"'), specSource.indexOf('step("conflict"'));
  assert.match(retry, /expect\(field\)\.toBeDisabled\(\)/, "the lock assertion is still there");
  assert.match(retry, /data-state", "retry"/, "and the retry state is still required for the page Save button");
});

test("01c: a field the test cannot append to (web address, email, phone, slug, path) is skipped", () => {
  assert.equal(isMarkable({ value: "Rose City FC", label: "Club name" }), true);
  assert.equal(isMarkable({ value: "", label: "Headline" }), true);
  assert.equal(isMarkable({ value: "https://forms.gle/x", label: "Tryouts form" }), false, "a URL value");
  assert.equal(isMarkable({ value: "", label: "Tryouts form URL" }), false, "a URL label");
  assert.equal(isMarkable({ value: "/tickets", label: "Button destination" }), false, "a path");
  assert.equal(isMarkable({ value: "RCFC", label: "Describe this image" }), true, "an image description is ordinary text: a failing save of it is the page's bug, not something to route around");
  assert.equal(isMarkable({ value: "a@b.co", label: "Contact email" }), false);
  assert.equal(isMarkable({ value: "", label: "Phone number" }), false);
  assert.equal(firstMarkableIndex([{ value: "https://a.b", label: "Link" }, { value: "Hello", label: "Title" }]), 1);
  assert.equal(firstMarkableIndex([{ value: "https://a.b", label: "Link" }]), -1);
});

// ---------------------------------------------------------------------------------------------
// RC-ADMIN-01d: per-worktree build cache, lock-holder records, stale-holder clearing, lock fd.
test("01d: the base-build cache is keyed by worktree: two worktrees never share a directory, one worktree keeps its own", () => {
  const root = mkdtempSync(join(tmpdir(), "rcv-cache-"));
  const a = join(root, "wt-a"), b = join(root, "wt-b");
  mkdirSync(a); mkdirSync(b);
  const sha = "1aa159ae".repeat(5);
  assert.notEqual(baseCacheDir(a, sha, root), baseCacheDir(b, sha, root));
  assert.equal(baseCacheDir(a, sha, root), baseCacheDir(a, sha, root));
  assert.equal(baseCacheDir(a, sha, root), join(root, worktreeKey(a), `base-${sha}`));
  // The same worktree reached through a symlink is the same worktree.
  symlinkSync(a, join(root, "link-a"));
  assert.equal(worktreeKey(join(root, "link-a")), worktreeKey(a));
});

test("01d: only this worktree's cache for older SHAs is listed for removal", () => {
  const root = mkdtempSync(join(tmpdir(), "rcv-cache-"));
  const a = join(root, "wt-a"), b = join(root, "wt-b");
  mkdirSync(a); mkdirSync(b);
  for (const [wt, sha] of [[a, "old1"], [a, "old2"], [a, "new"], [b, "old1"]]) mkdirSync(baseCacheDir(wt, sha, root), { recursive: true });
  assert.deepEqual(staleCacheDirs(a, "new", root).sort(), [baseCacheDir(a, "old1", root), baseCacheDir(a, "old2", root)]);
  assert.deepEqual(staleCacheDirs(join(root, "no-such-wt"), "new", root), []);
});

const NOW = Date.parse("2026-11-18T12:00:00Z");
const record = (over = {}) => ({ runPid: 4242, runStart: "Wed Nov 18 11:50:00 2026", startedAt: "2026-11-18T11:50:00Z", worktree: "/wt", servers: [{ name: "base", pid: 777, port: 3111 }], ...over });

test("01d: stale-holder detection: dead run pid is stale, too old is stale, live and young is kept", () => {
  const alive = () => "Wed Nov 18 11:50:00 2026";
  assert.equal(isStaleHolder(record(), { now: NOW, startOf: () => null }).stale, true);
  assert.match(isStaleHolder(record(), { now: NOW, startOf: () => null }).reason, /dead/);
  const old = record({ startedAt: "2026-11-18T09:00:00Z" });
  assert.equal(isStaleHolder(old, { now: NOW, startOf: alive }).stale, true);
  assert.match(isStaleHolder(old, { now: NOW, startOf: alive }).reason, /run timeout/);
  assert.equal(isStaleHolder(record(), { now: NOW, startOf: alive }).stale, false);
  // A recycled pid (different start time) is not our run.
  assert.equal(isStaleHolder(record(), { now: NOW, startOf: () => "Thu Nov 19 01:00:00 2026" }).stale, true);
  // The timeout is never below the lock wait a waiter may still be using.
  assert.equal(runTimeoutSeconds({ ONZIO_DB_LOCK_WAIT: "7200" }), 7200);
  assert.equal(runTimeoutSeconds({}), 3600);
});

test("01d: a pid is killed only if it still looks like the recorded server and holds the recorded port", () => {
  const server = { pid: 777, port: 3111 };
  assert.equal(mayKillServer(server, { command: "next-server (v16.0.1)", listeningPids: [777] }).ok, true);
  assert.equal(mayKillServer(server, { command: "node node_modules/next/dist/bin/next start -p 3111", listeningPids: [777] }).ok, true);
  assert.match(mayKillServer(server, { command: "/usr/bin/ssh host", listeningPids: [777] }).reason, /not a next server/);
  assert.match(mayKillServer(server, { command: "next-server (v16)", listeningPids: [999] }).reason, /does not hold port 3111/);
  assert.equal(mayKillServer(server, { command: null, listeningPids: [] }).ok, false);
  assert.equal(mayKillServer({ pid: 1, port: 3111 }, { command: "next-server", listeningPids: [1] }).ok, false);
});

test("01d: sweepHolders kills exactly the recorded, matching pids of stale runs and nothing else", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "rcv-holders-")), "lock.holders");
  writeHolder(dir, record({ runPid: 1001, servers: [{ name: "head", pid: 501, port: 3110 }, { name: "base", pid: 502, port: 3111 }] })); // dead run
  writeHolder(dir, record({ runPid: 1002, servers: [{ name: "base", pid: 600, port: 3111 }] }));                                        // live and young
  const killed = [];
  const log = sweepHolders(dir, {
    now: NOW, timeoutSeconds: 3600,
    startOf: (pid) => (pid === 1002 ? "Wed Nov 18 11:50:00 2026" : null),
    commandOf: (pid) => (pid === 501 ? "next-server (v16)" : "/usr/bin/vim"),   // 502 was recycled into an unrelated process
    listening: (port) => (port === 3110 ? [501] : [502]),
    kill: (pid) => killed.push(pid),
  });
  assert.deepEqual(killed, [501]);
  assert.match(log.join("\n"), /not killing 502 :3111: pid 502 is not a next server/);
  assert.match(log.join("\n"), /run 1002 .* kept/);
  assert.equal(existsSync(join(dir, "1001.json")), false, "the stale record is deleted");
  assert.equal(existsSync(join(dir, "1002.json")), true, "the live record stays");
  assert.equal(holdersDir("/tmp/x.lock"), "/tmp/x.lock.holders");
});

test("01d: locked-run closes the lock's file descriptor for the servers it starts, and keeps it for itself", () => {
  const dir = mkdtempSync(join(tmpdir(), "rcv-fd-"));
  const lockFile = join(dir, "t.lock");
  const wrapper = join(here, "..", "..", "..", "..", "scripts", "with-local-db-lock.sh");
  const fn = readFileSync(join(here, "locked-run.sh"), "utf8").match(/^lock_fds\(\) \{[\s\S]*?^\}$/m)[0];
  const script = `LOCK_FILE=${lockFile}\n${fn}\nmine="$(lock_fds)"\n` +
    `(for fd in $(lock_fds); do eval "exec $fd>&-"; done; sh -c 'lsof -a -p $PPID -d 3-255 -Fn' | grep -c "${lockFile.replace("/var/", "/private/var/")}" ) > "${dir}/child"\n` +
    `echo "$mine" > "${dir}/mine"`;
  const result = spawnSync("bash", [wrapper, "bash", "-c", script], { encoding: "utf8", env: { ...process.env, ONZIO_DB_LOCK_FILE: lockFile, ONZIO_DB_LOCK_WAIT: "5" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, "mine"), "utf8"), /^\d+$/m, "the run itself sees the lock fd");
  assert.equal(readFileSync(join(dir, "child"), "utf8").trim(), "0", "a server subshell with the fd closed does not hold the lock file");
});

test("01d: the disk check refuses a build under 5 GB free and says so", () => {
  const gb = (n) => n * 1024 * 1024; // df -k units
  assert.equal(MIN_FREE_GB, 5);
  assert.equal(diskRoomCheck(gb(5)).ok, true, "exactly 5 GB is enough");
  assert.equal(diskRoomCheck(gb(27)).ok, true);
  const low = diskRoomCheck(gb(4.99));
  assert.equal(low.ok, false);
  assert.match(low.message, /only 5\.0 GB free .* need at least 5 GB.* no build was started/);
  assert.equal(diskRoomCheck(0.5 * gb(1)).ok, false, "the 516 MB case from the 2026-11-18 crash");
  assert.equal(diskRoomCheck(NaN).ok, false, "unreadable free space refuses rather than builds");
  assert.equal(diskRoomCheck(gb(8), 10).ok, false, "the minimum is a parameter");
});

// ---- RC-ADMIN-4-0a: deterministic readiness and settled-state signals --------------------------------------------------
import { BUSY_SELECTOR, describeBusy, isEnvironmentNoise, isSettled, readIsQuiet, savedColourProblems, waitUntilSettled } from "./settle.mjs";

const quiet = (key = "main") => ({ ready: true, busy: 0, running: 0, key });

test("4-0a: a read is quiet only when loaded, with no loading marker and no finite animation running", () => {
  assert.equal(readIsQuiet(quiet()), true);
  assert.equal(readIsQuiet({ ...quiet(), ready: false }), false);
  assert.equal(readIsQuiet({ ...quiet(), busy: 1 }), false, "a skeleton or aria-busy region");
  assert.equal(readIsQuiet({ ...quiet(), running: 1 }), false, "a crossfade still playing");
  assert.equal(readIsQuiet(undefined), false);
});

test("4-0a: settled needs three quiet reads in a row with the same content; the Contact/Shop case (still loading, then content) is not settled early", () => {
  const loading = { ready: true, busy: 2, running: 1, key: "skeleton" };
  assert.equal(isSettled([quiet(), quiet()]), false, "two reads are not enough");
  assert.equal(isSettled([loading, loading, loading]), false);
  assert.equal(isSettled([quiet("skeleton"), quiet("skeleton"), quiet("content")]), false, "content still changing");
  assert.equal(isSettled([loading, quiet("content"), quiet("content")]), false, "the skeleton was gone for only two reads");
  assert.equal(isSettled([loading, quiet("content"), quiet("content"), quiet("content")]), true);
  assert.equal(isSettled([quiet(), quiet(), quiet()], 2), true, "the stable count is a parameter");
});

test("4-0a: waitUntilSettled keeps polling past a slow load instead of giving up after a fixed sleep", async () => {
  let t = 0, i = 0;
  const reads = [
    ...Array(30).fill({ ready: true, busy: 1, running: 0, key: "skeleton" }), // 3 s of skeleton: longer than the old 2 s sleep
    quiet("content"), quiet("content"), quiet("content"),
  ];
  const out = await waitUntilSettled(async () => reads[Math.min(i++, reads.length - 1)], { sleep: async (ms) => { t += ms; }, now: () => t });
  assert.equal(out.settled, true);
  assert.equal(out.reads.length, 33);
  assert.equal(out.reads.at(-1).key, "content");
});

test("4-0a: a page that never finishes loading is reported with the reason, not passed and not hung", async () => {
  let t = 0;
  const stuck = { ready: true, busy: 3, running: 0, key: "skeleton" };
  const out = await waitUntilSettled(async () => stuck, { timeoutMs: 1000, intervalMs: 100, sleep: async (ms) => { t += ms; }, now: () => t });
  assert.equal(out.settled, false);
  assert.equal(out.why, "3 loading markers");
  assert.equal(describeBusy({ ready: false, busy: 1, running: 2, key: "" }), "document not loaded, 1 loading marker, 2 animations running");
  const churn = (() => { let n = 0; return async () => quiet(`v${n++}`); })();
  t = 0;
  assert.equal((await waitUntilSettled(churn, { timeoutMs: 500, sleep: async (ms) => { t += ms; }, now: () => t })).why, "content kept changing");
});

test("4-0a: the loading markers cover the admin's skeletons, busy regions and shimmer", () => {
  for (const marker of ['[aria-busy="true"]', "data-admin-loading-region", "data-admin-skeleton-layer", "data-admin-shimmer", "data-slot=skeleton", 'aria-label^="Loading"']) {
    assert.ok(BUSY_SELECTOR.includes(marker), `BUSY_SELECTOR names ${marker}`);
  }
});

test("4-0a: the saved colour is judged only after the transition ended; a mid-fade sample is a wait, not a verdict", () => {
  const greens = ["rgb(52, 199, 89)", "rgb(48, 209, 88)"];
  assert.deepEqual(savedColourProblems({ state: "saved", colour: "rgb(52, 199, 89)", running: 0 }, greens), []);
  assert.deepEqual(savedColourProblems({ state: "saved", colour: "rgb(48, 209, 88)", running: 0 }, greens), [], "dark-mode green");
  // The 2026-11-19 flake: rgb(52, 199, 90) was the colour mid-transition. It is reported as "still animating", never as a wrong green.
  const mid = savedColourProblems({ state: "saved", colour: "rgb(52, 199, 90)", running: 1 }, greens);
  assert.equal(mid.length, 1);
  assert.match(mid[0], /still animating/);
  // A settled colour that is genuinely wrong still fails.
  assert.match(savedColourProblems({ state: "saved", colour: "rgb(0, 122, 255)", running: 0 }, greens)[0], /settled "saved" colour is rgb\(0, 122, 255\)/);
  assert.match(savedColourProblems({ state: "clean", colour: "rgb(242, 242, 247)", running: 0 }, greens)[0], /left "saved" \(now "clean"\)/);
});

test("4-0a: the spec waits on settle signals and no longer sleeps 2 s before the Diverse City compare or samples the saved colour once", () => {
  const spec = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /from "\.\/scripts\/settle\.mjs"/);
  assert.match(spec, /waitUntilSettled\(/);
  assert.match(spec, /savedColourProblems\(/);
  assert.doesNotMatch(spec, /waitForTimeout\(2_000\)/, "gate 6 no longer sleeps a fixed 2 s");
  assert.doesNotMatch(spec, /expect\(SAVED_GREENS\)\.toContain/, "the saved colour is not sampled once");
  assert.match(spec, /\.finished/, "gate 3 waits for the transitions to finish");
  assert.match(spec, /playState !== "finished"/, "a finished fill-forward animation (the check draw) is not 'still animating'");
  assert.match(spec, /checkVisibility\(/, "a hidden skeleton kept in the DOM (Programs) is not 'still loading'");
});

test("4-0a: only Vercel's analytics script 404 is ignored as local noise, by URL; any other failed resource still counts", () => {
  assert.equal(isEnvironmentNoise("http://diverse-city.localhost:3110/_vercel/insights/script.js"), true);
  assert.equal(isEnvironmentNoise("http://diverse-city.localhost:3111/_vercel/speed-insights/script.js?v=1"), true);
  assert.equal(isEnvironmentNoise("http://diverse-city.localhost:3110/_next/static/chunks/app.js"), false);
  assert.equal(isEnvironmentNoise("http://diverse-city.localhost:3110/images/team.jpg"), false);
  assert.equal(isEnvironmentNoise("http://x/_vercel/insights/script.js.map"), false);
  assert.equal(isEnvironmentNoise(undefined), false);
  const spec = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /isEnvironmentNoise\(m\.location\(\)\.url\)/);
});

test("4-0a: the stack is waited for after a db reset: three answers in a row from auth, storage and rest, and a stack that never answers fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "rcv-stack-"));
  const bin = join(dir, "bin"); mkdirSync(bin);
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub("supabase", 'echo "API_URL=http://stub"; echo "SERVICE_ROLE_KEY=k"');
  stub("sleep", "true");
  // curl fails the first N calls (the containers restarting), then answers; counter in a file
  stub("curl", `n=$(cat "${dir}/n" 2>/dev/null || echo 0); echo $((n+1)) > "${dir}/n"; [ "$n" -ge "$STUB_FAIL_FIRST" ]`);
  const fn = readFileSync(join(here, "locked-run.sh"), "utf8").match(/^stack_ready\(\) \{[\s\S]*?^\}$/m)[0];
  const run = (failFirst, wait) => {
    writeFileSync(join(dir, "n"), "0");
    return spawnSync("bash", ["-c", `RCV_WT=${dir}\n${fn}\nstack_ready; echo "exit=$?"; cat "${dir}/n"`], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_FAIL_FIRST: String(failFirst), RCV_STACK_WAIT: String(wait) } });
  };
  const slow = run(7, 60); // 7 failing curls = three loops lost to the gateway error, then it answers
  assert.match(slow.stdout, /exit=0/, slow.stderr);
  const never = run(1e9, 6);
  assert.match(never.stdout, /exit=1/, "a stack that never answers is a failure, not a pass");
  const src = readFileSync(join(here, "locked-run.sh"), "utf8");
  assert.ok(src.indexOf("stack_ready ||") > src.indexOf("supabase db reset --local") && src.indexOf("stack_ready ||") < src.indexOf('"$RCV_SKILL/scripts/seed-local.sh"'), "the wait sits between the reset and the seed");
});

test("4-0a: a sign-in that gets no code waits out the one-code-per-minute window and retries, at most three times", async () => {
  const { SIGN_IN_MAX_ATTEMPTS, SIGN_IN_CODE_WINDOW_MS, nextSignInWait } = await import("./sign-in-retry.mjs");
  assert.equal(SIGN_IN_MAX_ATTEMPTS, 3);
  assert.deepEqual(nextSignInWait({ attempt: 1, elapsedMs: 31_000 }), { retry: true, waitMs: SIGN_IN_CODE_WINDOW_MS - 31_000 }, "30 s already spent on the code screen: wait the rest of the window");
  assert.deepEqual(nextSignInWait({ attempt: 2, elapsedMs: 70_000 }), { retry: true, waitMs: 0 }, "the window already passed");
  assert.deepEqual(nextSignInWait({ attempt: 3, elapsedMs: 1 }), { retry: false, waitMs: 0 }, "never forever");
  const src = readFileSync(join(here, "sign-in.mjs"), "utf8");
  assert.match(src, /nextSignInWait\(/);
  assert.match(src, /askedAt - 2_000/, "each attempt only accepts mail sent after its own request");
});

// ---- RC-ADMIN-4b-0: editors that save through POST /api/admin/data ------------------------------------------------------
import { ADMIN_DATA_PATH, gate3Plan, isEditorSave, isMutating, parseBody, stepsPass } from "./editors.mjs";

const dataBody = (operation, table = "site_branding") => JSON.stringify({ table, operation, payload: {} });
const branding = { key: "branding", save: /\/api\/admin\/data$/, ops: ["upsert"], tables: ["site_branding", "site_social_links"] };

test("4b-0: on /api/admin/data a read is not a mutation and not a save, even though it is a POST", () => {
  const read = { method: "POST", pathname: ADMIN_DATA_PATH, body: dataBody("select") };
  assert.equal(isMutating(read), false, "the editors' reads must never be aborted or captured");
  assert.equal(isEditorSave(branding, read), false);
  for (const op of ["insert", "update", "upsert", "delete"]) assert.equal(isMutating({ ...read, body: dataBody(op) }), true, op);
  assert.equal(isMutating({ method: "GET", pathname: ADMIN_DATA_PATH, body: "" }), false);
  assert.equal(isMutating({ method: "POST", pathname: "/api/admin/members", body: "{}" }), true, "other endpoints stay mutating by method");
  assert.equal(isMutating({ method: "POST", pathname: ADMIN_DATA_PATH, body: "not json" }), false, "an unreadable body on the data endpoint is not treated as a write");
  assert.equal(parseBody("[1]") !== undefined, true);
  assert.equal(parseBody(undefined), undefined);
});

test("4b-0: a shared-endpoint save is matched by operation and table; no declared ops matches nothing", () => {
  const save = (operation, table) => ({ method: "POST", pathname: ADMIN_DATA_PATH, body: dataBody(operation, table) });
  assert.equal(isEditorSave(branding, save("upsert", "site_branding")), true);
  assert.equal(isEditorSave(branding, save("upsert", "site_social_links")), true, "branding saves up to three upserts across two tables");
  assert.equal(isEditorSave(branding, save("upsert", "players")), false, "another editor's table");
  assert.equal(isEditorSave(branding, save("delete", "site_branding")), false, "an operation the editor does not declare");
  assert.equal(isEditorSave({ key: "x", save: /\/api\/admin\/data$/ }, save("upsert", "players")), false, "no ops declared on the shared endpoint");
  assert.equal(isEditorSave({ key: "members", save: /\/api\/admin\/members$/ }, { method: "POST", pathname: "/api/admin/members", body: "{}" }), true, "a dedicated endpoint needs no ops");
  assert.equal(isEditorSave(branding, { method: "GET", pathname: ADMIN_DATA_PATH, body: dataBody("upsert") }), false);
});

test("4b-0: gate 3 reports not applicable only from a declared lack; the first four steps can never be skipped", () => {
  assert.deepEqual(gate3Plan({ key: "stadium" }), { applicable: true, reason: undefined, skipped: {}, noStatus: undefined }, "an editor that declares nothing is checked in full");
  const members = gate3Plan({ key: "members", lacks: { pageSave: "adding and removing act at once" } });
  assert.equal(members.applicable, false);
  assert.match(members.reason, /members has no page Save button \(declared in EDITORS\): adding and removing act at once/);
  const plan = gate3Plan({ key: "branding", lacks: { retry: "no retry control", conflict: "no conflict control", clean: "ignored", saved: "ignored" } });
  assert.deepEqual(plan.skipped, { retry: "no retry control", conflict: "no conflict control" }, "clean and saved are not skippable");
  assert.equal(plan.applicable, true);
});

test("4b-0: a gate 3 step may say n/a only if it is optional and gives its reason; anything else must pass", () => {
  const ok = { clean: "pass", dirty: "pass", saving: "pass", saved: "pass", retry: "n/a: no retry control", conflict: "n/a: no conflict control", discard: "pass" };
  assert.equal(stepsPass(ok), true);
  assert.equal(stepsPass({ ...ok, saved: "n/a: skipped" }), false, "saved can never be n/a");
  assert.equal(stepsPass({ ...ok, retry: "n/a:" }), false, "n/a needs a reason");
  assert.equal(stepsPass({ ...ok, discard: "FAIL: x" }), false);
  assert.equal(stepsPass({}), false, "no steps is not a pass");
});

test("4b-0: a declared missing status line skips only the status text check; a missing page Save skips gate 3 whole", () => {
  assert.equal(gate3Plan({ key: "stats-match", lacks: { status: "no Unsaved changes line" } }).noStatus, "no Unsaved changes line");
  assert.deepEqual(gate3Plan({ key: "stats-match", lacks: { status: "x" } }).skipped, {}, "the dirty step still runs");
  assert.equal(gate3Plan({ key: "x" }).noStatus, undefined, "an editor that declares nothing is held to the status line");
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /kind === "admin" && !plan\.noStatus/);
  assert.match(spec, /editor\.lacks\?\.discard/, "gate 4 skips the discard dialog only for an editor that declares no discard control");
});

test("4b-0: every page-load h1 wait is bounded at 45 s, not the 15 s expect default that a loaded machine overran three times", () => {
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /const LOAD_MS = 45_000;/);
  const waits = [...spec.matchAll(/expect\((?:page|basePage)\.locator\("h1"\)\.first\(\)\)\.toBeVisible\([^)]*\)/g)].map((m) => m[0]);
  assert.ok(waits.length >= 7, "the h1 waits exist");
  for (const wait of waits) assert.match(wait, /timeout: LOAD_MS/, wait);
});

test("4b-0: cleanup --worktree removes only that worktree's own cache and never while a live run of it holds it", async () => {
  const { removeOwnCache } = await import("./holders.mjs");
  const root = mkdtempSync(join(tmpdir(), "rcv-cache-"));
  const wtA = mkdtempSync(join(tmpdir(), "rcv-wt-a-")), wtB = mkdtempSync(join(tmpdir(), "rcv-wt-b-"));
  const keyA = worktreeKey(wtA), keyB = worktreeKey(wtB);
  for (const key of [keyA, keyB]) mkdirSync(join(root, key, "base-abc"), { recursive: true });
  const live = (worktree) => ({ record: { runPid: 4242, worktree, runStart: "t", startedAt: new Date().toISOString() } });
  const alive = () => "t", dead = () => null;
  const busy = removeOwnCache(wtA, { root, holders: [live(wtA)], startOf: alive });
  assert.equal(busy.removed, false);
  assert.match(busy.why, /still going/);
  assert.equal(existsSync(join(root, keyA)), true, "a live run's cache is kept");
  const other = removeOwnCache(wtA, { root, holders: [live(wtB)], startOf: alive }); // a live run of ANOTHER worktree does not block it
  assert.equal(other.removed, true);
  assert.equal(existsSync(join(root, keyA)), false);
  assert.equal(existsSync(join(root, keyB, "base-abc")), true, "another worktree's cache is never touched");
  const stale = removeOwnCache(wtB, { root, holders: [live(wtB)], startOf: dead }); // its run is dead: not a live holder
  assert.equal(stale.removed, true);
  const none = removeOwnCache(wtB, { root, holders: [] });
  assert.equal(none.removed, false);
  assert.match(none.why, /no cache/);
  const sh = readFileSync(join(here, "verify.sh"), "utf8");
  assert.match(sh, /own-cache "\$WT"/, "verify.sh cleanup calls it only when --worktree is given");
});

test("4b-0: an editor with no page Save is not applicable only for gate 3; gate 4's visuals and reduced-motion load still run on it", () => {
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /const declaredPlan = gate3Plan\(editor\);\n\s+if \(!declaredPlan\.applicable\)/, "gate 3 reads the declaration before probing");
  // gate 4 visual: the declared branch records applicable: true with the save parts marked n/a, and keeps CLS, overflow and axe verdicts
  const branch = spec.slice(spec.indexOf("if (editor.lacks?.pageSave) {\n        // No page Save to edit through"), spec.indexOf("const field = await openEditor(page, HEAD, editor, { settle: true });"));
  assert.match(branch, /applicable: true, baseline: "origin\/main", saveParts: `n\/a: \$\{editor\.lacks\.pageSave\}`/);
  for (const verdict of ["CLS_LIMIT", "noSaveOverflow", "axe(page, [\"main\"])", "axe(basePage, [\"main\"])", "fresh(headForm, baseForm)"]) assert.ok(branch.includes(verdict), verdict);
  assert.match(spec, /record\("reduced-motion", \{ gate: 4, applicable: true, saveParts:/, "reduced motion samples the load");
  // the report counts those samples as ran, not as n/a: only applicable:false is n/a
  const report = readFileSync(join(here, "report.mjs"), "utf8");
  assert.match(report, /v\.applicable !== false && v\.cls < 0\.001/);
});

test("4b-0: a live region that says 'Loading ...' counts as still loading, whatever its label (About's sr-only status)", async () => {
  const { LOADING_TEXT } = await import("./settle.mjs");
  for (const text of ["Loading About page", "  Loading content", "loading…"]) assert.equal(LOADING_TEXT.test(text), true, text);
  for (const text of ["About page loaded", "", "Unloading", "Page is not loading"]) assert.equal(LOADING_TEXT.test(text), false, text);
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /querySelectorAll\("\[role=status\]"\)\]\.filter\(\(el\) => new RegExp\(loadingText, "i"\)/);
});

test("4b-0: every EDITORS row that saves through /api/admin/data names both ops and tables, outside any comment (bot M1: a tables list had slipped into a // comment)", () => {
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  const block = spec.slice(spec.indexOf("export const EDITORS: Editor[] = ["), spec.indexOf("const editorFor ="));
  const rows = block.split(/\n(?=  \{ key: ")/).slice(1);
  assert.ok(rows.length >= 20, `the EDITORS rows were found (${rows.length})`);
  const code = (row) => row.split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n"); // no row here has a // inside a string
  const shared = rows.filter((row) => /save: \/\\\/api\\\/admin\\\/data\$\//.test(code(row)));
  assert.deepEqual(shared.map((row) => row.match(/key: "([^"]+)"/)[1]), ["branding", "seasons", "roster", "stats-match", "stats-season"], "the rows on the shared endpoint");
  for (const row of shared) {
    const key = row.match(/key: "([^"]+)"/)[1];
    assert.match(code(row), /\bops: \[("[a-z]+"(, )?)+\]/, `${key} names its operations`);
    assert.match(code(row), /\btables: \[("[a-z_]+"(, )?)+\]/, `${key} names its tables`);
  }
});

test("4b-0-2: the seasons row finds the create button under both labels, and only those", async () => {
  const { SEASON_CREATE_BUTTON } = await import("./editors.mjs");
  for (const label of ["Create Next Season", "Create 2028 season", "Create 2027 Season", "create 2030 season"]) assert.equal(SEASON_CREATE_BUTTON.test(label), true, label);
  for (const label of ["Create season", "Create 28 season", "Create 20281 season", "Create 2028 seasons", "Create Next Season now", "Edit 2028 season", "Recreate 2028 season", ""]) assert.equal(SEASON_CREATE_BUTTON.test(label), false, label);
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  const row = spec.slice(spec.indexOf('{ key: "seasons"'), spec.indexOf('{ key: "roster"'));
  assert.match(row, /getByRole\("button", \{ name: SEASON_CREATE_BUTTON \}\)/, "the seasons row uses the shared matcher");
  assert.doesNotMatch(row, /visibleButton\(page, "Create Next Season"\)/, "no exact-label lookup is left in the row");
});

test("4b-0-2: gate 6 treats a data-endpoint select still in flight as loading, and nothing else on that endpoint", async () => {
  const { isAdminDataRead } = await import("./editors.mjs");
  const body = (operation) => JSON.stringify({ table: "matches", operation });
  assert.equal(isAdminDataRead({ method: "POST", pathname: "/api/admin/data", body: body("select") }), true);
  for (const operation of ["insert", "update", "upsert", "delete"]) assert.equal(isAdminDataRead({ method: "POST", pathname: "/api/admin/data", body: body(operation) }), false, operation);
  assert.equal(isAdminDataRead({ method: "GET", pathname: "/api/admin/data", body: body("select") }), false);
  assert.equal(isAdminDataRead({ method: "POST", pathname: "/api/admin/members", body: body("select") }), false, "other endpoints (polling) are not counted");
  assert.equal(isAdminDataRead({ method: "POST", pathname: "/api/admin/data", body: "not json" }), false);
  const spec = readFileSync(join(here, "..", "rc-admin-verify.spec.ts"), "utf8");
  assert.match(spec, /if \(asset\(r\) \|\| dataRead\(r\)\) inflight\.add\(r\)/);
});
