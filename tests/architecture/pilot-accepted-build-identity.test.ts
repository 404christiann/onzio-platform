import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reconstructPilotSource } from "../../scripts/pilot-source-package";
import { withPilotProofServers } from "../../scripts/pilot-proof-servers";

const project = resolve(import.meta.dirname, "../..");
const loader = createRequire(import.meta.url).resolve("tsx");
const base = mkdtempSync(join(tmpdir(), "onzio-accepted-build-"));
const root = join(base, "source");
const marker = ".onzio-pilot-reconstruction.json";
const receipt = ".next/onzio-pilot-build.json";
const visualPath = "components/sites/diverse-city/HomePage.tsx";
const bindingPath = "lib/homepage-editor/capabilities.ts";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
let accepted: { directory: string; digest: string };
let alternate: { directory: string; digest: string };
let sequence = 0;
function put(at: string, path: string, bytes: string) { mkdirSync(dirname(join(at, path)), { recursive: true }); writeFileSync(join(at, path), bytes); }
function cli(at: string, script: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", loader, join(project, "scripts", script), ...args], {
    cwd: at, encoding: "utf8", timeout: 15_000, env: { ...process.env, NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1" },
  });
}
function successful(at: string, script: string, args: string[]) {
  const result = cli(at, script, args); expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0); return result.stdout;
}
function build(at: string) { successful(at, "run-pilot-reconstruction.ts", ["build"]); }
function git(...args: string[]) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
beforeAll(() => {
  const visual = ['components/sites/diverse-city/HomePage.tsx', 'components/Nav.tsx', 'components/Footer.tsx', 'components/TemplateFontScope.tsx', 'components/AcademyRouteLoadingSkeleton.tsx', 'components/ChampionsBadge.tsx', 'app/layout.tsx', 'styles/globals.css', 'tailwind.config.ts', 'postcss.config.mjs'];
  for (const path of visual) put(root, path, path.endsWith('.css') ? 'body {color:navy}' : 'export {};');
  put(root, 'components/sites/diverse-city/HomePage.tsx', 'import "@/components/ClubContextProvider"; export const visual = "retained A";');
  put(root, 'components/ClubContextProvider.tsx', 'export const authority="current platform";');
  put(root, 'lib/homepage-editor/capabilities.ts', 'export const binding="legacy@1";');
  put(root, 'public/hero.txt', 'retained public bytes');
  put(root, 'package.json', '{"private":true}');
  put(root, 'package-lock.json', JSON.stringify({ packages: Object.fromEntries(['next', 'react', 'react-dom', 'typescript', 'tailwindcss', 'tailwindcss-animate', 'postcss', 'autoprefixer'].map(name => ['node_modules/' + name, { version: '1.0.0' }])) }));
  put(root, 'next.config.mjs', 'export default {};');
  put(root, '.gitignore', 'node_modules\n.next\n.env*\n.onzio-pilot-build.lock\n');
  put(root, '.env.local', 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n');
  put(root, 'node_modules/next/package.json', '{"name":"next","version":"0.0.0-synthetic"}');
  put(root, 'node_modules/next/constants.js', 'exports.PHASE_PRODUCTION_BUILD="build";exports.PHASE_PRODUCTION_SERVER="server";');
  put(root, 'node_modules/next/dist/server/config.js', 'exports.default=async()=>({distDir:".next"});');
  put(root, 'node_modules/next/dist/bin/next', `const fs=require('node:fs'),path=require('node:path');for(const [p,b] of Object.entries({'.next/BUILD_ID':'synthetic-build','.next/server/page.js':'synthetic executable output','.next/static/css/layout.css':'body {color:navy}', '.next/static/media/font.woff2':'font fixture'})){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);}`);
  put(root, 'node_modules/next/dist/server/lib/router-utils/router-server-context.js', `exports.RouterServerContextSymbol=Symbol.for('router');exports.routerServerGlobal=globalThis;`);
  put(root, 'node_modules/next/dist/server/lib/render-server.js', `const servers=new Map();exports.servers=servers;exports.getServerField=async(root,field)=>servers.get(root)[field];exports.initialize=async({dir})=>servers.get(dir);`);
  put(root, 'node_modules/next/dist/cli/next-start.js', `exports.nextStart=async(options,root)=>{const http=require('node:http'),path=require('node:path');const server=http.createServer((req,res)=>res.end('synthetic genuine listener'));await new Promise(resolve=>server.listen(options.port,options.hostname,resolve));process.env.PORT=String(server.address().port);process.env.__NEXT_PRIVATE_ORIGIN='http://127.0.0.1:'+process.env.PORT;const context=require('../server/lib/router-utils/router-server-context');context.routerServerGlobal[context.RouterServerContextSymbol]={[path.relative(process.cwd(),root)]:{nextConfig:{distDir:'.next'}}};require('../server/lib/render-server').servers.set(root,{renderOpts:{distDir:path.join(root,'.next')},server:{options:{httpServer:server}}});};`);
  git("init", "--quiet"); git("add", "."); git("-c", "user.name=Synthetic", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "A");
  build(root);
  accepted = JSON.parse(successful(root, "package-pilot-local.ts", ["pack", "--build", root, "--output", join(base, "package-a")]));
  git("-c", "user.name=Synthetic", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "--quiet", "-m", "Different acceptance");
  alternate = JSON.parse(successful(root, "package-pilot-local.ts", ["pack", "--build", root, "--output", join(base, "package-b")]));
});
afterAll(() => rmSync(base, { recursive: true, force: true }));
function roots(selected = accepted) {
  const at = join(base, `case-${sequence++}`); mkdirSync(at);
  const baseline = join(at, "baseline"); const changed = join(at, "changed"); const restored = join(at, "restored");
  cpSync(root, baseline, { recursive: true }); cpSync(root, changed, { recursive: true });
  put(changed, visualPath, 'import "@/components/ClubContextProvider"; export const visual="changed B";');
  put(changed, "components/ClubContextProvider.tsx", 'export const authority="current denial B";');
  put(changed, "public/current-b-extra.txt", "additional B input");
  execFileSync("git", ["add", "public/current-b-extra.txt"], { cwd: changed });
  successful(changed, "package-pilot-local.ts", ["reconstruct", "--package", selected.directory, "--digest", selected.digest, "--output", restored]);
  symlinkSync(join(root, "node_modules"), join(restored, "node_modules"));
  put(restored, ".env.local", readFileSync(join(root, ".env.local"), "utf8"));
  build(baseline); build(changed); build(restored);
  return { baseline, changed, restored };
}
async function rejected(items: ReturnType<typeof roots>, acceptedDigest: string) {
  let called = false;
  await expect(withPilotProofServers({ ...items, acceptedDigest }, async () => { called = true; })).rejects.toThrow();
  expect(called).toBe(false);
  for (const at of Object.values(items)) expect(existsSync(join(at, ".onzio-pilot-build.lock"))).toBe(false);
}
describe("accepted reconstruction through real package and guarded build CLIs", () => {
  it("distinguishes metadata-only acceptances and preserves current B authority and extra inputs", async () => {
    const items = roots(); const other = roots(alternate);
    expect(accepted.digest).not.toBe(alternate.digest);
    const manifestA = JSON.parse(readFileSync(join(accepted.directory, "manifest.json"), "utf8"));
    const manifestB = JSON.parse(readFileSync(join(alternate.directory, "manifest.json"), "utf8"));
    expect(manifestA.sourceCommit).not.toBe(manifestB.sourceCommit);
    delete manifestA.sourceCommit; delete manifestB.sourceCommit; expect(manifestA).toEqual(manifestB);
    const inputsA = JSON.parse(readFileSync(join(items.restored, receipt), "utf8")).inputs;
    const inputsB = JSON.parse(readFileSync(join(other.restored, receipt), "utf8")).inputs;
    expect(inputsA.filter((item: { path: string }) => item.path !== marker)).toEqual(inputsB.filter((item: { path: string }) => item.path !== marker));
    expect(readFileSync(join(items.restored, visualPath))).toEqual(readFileSync(join(other.restored, visualPath)));
    expect(readFileSync(join(items.restored, marker))).not.toEqual(readFileSync(join(other.restored, marker)));
    expect(readFileSync(join(items.restored, receipt))).not.toEqual(readFileSync(join(other.restored, receipt)));
    expect(readFileSync(join(items.restored, "components/ClubContextProvider.tsx"), "utf8")).toContain("current denial B");
    expect(readFileSync(join(items.restored, "public/current-b-extra.txt"), "utf8")).toBe("additional B input");
    expect(readFileSync(join(items.restored, "package-lock.json"))).toEqual(readFileSync(join(items.changed, "package-lock.json")));
    const environment = hash(JSON.stringify(process.env));
    await withPilotProofServers({ ...items, acceptedDigest: accepted.digest }, async servers => {
      expect(servers.restored.reconstruction).toEqual({ digest: accepted.digest });
      expect(servers.changed.reconstruction).toBeNull();
      for (const identity of Object.values(servers)) {
        const url = new URL(identity.origin); url.hostname = "127.0.0.1";
        expect(await (await fetch(url)).text()).toBe("synthetic genuine listener");
      }
    });
    await rejected(items, alternate.digest); await rejected(other, accepted.digest);
    expect(hash(JSON.stringify(process.env))).toBe(environment);
  });
  it.each(["", "bad", "A".repeat(64)])("rejects an explicit malformed digest %j without generic downgrade", async value => { await rejected(roots(), value); });
  it("requires restored identity while allowing generic low-level proof", async () => {
    const items = roots(); rmSync(join(items.restored, marker)); build(items.restored);
    await rejected(items, accepted.digest);
    await withPilotProofServers(items, async servers => { expect(servers.restored.reconstruction).toBeNull(); });
  });
  it.each(["malformed", "duplicate", "duplicate-platform", "unsafe", "symlink", "unsupported"])("invalidates old success when a present marker is %s", mode => {
    const items = roots();
    const original = JSON.parse(readFileSync(join(items.restored, marker), "utf8"));
    if (mode === "malformed") put(items.restored, marker, "{");
    if (mode === "duplicate") { original.manifest.files.push(original.manifest.files[0]); put(items.restored, marker, JSON.stringify(original)); }
    if (mode === "duplicate-platform") { original.manifest.platform.push(original.manifest.platform[0]); put(items.restored, marker, JSON.stringify(original)); }
    if (mode === "unsafe") { original.manifest.files[0].path = "source/../escape"; put(items.restored, marker, JSON.stringify(original)); }
    if (mode === "unsupported") { original.unexpected = true; put(items.restored, marker, JSON.stringify(original)); }
    if (mode === "symlink") { rmSync(join(items.restored, marker)); symlinkSync(join(items.baseline, "package.json"), join(items.restored, marker)); }
    expect(cli(items.restored, "run-pilot-reconstruction.ts", ["build"]).status).not.toBe(0);
    expect(existsSync(join(items.restored, receipt))).toBe(false);
  });
  it.each(["visual", "binding", "whole-lock"])("rejects a copied marker over changed %s before publishing fresh success", async mode => {
    const items = roots();
    const path = mode === "visual" ? visualPath : mode === "binding" ? bindingPath : "package-lock.json";
    put(items.restored, path, `${readFileSync(join(items.restored, path), "utf8")}\n`);
    expect(cli(items.restored, "run-pilot-reconstruction.ts", ["build"]).status).not.toBe(0);
    expect(existsSync(join(items.restored, receipt))).toBe(false);
    await rejected(items, accepted.digest);
  });
  it.each(["visual", "binding", "whole-lock"])("rejects freshly built baseline %s that differs from the same acceptance", async mode => {
    const items = roots();
    const path = mode === "visual" ? visualPath : mode === "binding" ? bindingPath : "package-lock.json";
    put(items.baseline, path, `${readFileSync(join(items.baseline, path), "utf8")}\n`);
    build(items.baseline);
    await rejected(items, accepted.digest);
  });
  it("rejects malformed present identity even for generic proof", async () => {
    const items = roots(); put(items.restored, marker, "{}");
    await expect(withPilotProofServers(items, async () => "must not run")).rejects.toThrow();
  });
  it.each(["missing", "drift"])("rejects %s mandatory IPC reconstruction identity", async mode => {
    const items = roots();
    const entry = "node_modules/next/dist/cli/next-start.js";
    rmSync(join(items.restored, "node_modules"));
    cpSync(join(root, "node_modules"), join(items.restored, "node_modules"), { recursive: true });
    const original = readFileSync(join(items.restored, entry), "utf8");
    put(items.restored, entry, `${original}
      const send = process.send.bind(process);
      process.send = (message, ...args) => {
        if (message.identity && ${JSON.stringify(mode)} === "missing") delete message.identity.reconstruction;
        if (message.kind === "verified" && ${JSON.stringify(mode)} === "drift") message.identity.reconstruction = {digest:"0".repeat(64)};
        return send(message, ...args);
      };`);
    let reached = false;
    await expect(withPilotProofServers({ ...items, acceptedDigest: accepted.digest }, async () => { reached = true; })).rejects.toThrow();
    expect(reached).toBe(mode === "drift");
    for (const at of Object.values(items)) expect(existsSync(join(at, ".onzio-pilot-build.lock"))).toBe(false);
  });
  it("passes the actual CLI external expectation to owned proof before launching browser capture", () => {
    const items = roots();
    const result = cli(items.baseline, "prove-pilot-reconstruction.ts", ["--package", alternate.directory, "--digest", alternate.digest,
      "--baseline-root", items.baseline, "--changed-root", items.changed, "--restored-root", items.restored, "--auth", join(base, "must-not-be-read.json")]);
    expect(result.error).toBeUndefined(); expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("externally accepted package");
    for (const at of Object.values(items)) expect(existsSync(join(at, ".onzio-pilot-build.lock"))).toBe(false);
  });
  it.each(["replace", "remove"])("rejects postbuild marker %s before capture", async mode => {
    const items = roots();
    if (mode === "remove") rmSync(join(items.restored, marker));
    else {
      const content = JSON.parse(readFileSync(join(items.restored, marker), "utf8"));
      content.manifest.sourceCommit = "0".repeat(40); put(items.restored, marker, JSON.stringify(content));
    }
    await rejected(items, accepted.digest);
  });
  it.each(["marker", "baseline-binding", "baseline-lock", "baseline-visual"])("withholds capture success after %s mutation", async mode => {
    const items = roots(); let reached = false;
    await expect(withPilotProofServers({ ...items, acceptedDigest: accepted.digest }, async () => {
      reached = true;
      if (mode === "marker") rmSync(join(items.restored, marker));
      else {
        const path = mode === "baseline-binding" ? bindingPath : mode === "baseline-lock" ? "package-lock.json" : visualPath;
        put(items.baseline, path, `${readFileSync(join(items.baseline, path), "utf8")}\n`);
      }
      return "must not publish";
    })).rejects.toThrow();
    expect(reached).toBe(true);
    for (const at of Object.values(items)) expect(existsSync(join(at, ".onzio-pilot-build.lock"))).toBe(false);
  });
  it.each(["file", "directory"])("rejects a reserved current-root marker %s before creating output", mode => {
    const current = join(base, `reserved-${sequence++}`); cpSync(root, current, { recursive: true });
    put(current, mode === "file" ? marker : `${marker}/child`, "tracked collision"); execFileSync("git", ["add", marker], { cwd: current });
    const output = join(base, `forbidden-${sequence++}`);
    const result = cli(current, "package-pilot-local.ts", ["reconstruct", "--package", accepted.directory, "--digest", accepted.digest, "--output", output]);
    expect(result.status).not.toBe(0); expect(existsSync(output)).toBe(false);
  });
  it("removes only the new reconstruction target after a copy failure", () => {
    const current = join(base, `copy-failure-${sequence++}`); cpSync(root, current, { recursive: true });
    symlinkSync(join(current, "package.json"), join(current, "unsafe-copy")); execFileSync("git", ["add", "unsafe-copy"], { cwd: current });
    const output = join(base, `copy-failure-output-${sequence++}`);
    expect(cli(current, "package-pilot-local.ts", ["reconstruct", "--package", accepted.directory, "--digest", accepted.digest, "--output", output]).status).not.toBe(0);
    expect(existsSync(output)).toBe(false); expect(existsSync(join(current, "package.json"))).toBe(true);
    expect(existsSync(join(accepted.directory, "manifest.json"))).toBe(true);
  });
  it.each([undefined, "", "bad", "A".repeat(64)])("rejects reconstruction expectation %j before creating output", expectedDigest => {
    const output = join(base, `invalid-expectation-${sequence++}`);
    expect(() => Reflect.apply(reconstructPilotSource, undefined, [{ root, directory: accepted.directory, expectedDigest, output }])).toThrow();
    expect(existsSync(output)).toBe(false);
  });
  it("keeps historical v1 verification but rejects v1 reconstruction", () => {
    const legacy = join(base, "legacy"); cpSync(accepted.directory, legacy, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(legacy, "manifest.json"), "utf8")); manifest.format = "onzio-pilot-source@1"; delete manifest.packageLockSha256;
    put(legacy, "manifest.json", JSON.stringify(manifest));
    successful(root, "package-pilot-local.ts", ["verify", "--package", legacy, "--digest", hash(JSON.stringify(manifest))]);
    const output = join(base, "legacy-forbidden");
    expect(cli(root, "package-pilot-local.ts", ["reconstruct", "--package", legacy, "--digest", hash(JSON.stringify(manifest)), "--output", output]).status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
  });
});
