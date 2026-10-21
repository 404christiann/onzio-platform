import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packPilotSource, reconstructPilotSource, verifyPilotSource } from "../../scripts/pilot-source-package";

const directory = mkdtempSync(join(tmpdir(), "onzio-pilot-package-test-"));
const source = join(directory, "platform");
const build = join(directory, "build");
const artifact = join(directory, "retained");
let packageDigest: string;
function put(root: string, path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function copy(name: string) {
  const target = join(directory, name);
  cpSync(artifact, target, { recursive: true });
  return target;
}

beforeAll(() => {
  const roots = ["components/sites/diverse-city/HomePage.tsx", "components/Nav.tsx", "components/Footer.tsx", "components/TemplateFontScope.tsx", "components/AcademyRouteLoadingSkeleton.tsx", "components/ChampionsBadge.tsx", "app/layout.tsx", "styles/globals.css", "tailwind.config.ts", "postcss.config.mjs"];
  for (const path of roots) put(source, path, path.endsWith(".css") ? "body { color: navy; }" : "export {};");
  put(source, roots[0], 'import "@/components/ClubContextProvider"; export const child = () => import("./Child"); export type ChildType = typeof import("./TypeChild"); import Alias = require("./AliasChild");');
  put(source, "components/sites/diverse-city/TypeChild.ts", 'export const typeChild = "Retained type child";');
  put(source, "components/sites/diverse-city/AliasChild.ts", 'export const aliasChild = "Retained alias child";');
  put(source, "components/sites/diverse-city/Child.tsx", 'export const heading = "Retained A";');
  put(source, "components/ClubContextProvider.tsx", 'export const authority = "Current platform";');
  put(source, "lib/homepage-editor/capabilities.ts", 'export const binding = "legacy@1";');
  put(source, "public/first-load.png", "retained image bytes");
  put(source, "package-lock.json", JSON.stringify({ packages: Object.fromEntries(["tailwindcss", "tailwindcss-animate", "postcss", "autoprefixer"].map(name => [`node_modules/${name}`, { version: "1.0.0" }])) }));
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
  it("reconstructs a dynamic child from retained A and keeps changed platform authority", () => {
    const current = join(directory, "current");
    cpSync(source, current, { recursive: true });
    put(current, "components/sites/diverse-city/Child.tsx", 'export const heading = "Mutated B";');
    put(current, "components/ClubContextProvider.tsx", 'export const authority = "New denial behavior";');
    const output = join(directory, "reconstructed");
    reconstructPilotSource({ root: current, directory: artifact, expectedDigest: packageDigest, output });
    expect(readFileSync(join(output, "components/sites/diverse-city/Child.tsx"), "utf8")).toContain("Retained A");
    expect(readFileSync(join(output, "components/ClubContextProvider.tsx"), "utf8")).toContain("New denial behavior");
    expect(verifyPilotSource(artifact, packageDigest).digest).toBe(packageDigest);
    expect(readFileSync(join(output, "components/sites/diverse-city/TypeChild.ts"), "utf8")).toContain("Retained type child");
    expect(readFileSync(join(output, "components/sites/diverse-city/AliasChild.ts"), "utf8")).toContain("Retained alias child");
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
