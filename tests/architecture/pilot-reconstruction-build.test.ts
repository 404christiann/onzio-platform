import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const project = resolve(import.meta.dirname, "../..");
const directory = mkdtempSync(join(tmpdir(), "onzio-pilot-build-test-"));
const loader = createRequire(import.meta.url).resolve("tsx");
let sequence = 0;
function put(root: string, path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function fixture() {
  const root = join(directory, `case-${sequence++}`);
  const report = join(directory, `child-${sequence}.json`);
  put(root, ".env.local", "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nPRIVATE_MARKER=never_serialize_this_private_marker");
  for (const path of ["app/page.tsx", "public/hero.txt", "lib/homepage-editor/capabilities.ts", "package-lock.json", "lib/platform.ts", ".hidden-source"]) put(root, path, "original");
  put(root, "next.config.mjs", "export default {};");
  put(root, "package.json", '{"private":true}');
  put(root, "node_modules/next/package.json", '{"name":"next","version":"0.0.0-test"}');
  put(root, "node_modules/next/constants.js", 'exports.PHASE_PRODUCTION_BUILD = "phase-production-build"; exports.PHASE_PRODUCTION_SERVER = "phase-production-server";');
  put(root, "node_modules/next/dist/server/config.js", `exports.default = async (phase, root) => {
    const config = (await import(require("node:url").pathToFileURL(require("node:path").join(root, "next.config.mjs")))).default;
    return { distDir: ".next", ...await (typeof config === "function" ? config(phase) : config) };
  };`);
  put(root, "node_modules/next/dist/bin/next", `async function main() {
const fs = require("node:fs");
const path = require("node:path");
function put(name, value) { fs.mkdirSync(path.dirname(name), {recursive:true}); fs.writeFileSync(name, value); }
const action = process.argv[2];
if (action === "build") {
  if (process.env.CHILD_MUTATE) put("app/page.tsx", "changed during build");
  if (process.env.CHILD_FAIL) process.exit(23);
  if (process.env.CHILD_SIGNAL) process.kill(process.pid, "SIGTERM");
  if (!process.env.CHILD_NO_OUTPUT) {
    put(".next/BUILD_ID", "synthetic-build");
    put(".next/server/app/page.js", "server bytes");
    put(".next/static/chunks/page.js", "client bytes");
    put(".next/required-server-files.json", "{}");
  }
}
let output = ".next";
if (action === "start") {
  process.env.PORT = String(Number(process.argv[process.argv.indexOf("--port") + 1]));
  process.env.__NEXT_PRIVATE_ORIGIN = "http://127.0.0.1:" + process.env.PORT;
  output = (await require("../server/config").default("phase-production-server", process.cwd())).distDir;
}
const buildId = path.join(output, "BUILD_ID");
fs.writeFileSync(process.env.PILOT_CHILD_REPORT, JSON.stringify({args: process.argv.slice(2), build: fs.existsSync(buildId) ? fs.readFileSync(buildId, "utf8") : null}));
if (process.env.CHILD_HOLD) {
  while (!fs.existsSync(process.env.CHILD_RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}
} main();`);
  return { root, report };
}
function launch(f: ReturnType<typeof fixture>, action: "build" | "start", shell: Record<string, string> = {}) {
  rmSync(f.report, { force: true });
  return spawnSync(process.execPath, ["--import", loader, join(project, "scripts/run-pilot-reconstruction.ts"), action, ...(action === "start" ? ["--port", "3127"] : [])], {
    cwd: f.root, encoding: "utf8", timeout: 10_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", PILOT_CHILD_REPORT: f.report, ...shell },
  });
}
function build(f: ReturnType<typeof fixture>, shell: Record<string, string> = {}) {
  const result = launch(f, "build", shell);
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
}
function rejectedStart(f: ReturnType<typeof fixture>, shell: Record<string, string> = {}) {
  const result = launch(f, "start", shell);
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(existsSync(f.report)).toBe(false);
  return result;
}
const receiptPath = ".next/onzio-pilot-build.json";
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("guarded reconstruction build and start CLI", () => {
  it("refuses an unrelated preexisting build without a successful guarded build", () => {
    const f = fixture();
    put(f.root, ".next/BUILD_ID", "old-unrelated-build");
    put(f.root, ".next/server/page.js", "old server");
    put(f.root, ".next/static/page.js", "old client");
    rejectedStart(f);
  });
  it("publishes a private receipt after success and forwards loopback start", () => {
    const f = fixture();
    build(f);
    const receipt = readFileSync(join(f.root, receiptPath), "utf8");
    expect(receipt).not.toContain("never_serialize_this_private_marker");
    expect(receipt).not.toContain("http://127.0.0.1:54321");
    expect(statSync(join(f.root, receiptPath)).mode & 0o777).toBe(0o600);
    const result = launch(f, "start");
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(f.report, "utf8"))).toEqual({ args: ["start", "--hostname", "127.0.0.1", "--port", "3127"], build: "synthetic-build" });
  });
  it.each(["app/page.tsx", "next.config.mjs", "public/hero.txt", "lib/homepage-editor/capabilities.ts", "package-lock.json", "lib/platform.ts", ".hidden-source"])("refuses changed input %s before spawning start", path => {
    const f = fixture(); build(f); put(f.root, path, "changed"); rejectedStart(f);
  });
  it.each(["added", "deleted"])("refuses %s source membership", change => {
    const f = fixture(); build(f);
    if (change === "added") put(f.root, "new-source.ts", "new code");
    else rmSync(join(f.root, "app/page.tsx"));
    rejectedStart(f);
  });
  it.each([".next/BUILD_ID", ".next/server/app/page.js", ".next/static/chunks/page.js", ".next/required-server-files.json"])("refuses changed output %s", path => {
    const f = fixture(); build(f); put(f.root, path, "tampered"); rejectedStart(f);
  });
  it.each(["added", "deleted"])("refuses %s executable output membership", change => {
    const f = fixture(); build(f);
    if (change === "added") put(f.root, ".next/server/new.js", "new executable");
    else rmSync(join(f.root, ".next/static/chunks/page.js"));
    rejectedStart(f);
  });
});

describe("guarded reconstruction failure lifecycle", () => {
  it.each(["not json", '{"format":"onzio-pilot-build@99"}', '{"format":"onzio-pilot-build@1"}'])("refuses malformed or unsupported receipt %s", contents => {
    const f = fixture(); build(f); put(f.root, receiptPath, contents); rejectedStart(f);
  });
  it.each(["CHILD_FAIL", "CHILD_SIGNAL", "CHILD_MUTATE"])("invalidates previous success when %s rejects a new build", name => {
    const f = fixture(); build(f);
    const result = launch(f, "build", { [name]: "1" });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
    rejectedStart(f);
    expect(existsSync(join(f.root, ".onzio-pilot-build.lock"))).toBe(false);
  });
  it("invalidates previous success before an unsafe environment preflight", () => {
    const f = fixture(); build(f);
    const marker = "private_rejected_marker";
    const result = launch(f, "build", { STRIPE_SECRET_KEY: `sk_live_${marker}` });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(marker);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
    expect(existsSync(f.report)).toBe(false);
    rejectedStart(f);
  });
  it("does not certify stale default output after a successful child leaves it untouched", () => {
    const f = fixture(); build(f);
    put(f.root, "next.config.mjs", 'export default { distDir: "custom-next" };');
    put(f.root, "custom-next/BUILD_ID", "different-output");
    const result = launch(f, "build", { CHILD_NO_OUTPUT: "1" });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
    expect(existsSync(join(f.root, ".next/BUILD_ID"))).toBe(false);
    expect(readFileSync(join(f.root, ".next/server/app/page.js"), "utf8")).toBe("server bytes");
    rejectedStart(f);
  });
  it.each(["symlink", "directory"])("revokes prior success before rejecting a reserved temporary %s", kind => {
    const f = fixture(); build(f);
    const temporary = join(f.root, ".next/.onzio-pilot-build.tmp");
    if (kind === "symlink") symlinkSync(join(directory, "absent-temporary-target"), temporary);
    else mkdirSync(temporary);
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
    expect(existsSync(join(f.root, ".next/BUILD_ID"))).toBe(false);
    rmSync(temporary, { recursive: true, force: true });
    rejectedStart(f);
    build(f);
    expect(launch(f, "start").status).toBe(0);
  });
  it("rejects phase-dependent custom server output before spawning Next start", () => {
    const f = fixture();
    put(f.root, "next.config.mjs", 'export default phase => ({ distDir: phase === "phase-production-server" && process.env.CUSTOM_SERVER_OUTPUT ? "output/stale" : ".next" });');
    build(f);
    const result = rejectedStart(f, { CUSTOM_SERVER_OUTPUT: "1" });
    expect(result.stderr).toContain("normal .next output");
  });
  it.each(["__NEXT_PRIVATE_ORIGIN", "PORT"])("rejects output selected by Next-created %s before the real start CLI child runs", variable => {
    const f = fixture();
    put(f.root, "next.config.mjs", `export default phase => ({distDir: phase === "phase-production-server" && process.env.${variable} ? "output/stale" : ".next"});`);
    put(f.root, "output/stale/BUILD_ID", "stale-custom-build");
    build(f);
    const result = rejectedStart(f);
    expect(result.stderr).toContain("normal .next output");
    expect(existsSync(join(f.root, ".onzio-pilot-build.lock"))).toBe(false);
  });
  it("accepts normal output with the fixed runtime port and origin in the start CLI", () => {
    const f = fixture();
    put(f.root, "next.config.mjs", 'export default phase => ({distDir: phase === "phase-production-server" && process.env.PORT === "3127" && process.env.__NEXT_PRIVATE_ORIGIN === "http://127.0.0.1:3127" ? "./.next" : ".next"});');
    build(f);
    expect(launch(f, "start").status).toBe(0);
    expect(JSON.parse(readFileSync(f.report, "utf8")).build).toBe("synthetic-build");
  });
  it.each(["phase-production-build", "phase-production-server"])("revokes prior success before rejecting effective custom %s output", phase => {
    const f = fixture(); build(f);
    put(f.root, "next.config.mjs", `export default phase => ({ distDir: phase === "${phase}" ? "output/custom" : ".next" });`);
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
    rejectedStart(f);
  });
  it.each(["throw new Error(marker)", "return Promise.reject(new Error(marker))"])("redacts config loader failures using %s", failure => {
    const f = fixture();
    const marker = "private_config_failure_marker";
    put(f.root, "next.config.mjs", `export default () => { const marker = "${marker}"; console.log(marker); console.error(marker); ${failure}; };`);
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain(marker);
    expect(result.stderr).toContain("normal .next output");
  });
  it("rejects source mutations during configuration preflight", () => {
    const f = fixture();
    put(f.root, "next.config.mjs", 'import fs from "node:fs"; export default () => { fs.writeFileSync("app/page.tsx", "changed by config"); return {}; };');
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
  });
  it("rechecks start output after configuration evaluation", () => {
    const f = fixture();
    put(f.root, "next.config.mjs", 'import fs from "node:fs"; export default () => { if (process.env.CONFIG_MUTATE_OUTPUT) fs.writeFileSync(".next/server/app/page.js", "changed by config"); return {}; };');
    build(f);
    rejectedStart(f, { CONFIG_MUTATE_OUTPUT: "1" });
  });
  it("rejects a configuration promise that never resolves", () => {
    const f = fixture();
    put(f.root, "next.config.mjs", 'export default () => new Promise(() => {});');
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
  });
  it("refuses a successful child that emits no complete build", () => {
    const f = fixture();
    const result = launch(f, "build", { CHILD_NO_OUTPUT: "1" });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
  });
  it.each([".next/BUILD_ID", ".next/server/app/page.js", ".next/static/chunks/page.js"])("refuses empty required output %s", path => {
    const f = fixture(); build(f); put(f.root, path, ""); rejectedStart(f);
  });
  it.each(["NEXT_PUBLIC_EXTRA", "ONZIO_ENVIRONMENT"])("refuses changed public build environment %s", name => {
    const f = fixture(); build(f); rejectedStart(f, { [name]: "changed-public-value" });
  });
  it("refuses removal of a public build environment key", () => {
    const f = fixture(); build(f, { NEXT_PUBLIC_EXTRA: "original" }); rejectedStart(f);
  });
  it("allows private environment changes without serializing their values", () => {
    const f = fixture(); build(f);
    const result = launch(f, "start", { PRIVATE_MARKER: "different-private-value" });
    expect(result.status).toBe(0);
    expect(readFileSync(join(f.root, receiptPath), "utf8")).not.toContain("different-private-value");
  });
  it("does not invalidate the owner's receipt or remove a preexisting lock", () => {
    const f = fixture(); build(f);
    const before = readFileSync(join(f.root, receiptPath), "utf8");
    put(f.root, ".onzio-pilot-build.lock", "owner");
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(readFileSync(join(f.root, ".onzio-pilot-build.lock"), "utf8")).toBe("owner");
    expect(readFileSync(join(f.root, receiptPath), "utf8")).toBe(before);
  });
  it.each(["app/external.ts", ".next/server/external.js", ".next/static/external.js"])("refuses included symlink %s", path => {
    const f = fixture(); build(f);
    symlinkSync(join(f.root, "package.json"), join(f.root, path));
    rejectedStart(f);
  });
  it("refuses an existing included output symlink before a build child runs", () => {
    const f = fixture(); build(f);
    symlinkSync(join(f.root, "package.json"), join(f.root, ".next/server/external.js"));
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
    expect(existsSync(join(f.root, receiptPath))).toBe(false);
    rejectedStart(f);
  });
  it("refuses a symlinked output root before a build child runs", () => {
    const f = fixture();
    symlinkSync(join(directory, "unavailable-output"), join(f.root, ".next"));
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
  });
  it.each([receiptPath, ".next/.onzio-pilot-build.tmp"])("refuses symlinked receipt publication path %s", path => {
    const f = fixture(); build(f);
    rmSync(join(f.root, path), { force: true });
    symlinkSync(join(directory, "absent-receipt-target"), join(f.root, path));
    const result = launch(f, "build");
    expect(result.status).not.toBe(0);
    expect(existsSync(f.report)).toBe(false);
  });
  it("allows explicitly excluded cache and dependency changes", () => {
    const f = fixture(); build(f);
    for (const path of [".next/cache/random", ".next/diagnostics/trace.json", ".next/trace", "node_modules/new-package/index.js", "supabase/.temp/generated", "tmp/log", "output/log", ".env.production.local"]) put(f.root, path, path === ".env.production.local" ? "PRIVATE_NEW=value" : "ignored generated bytes");
    expect(launch(f, "start").status).toBe(0);
  });
  it("allows the supported shared node_modules symlink", () => {
    const f = fixture();
    const modules = join(directory, `modules-${sequence}`);
    renameSync(join(f.root, "node_modules"), modules);
    symlinkSync(modules, join(f.root, "node_modules"));
    build(f);
    expect(launch(f, "start").status).toBe(0);
  });
  it("holds the lock throughout a running start child and refuses overlap", async () => {
    const f = fixture(); build(f);
    rmSync(f.report);
    const receipt = readFileSync(join(f.root, receiptPath), "utf8");
    const release = join(directory, `release-${sequence++}`);
    const child = spawn(process.execPath, ["--import", loader, join(project, "scripts/run-pilot-reconstruction.ts"), "start", "--port", "3127"], {
      cwd: f.root, stdio: "ignore", env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", PILOT_CHILD_REPORT: f.report, CHILD_HOLD: "1", CHILD_RELEASE: release },
    });
    const completion = new Promise<number | null>((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    try {
      const deadline = Date.now() + 5000;
      while (!existsSync(f.report) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      expect(existsSync(f.report)).toBe(true);
      expect(existsSync(join(f.root, ".onzio-pilot-build.lock"))).toBe(true);
      expect(launch(f, "build").status).not.toBe(0);
      expect(readFileSync(join(f.root, receiptPath), "utf8")).toBe(receipt);
      expect(existsSync(join(f.root, ".onzio-pilot-build.lock"))).toBe(true);
    } finally {
      writeFileSync(release, "release");
      expect(await completion).toBe(0);
    }
    expect(existsSync(join(f.root, ".onzio-pilot-build.lock"))).toBe(false);
  });
  it("does not exclude arbitrary nested cache or tmp source directories", () => {
    const f = fixture(); build(f); put(f.root, "app/cache/source.js", "new source"); rejectedStart(f);
  });
});
