import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { academySourceRoots } from "../../scripts/pilot-academy-source-roots";
import { packPilotSource, reconstructPilotSource, verifyPilotSource } from "../../scripts/pilot-source-package";

const directory = mkdtempSync(join(tmpdir(), "onzio-pilot-package-test-"));
const source = join(directory, "platform");
const build = join(directory, "build");
const artifact = join(directory, "retained");
const project = resolve(import.meta.dirname, "../..");
const loader = createRequire(import.meta.url).resolve("tsx");
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const additionalRoots = [
  "AcademyAboutPage", "AcademyContactPage", "AcademyProgramsPage", "AcademyProgramDetailPage",
  "AcademyRosterPage", "AcademySchedulePage", "AcademyShopPage", "AcademySponsorsPage",
  "AcademyTryoutsPage", "AcademyRegistrationPage", "AcademyRegistrationConfirmationPage",
].map(name => `components/sites/diverse-city/${name}.tsx`).concat("components/ClubLogoPageClient.tsx");
const sharedServices = [
  "components/registration/RegistrationCtaButton.tsx", "components/registration/RegisterModal.tsx",
  "components/registration/SignatureInput.tsx", "components/registration/RegistrationConfirmation.tsx",
  "lib/registration-public.ts", "lib/roster-images.ts", "lib/flags.ts",
];
let packageDigest: string;
function cli(root: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", loader, join(project, "scripts/package-pilot-local.ts"), ...args], {
    cwd: root, encoding: "utf8", timeout: 10_000, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), NODE_ENV: "test" },
  });
}
function rewriteManifest(target: string, change: (manifest: Record<string, unknown>) => void) {
  const manifest = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8"));
  change(manifest);
  put(target, "manifest.json", JSON.stringify(manifest, null, 2));
  return hash(JSON.stringify(manifest));
}
function put(root: string, path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function copy(name: string) {
  const target = join(directory, name);
  cpSync(artifact, target, { recursive: true });
  return target;
}

function historical(name: string, format: "onzio-pilot-source@1" | "onzio-pilot-source@2", beforeShell = false) {
  const target = copy(name);
  const manifest = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8"));
  const removed = additionalRoots.map(path => `source/${path}`).concat("source/lib/tryouts-page-content.ts");
  if (beforeShell) removed.push("source/components/sites/diverse-city/Shell.tsx", "source/components/sites/diverse-city/RouteLoadingSkeleton.tsx");
  for (const path of removed) rmSync(join(target, path));
  manifest.files = manifest.files.filter((item: {path: string}) => !removed.includes(item.path));
  manifest.platform = manifest.platform.filter((item: {path: string}) => !sharedServices.includes(item.path));
  if (beforeShell) {
    for (const path of ["components/Nav.tsx", "components/Footer.tsx", "components/TemplateFontScope.tsx", "components/AcademyRouteLoadingSkeleton.tsx"]) {
      put(target, `source/${path}`, "export {};");
      manifest.files.push({path: `source/${path}`, sha256: hash("export {};"), bytes: Buffer.byteLength("export {};")});
    }
    manifest.files.sort((a: {path: string}, b: {path: string}) => a.path.localeCompare(b.path));
  }
  const value = format === "onzio-pilot-source@1"
    ? {format, sourceCommit: manifest.sourceCommit, files: manifest.files, platform: manifest.platform, packages: manifest.packages}
    : {...manifest, format};
  put(target, "manifest.json", JSON.stringify(value, null, 2));
  return {directory: target, digest: hash(JSON.stringify(value))};
}

beforeAll(() => {
  const roots = academySourceRoots;
  for (const path of roots) put(source, path, path.endsWith(".css") ? "body { color: navy; }" : "export {};");
  for (const path of sharedServices) put(source, path, 'export const authority = "Current platform service";');
  put(source, "components/sites/diverse-city/AcademyRegistrationPage.tsx", sharedServices.map(path => `import "@/${path.replace(/\.tsx?$/, "")}";`).join("\n"));
  put(source, "components/sites/diverse-city/AcademyTryoutsPage.tsx", 'export { copy } from "@/lib/tryouts-page-content";');
  put(source, "lib/tryouts-page-content.ts", 'export const copy = "Retained tryouts A";');
  put(source, roots[0], 'import "@/components/ClubContextProvider"; export const child = () => import("./Child"); export type ChildType = typeof import("./TypeChild"); import Alias = require("./AliasChild");');
  put(source, "components/sites/diverse-city/TypeChild.ts", 'export const typeChild = "Retained type child";');
  put(source, "components/sites/diverse-city/AliasChild.ts", 'export const aliasChild = "Retained alias child";');
  put(source, "components/sites/diverse-city/Child.tsx", 'export const heading = "Retained A";');
  put(source, "components/ClubContextProvider.tsx", 'export const authority = "Current platform";');
  put(source, "lib/homepage-editor/capabilities.ts", 'export const binding = "legacy@1"; export const semanticBindingRevision = 1;');
  put(source, "public/first-load.png", "retained image bytes");
  put(source, "package-lock.json", JSON.stringify({ packages: Object.fromEntries(["next", "react", "react-dom", "typescript", "tailwindcss", "tailwindcss-animate", "postcss", "autoprefixer"].map(name => [`node_modules/${name}`, { version: "1.0.0" }])) }));
  const lock = JSON.parse(readFileSync(join(source, "package-lock.json"), "utf8"));
  lock.packages["node_modules/next/node_modules/transitive-fixture"] = {
    version: "1.0.0", integrity: "sha512-accepted-fixture", resolved: "https://registry.example.invalid/transitive-fixture-1.0.0.tgz",
  };
  put(source, "package-lock.json", JSON.stringify(lock));
  execFileSync("git", ["init", "--quiet"], { cwd: source });
  execFileSync("git", ["add", "."], { cwd: source });
  execFileSync("git", ["-c", "user.name=Local test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Test platform"], { cwd: source });
  cpSync(source, build, { recursive: true });
  put(build, ".next/BUILD_ID", "test-build-shape");
  put(build, ".next/static/css/layout.css", 'body { src: url(/_next/static/media/font.woff2); }');
  put(build, ".next/static/media/font.woff2", "font byte fixture");
  packageDigest = packPilotSource({ root: source, buildRoot: build, output: artifact }).digest;
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("retained pilot source boundary", () => {
  it.each(additionalRoots)("retains complete Academy root %s and restores A over current B", path => {
    const current = join(directory, `complete-${additionalRoots.indexOf(path)}`);
    cpSync(source, current, { recursive: true });
    put(current, path, 'export const changed = "Visual B";');
    const output = join(directory, `complete-restored-${additionalRoots.indexOf(path)}`);
    reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output });
    expect(readFileSync(join(output, path))).toEqual(readFileSync(join(source, path)));
    const names = verifyPilotSource(artifact, packageDigest).manifest.files.map(item => item.path);
    expect(names).toContain(`source/${path}`);
  });
  it.each(additionalRoots)("rejects a complete package omitting required root %s", path => {
    const damaged = copy(`omitted-root-${additionalRoots.indexOf(path)}`);
    rmSync(join(damaged, "source", path));
    const accepted = rewriteManifest(damaged, manifest => {
      manifest.files = (manifest.files as {path: string}[]).filter(item => item.path !== `source/${path}`);
    });
    expect(() => verifyPilotSource(damaged, accepted)).toThrow();
    const output = join(directory, `omitted-output-${additionalRoots.indexOf(path)}`);
    expect(() => reconstructPilotSource({ root: source, directory: damaged, expectedDigest: accepted, output })).toThrow();
    expect(existsSync(output)).toBe(false);
  });
  it("keeps shared registration and media behavior current while restoring visual copy", () => {
    const current = join(directory, "current-shared-services");
    cpSync(source, current, { recursive: true });
    for (const path of sharedServices) put(current, path, 'export const authority = "Current service B";');
    put(current, "lib/tryouts-page-content.ts", 'export const copy = "Visual B";');
    const output = join(directory, "restored-shared-services");
    reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output });
    for (const path of sharedServices) expect(readFileSync(join(output, path), "utf8")).toContain("Current service B");
    expect(readFileSync(join(output, "lib/tryouts-page-content.ts"), "utf8")).toContain("Retained tryouts A");
    const manifest = verifyPilotSource(artifact, packageDigest).manifest;
    for (const path of sharedServices) {
      expect(manifest.platform.map(item => item.path)).toContain(path);
      expect(manifest.files.map(item => item.path)).not.toContain(`source/${path}`);
    }
  });
  it.each(sharedServices)("rejects an artifact replacing current service %s", path => {
    const damaged = copy(`retained-service-${sharedServices.indexOf(path)}`);
    const value = 'export const authority = "Retained service is forbidden";';
    put(damaged, `source/${path}`, value);
    const accepted = rewriteManifest(damaged, manifest => {
      (manifest.files as {path: string; sha256: string; bytes: number}[]).push({path: `source/${path}`, sha256: hash(value), bytes: Buffer.byteLength(value)});
    });
    expect(() => verifyPilotSource(damaged, accepted)).toThrow("Package cannot replace platform file");
  });

  it("reconstructs a dynamic child from retained A and keeps changed platform authority", () => {
    const current = join(directory, "current");
    cpSync(source, current, { recursive: true });
    put(current, "components/sites/diverse-city/Child.tsx", 'export const heading = "Mutated B";');
    put(current, "components/ClubContextProvider.tsx", 'export const authority = "New denial behavior";');
    const output = join(directory, "reconstructed");
    reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output });
    expect(readFileSync(join(output, "components/sites/diverse-city/Child.tsx"), "utf8")).toContain("Retained A");
    expect(readFileSync(join(output, "components/ClubContextProvider.tsx"), "utf8")).toContain("New denial behavior");
    expect(readFileSync(join(output, "package-lock.json"))).toEqual(readFileSync(join(current, "package-lock.json")));
    expect(verifyPilotSource(artifact, packageDigest).digest).toBe(packageDigest);
    expect(readFileSync(join(output, "components/sites/diverse-city/TypeChild.ts"), "utf8")).toContain("Retained type child");
    expect(readFileSync(join(output, "components/sites/diverse-city/AliasChild.ts"), "utf8")).toContain("Retained alias child");
  });
  it("packs the exact complete lock hash through the real CLI and reconstructs A over current denial B", () => {
    const target = join(directory, "cli-packed");
    const packed = cli(source, ["pack", "--build", build, "--output", target]);
    expect(packed.error).toBeUndefined();
    expect(packed.status).toBe(0);
    const accepted = JSON.parse(packed.stdout).digest;
    const manifest = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8"));
    expect(manifest.format).toBe("onzio-pilot-source@3");
    expect(manifest.packageLockSha256).toBe(hash(readFileSync(join(source, "package-lock.json"))));
    const current = join(directory, "cli-current");
    cpSync(source, current, { recursive: true });
    put(current, "components/sites/diverse-city/Child.tsx", 'export const heading = "Mutated B";');
    put(current, "components/ClubContextProvider.tsx", 'export const authority = "Current denial B";');
    const output = join(directory, "cli-reconstructed");
    const result = cli(current, ["reconstruct", "--package", target, "--digest", accepted, "--output", output]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(join(output, "components/sites/diverse-city/Child.tsx"), "utf8")).toContain("Retained A");
    expect(readFileSync(join(output, "components/ClubContextProvider.tsx"), "utf8")).toContain("Current denial B");
    expect(readFileSync(join(output, "package-lock.json"))).toEqual(readFileSync(join(current, "package-lock.json")));
  });
  it.each(["version", "integrity", "resolved", "metadata", "whitespace"])("rejects complete-lock %s drift through the function and real CLI before output", change => {
    const current = join(directory, `lock-${change}`);
    cpSync(source, current, { recursive: true });
    const bytes = readFileSync(join(current, "package-lock.json"), "utf8");
    const lock = JSON.parse(bytes);
    if (change === "metadata") lock.packages["node_modules/next/node_modules/transitive-fixture"].optional = true;
    else if (change !== "whitespace") lock.packages["node_modules/next/node_modules/transitive-fixture"][change] = "changed-fixture";
    put(current, "package-lock.json", change === "whitespace" ? `${bytes}\n` : JSON.stringify(lock));
    const output = join(directory, `rejected-lock-${change}`);
    expect(() => reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output })).toThrow("Dependency lock differs; compatibility review required");
    expect(existsSync(output)).toBe(false);
    const result = cli(current, ["reconstruct", "--package", artifact, "--digest", packageDigest, "--output", output]);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Dependency lock differs; compatibility review required");
    expect(existsSync(output)).toBe(false);
  });
  it.each(["onzio-pilot-source@2", "onzio-pilot-source@3"].flatMap(format => [undefined, "", "a".repeat(63), "A".repeat(64), "g".repeat(64), 123].map(value => ({format, value}))))("rejects missing or malformed $format lock metadata $value", ({format, value}) => {
    const damaged = copy(`metadata-${format}-${String(value)}`);
    const accepted = rewriteManifest(damaged, manifest => {
      manifest.format = format;
      if (value === undefined) delete manifest.packageLockSha256;
      else manifest.packageLockSha256 = value;
    });
    const output = join(directory, `rejected-metadata-${format}-${String(value)}`);
    expect(() => verifyPilotSource(damaged, accepted)).toThrow();
    expect(() => reconstructPilotSource({ root: source, directory: damaged, expectedDigest: accepted, output })).toThrow();
    const result = cli(source, ["reconstruct", "--package", damaged, "--digest", accepted, "--output", output]);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
  });
  it("rejects an accepted wellformed but incorrect lock hash before output", () => {
    const damaged = copy("wrong-lock-hash");
    const accepted = rewriteManifest(damaged, manifest => { manifest.packageLockSha256 = "0".repeat(64); });
    expect(verifyPilotSource(damaged, accepted).digest).toBe(accepted);
    const output = join(directory, "rejected-wrong-lock-hash");
    expect(() => reconstructPilotSource({ root: source, directory: damaged, expectedDigest: accepted, output })).toThrow("Dependency lock differs");
    const result = cli(source, ["reconstruct", "--package", damaged, "--digest", accepted, "--output", output]);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Dependency lock differs");
    expect(existsSync(output)).toBe(false);
  });
  it("rejects lock metadata substitution under the original accepted digest", () => {
    const damaged = copy("substituted-lock-hash");
    rewriteManifest(damaged, manifest => { manifest.packageLockSha256 = "0".repeat(64); });
    expect(() => verifyPilotSource(damaged, packageDigest)).toThrow("Package digest differs");
  });
  it.each(["onzio-pilot-source@1", "onzio-pilot-source@2"] as const)("preserves %s historical digests and rejects incomplete reconstruction before output", format => {
    const retained = historical(`historical-${format}`, format);
    const original = readFileSync(join(retained.directory, "manifest.json"));
    expect(verifyPilotSource(retained.directory, retained.digest).digest).toBe(retained.digest);
    const verified = cli(source, ["verify", "--package", retained.directory, "--digest", retained.digest]);
    expect(verified.error).toBeUndefined(); expect(verified.status).toBe(0);
    expect(JSON.parse(verified.stdout).verdict).toBe("VERIFIED");
    const output = join(directory, `rejected-${format}`);
    expect(() => reconstructPilotSource({root: source, directory: retained.directory, expectedDigest: retained.digest, output})).toThrow("Regenerate and review a complete Academy source package");
    const result = cli(source, ["reconstruct", "--package", retained.directory, "--digest", retained.digest, "--output", output]);
    expect(result.error).toBeUndefined(); expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Regenerate and review a complete Academy source package");
    expect(existsSync(output)).toBe(false);
    expect(readFileSync(join(retained.directory, "manifest.json"))).toEqual(original);
    expect(verifyPilotSource(retained.directory, retained.digest).digest).toBe(retained.digest);
  });
  it.each(["onzio-pilot-source@1", "onzio-pilot-source@2"] as const)("still verifies pre-Shell %s but refuses full-site reconstruction", format => {
    const earlier = historical(`before-shell-${format}`, format, true);
    expect(verifyPilotSource(earlier.directory, earlier.digest).digest).toBe(earlier.digest);
    const verified = cli(source, ["verify", "--package", earlier.directory, "--digest", earlier.digest]);
    expect(verified.error).toBeUndefined(); expect(verified.status).toBe(0);
    const output = join(directory, `rejected-before-shell-${format}`);
    expect(() => reconstructPilotSource({root: source, directory: earlier.directory, expectedDigest: earlier.digest, output})).toThrow("Regenerate and review a complete Academy source package");
    expect(existsSync(output)).toBe(false);
  });
  it("uses the historical service classification when verifying historical bytes", () => {
    const retained = historical("historical-service", "onzio-pilot-source@2");
    const path = "source/components/registration/SignatureInput.tsx";
    const value = 'export const historical = "This was a retained component";';
    put(retained.directory, path, value);
    const child = "source/components/sites/diverse-city/Child.tsx";
    put(retained.directory, child, 'import "@/components/registration/SignatureInput"; export const heading = "Retained A";');
    const accepted = rewriteManifest(retained.directory, manifest => {
      const files = manifest.files as {path: string; bytes: number; sha256: string}[];
      const entry = files.find(item => item.path === child);
      if (!entry) throw new Error("Historical child fixture missing");
      const bytes = readFileSync(join(retained.directory, child));
      entry.bytes = bytes.length; entry.sha256 = hash(bytes);
      files.push({path, sha256: hash(value), bytes: Buffer.byteLength(value)});
      files.sort((a,b) => a.path.localeCompare(b.path));
    });
    expect(verifyPilotSource(retained.directory, accepted).digest).toBe(accepted);
    const output = join(directory, "historical-service-output");
    expect(() => reconstructPilotSource({root: source, directory: retained.directory, expectedDigest: accepted, output})).toThrow("Regenerate and review");
    expect(existsSync(output)).toBe(false);
  });
  it.each(["next", "react", "react-dom", "typescript"])("rejects a changed implicit framework/build package %s", name => {
    const current = join(directory, `changed-${name}`);
    cpSync(source, current, { recursive: true });
    const lock = JSON.parse(readFileSync(join(current, "package-lock.json"), "utf8"));
    lock.packages[`node_modules/${name}`].version = "2.0.0";
    put(current, "package-lock.json", JSON.stringify(lock));
    expect(() => reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output: join(directory, `rejected-${name}`) })).toThrow("Runtime versions differ; compatibility review required");
  });
  it.each(["source/components/sites/diverse-city/Child.tsx", "emitted/static/media/font.woff2", "source/public/first-load.png"])("rejects missing retained bytes %s", path => {
    const damaged = copy(path.replaceAll("/", "-"));
    rmSync(join(damaged, path));
    expect(() => verifyPilotSource(damaged, packageDigest)).toThrow();
  });
  it("rejects mutation, undeclared files and symlinks", () => {
    const mutated = copy("mutated");
    put(mutated, "source/components/sites/diverse-city/Child.tsx", "export {};");
    expect(() => verifyPilotSource(mutated, packageDigest)).toThrow("differs");
    const extra = copy("extra");
    put(extra, "source/public/untracked.txt", "extra");
    expect(() => verifyPilotSource(extra, packageDigest)).toThrow("Undeclared");
    const symlink = copy("symlink");
    rmSync(join(symlink, "source/public/first-load.png"));
    symlinkSync(join(source, "public/first-load.png"), join(symlink, "source/public/first-load.png"));
    expect(() => verifyPilotSource(symlink, packageDigest)).toThrow("Symlink");
  });
  it("rejects manifest substitution and binding changes", () => {
    expect(() => verifyPilotSource(artifact, "0".repeat(64))).toThrow("digest");
    const current = join(directory, "changed-binding");
    cpSync(source, current, { recursive: true });
    put(current, "lib/homepage-editor/capabilities.ts", 'export const binding = "incompatible@2";');
    expect(() => reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output: join(directory, "rejected") })).toThrow("Binding meaning changed");
  });
  it("requires compatibility review after only the semantic binding revision changes", () => {
    const current = join(directory, "binding-revision-only");
    cpSync(source, current, { recursive: true });
    const path = "lib/homepage-editor/capabilities.ts";
    const original = readFileSync(join(current, path), "utf8");
    put(current, path, original.replace("semanticBindingRevision = 1", "semanticBindingRevision = 2"));
    expect(() => reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output: join(directory, "rejected-binding-revision") })).toThrow("Binding meaning changed");
  });
  it.each([
    'export type Dependency = typeof import("./MissingVisualDependency");',
    'import Dependency = require("./MissingVisualDependency");',
    'const target = "./MissingVisualDependency"; export const child = import(target);',
  ])("rejects omitted source dependency %s", code => {
    const damaged = copy(`missing-form-${code.length}`);
    const path = "source/components/sites/diverse-city/Child.tsx";
    const manifest = verifyPilotSource(damaged).manifest;
    put(damaged, path, code);
    const item = manifest.files.find(value => value.path === path);
    if (!item) throw new Error("Child fixture missing");
    item.bytes = Buffer.byteLength(code);
    item.sha256 = createHash("sha256").update(code).digest("hex");
    put(damaged, "manifest.json", JSON.stringify(manifest));
    expect(() => verifyPilotSource(damaged)).toThrow();
  });
  it("rejects an unclassified dependency rather than retaining platform implementation", () => {
    const damaged = copy("bad-import");
    const path = "source/components/sites/diverse-city/Child.tsx";
    const manifest = verifyPilotSource(damaged).manifest;
    put(damaged, path, 'import "@/lib/supabase-server";');
    const item = manifest.files.find(value => value.path === path);
    if (!item) throw new Error("Child fixture missing");
    item.bytes = readFileSync(join(damaged, path)).length;
    item.sha256 = createHash("sha256").update(readFileSync(join(damaged, path))).digest("hex");
    put(damaged, "manifest.json", JSON.stringify(manifest));
    expect(() => verifyPilotSource(damaged)).toThrow("Missing dependency");
  });
});
