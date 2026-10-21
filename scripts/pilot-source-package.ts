import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { z } from "zod";

const roots = [
  "components/sites/diverse-city/HomePage.tsx", "components/Nav.tsx", "components/Footer.tsx",
  "components/TemplateFontScope.tsx", "components/AcademyRouteLoadingSkeleton.tsx",
  "components/ChampionsBadge.tsx", "app/layout.tsx", "styles/globals.css",
  "tailwind.config.ts", "postcss.config.mjs",
];
const platform = new Set([
  "components/ClubContextProvider.tsx", "components/ClubBrandingProvider.tsx",
  "lib/queries.ts", "lib/db-types.ts", "lib/database.generated.ts",
  "lib/homepage-editor/preview-context.tsx", "lib/homepage-editor/model.ts",
  "lib/image-delivery.ts", "lib/media-url.ts", "lib/storage-path.ts",
  "lib/contract-error.ts", "packages/presentation/index.ts",
]);
const visualLibraries = new Set([
  "lib/academy-page-scroll-lock.ts", "lib/academy-loading-route.ts", "lib/bunny-video.ts", "lib/data.ts",
  "lib/homepage-content.ts", "lib/homepage-story-content.ts", "lib/programs-page-content.ts",
  "lib/shop-kit.ts", "lib/site-flags.ts", "lib/social-links.ts", "lib/standings-content.ts",
  "lib/use-bounded-academy-loading.ts",
]);
const bindingPath = "lib/homepage-editor/capabilities.ts";
const entrySchema = z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict();
const manifestSchema = z.object({
  format: z.literal("onzio-pilot-source@1"), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  files: z.array(entrySchema).min(1), platform: z.array(entrySchema),
  packages: z.record(z.string(), z.string()),
}).strict();
export type PilotSourceManifest = z.infer<typeof manifestSchema>;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function safePath(path: string) {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error(`Unsafe package path: ${path}`);
  return path;
}
function file(root: string, path: string) {
  safePath(path);
  let cursor = root;
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink refused: ${path}`);
  }
  if (!lstatSync(cursor).isFile()) throw new Error(`Regular file required: ${path}`);
  return readFileSync(cursor);
}
function inventory(root: string, directory: string): string[] {
  const path = join(root, directory);
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw new Error(`Directory required: ${directory}`);
  return readdirSync(path).sort().flatMap(name => {
    const child = `${directory}/${name}`;
    const stat = lstatSync(join(root, child));
    if (stat.isSymbolicLink()) throw new Error(`Symlink refused: ${child}`);
    return stat.isDirectory() ? inventory(root, child) : [child];
  });
}
function visual(path: string) {
  return roots.includes(path) || visualLibraries.has(path) || path.startsWith("components/") && !path.startsWith("components/admin/") && !platform.has(path);
}
function localImport(from: string, specifier: string) {
  const path = specifier.startsWith("@/") ? specifier.slice(2) : specifier.startsWith(".") ? relative(".", join(dirname(from), specifier)).split(sep).join("/") : null;
  return path === null ? null : safePath(path);
}
function graph(root: string) {
  const owned = new Set<string>();
  const shared = new Set<string>();
  const packages = new Set<string>(["tailwindcss", "tailwindcss-animate", "postcss", "autoprefixer"]);
  function visit(path: string) {
    if (platform.has(path)) { shared.add(path); return; }
    if (!visual(path)) throw new Error(`Unclassified visual dependency: ${path}`);
    if (owned.has(path)) return;
    const content = file(root, path).toString("utf8");
    owned.add(path);
    if (path.endsWith(".css")) {
      if (/@import\b|url\s*\(/i.test(content)) throw new Error(`CSS dependency needs an explicit root: ${path}`);
      return;
    }
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    function imported(specifier: string) {
      const local = localImport(path, specifier);
      if (local === null) {
        const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (!name || name.startsWith("node:")) throw new Error(`Unsupported runtime import: ${specifier}`);
        packages.add(name);
        return;
      }
      const resolved = [local, `${local}.ts`, `${local}.tsx`, `${local}/index.ts`, `${local}/index.tsx`].find(candidate => platform.has(candidate) || existsSync(join(root, candidate)) && lstatSync(join(root, candidate)).isFile());
      if (!resolved) throw new Error(`Missing dependency ${specifier} in ${path}`);
      visit(resolved);
    }
    function scan(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error(`Literal import required: ${path}`);
        imported(node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const argument = node.arguments[0];
        if (node.arguments.length !== 1 || !argument || !ts.isStringLiteral(argument)) throw new Error(`Literal dynamic import required: ${path}`);
        imported(argument.text);
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
  }
  roots.forEach(visit);
  return { owned: [...owned].sort(), shared: [...shared].sort(), packages: [...packages].sort() };
}
function versions(root: string, names: string[]) {
  const lock = z.object({ packages: z.record(z.string(), z.object({ version: z.string().optional() })) }).parse(JSON.parse(file(root, "package-lock.json").toString("utf8")));
  return Object.fromEntries(names.map(name => {
    const version = lock.packages[`node_modules/${name}`]?.version;
    if (!version) throw new Error(`Missing locked runtime: ${name}`);
    return [name, version];
  }));
}
function newOutput(root: string, output: string) {
  const target = resolve(output);
  if (existsSync(target)) throw new Error("Output must be a new directory");
  const parent = realpathSync(dirname(target));
  const local = relative(realpathSync(root), join(parent, target.split(sep).at(-1) ?? ""));
  const temporary = relative(realpathSync(tmpdir()), parent);
  const ignored = !local.startsWith("..") && !isAbsolute(local) && (() => {
    try { execFileSync("git", ["check-ignore", "--quiet", "--", local], { cwd: root }); return true; } catch { return false; }
  })();
  if (!ignored && (temporary.startsWith("..") || isAbsolute(temporary))) throw new Error("Output must be temporary or gitignored");
  mkdirSync(target);
  return target;
}
function entry(root: string, path: string) {
  const bytes = file(root, path);
  return { path, bytes: bytes.length, sha256: digest(bytes) };
}
function save(root: string, source: string, output: string, target: string) {
  const bytes = file(root, source);
  mkdirSync(dirname(join(output, target)), { recursive: true });
  writeFileSync(join(output, target), bytes);
  return { path: target, bytes: bytes.length, sha256: digest(bytes) };
}
export function packPilotSource({ root, buildRoot, output }: { root: string; buildRoot: string; output: string }) {
  const sourceGraph = graph(root);
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim()) throw new Error("Commit tracked changes before packaging");
  for (const path of [...sourceGraph.owned, ...sourceGraph.shared, bindingPath, "package-lock.json"]) {
    if (!file(root, path).equals(file(buildRoot, path))) throw new Error(`Build input differs: ${path}`);
  }
  file(buildRoot, ".next/BUILD_ID");
  const css = inventory(buildRoot, ".next/static/css");
  const media = inventory(buildRoot, ".next/static/media");
  if (!css.length || !media.some(path => path.endsWith(".woff2"))) throw new Error("Built CSS and fonts are required");
  const target = newOutput(root, output);
  try {
    const files = [
      ...sourceGraph.owned.map(path => save(root, path, target, `source/${path}`)),
      save(root, bindingPath, target, `bindings/${bindingPath}`),
      ...inventory(root, "public").map(path => save(root, path, target, `source/${path}`)),
      ...[...css, ...media].map(path => save(buildRoot, path, target, `emitted/${path.slice(6)}`)),
    ].sort((a, b) => a.path.localeCompare(b.path));
    const manifest = manifestSchema.parse({ format: "onzio-pilot-source@1", sourceCommit, files,
      platform: sourceGraph.shared.map(path => entry(root, path)), packages: versions(root, sourceGraph.packages) });
    writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return { directory: target, digest: digest(JSON.stringify(manifest)), files: files.length };
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error; }
}
export function verifyPilotSource(directory: string, expectedDigest?: string) {
  const root = realpathSync(directory);
  const manifest = manifestSchema.parse(JSON.parse(file(root, "manifest.json").toString("utf8")));
  if (expectedDigest && digest(JSON.stringify(manifest)) !== expectedDigest) throw new Error("Package digest differs");
  const names = new Set<string>();
  for (const item of manifest.files) {
    safePath(item.path);
    if (names.has(item.path)) throw new Error(`Duplicate package file: ${item.path}`);
    names.add(item.path);
    const allowed = item.path.startsWith("source/public/") || item.path.startsWith("source/") && visual(item.path.slice(7)) || item.path === `bindings/${bindingPath}` || /^emitted\/static\/(css|media)\/[^/]+$/.test(item.path);
    if (!allowed) throw new Error(`Package cannot replace platform file: ${item.path}`);
    const bytes = file(root, item.path);
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error(`Package file differs: ${item.path}`);
  }
  const actual = readdirSync(root).sort().flatMap(name => name === "manifest.json" ? [] : inventory(root, name));
  if (actual.length !== names.size || actual.some(path => !names.has(path))) throw new Error("Undeclared package file");
  if (![...names].some(path => path.startsWith("emitted/static/css/")) || ![...names].some(path => path.startsWith("emitted/static/media/") && path.endsWith(".woff2"))) throw new Error("Built CSS and fonts are required");
  for (const path of names) {
    if (!path.startsWith("emitted/static/css/")) continue;
    const css = file(root, path).toString("utf8");
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      const url = match[1];
      if (url.startsWith("data:")) continue;
      const target = url.startsWith("/_next/") ? `emitted/${url.slice(7)}` : url.startsWith("/") ? `source/public${url}` : join(dirname(path), url).split(sep).join("/");
      if (!names.has(target)) throw new Error(`Missing emitted CSS dependency: ${target}`);
    }
  }
  const sourceGraph = graph(join(root, "source"));
  const expected = [...sourceGraph.owned.map(path => `source/${path}`), `bindings/${bindingPath}`];
  if (expected.some(path => !names.has(path)) || [...names].some(path => path.startsWith("source/") && !path.startsWith("source/public/") && !expected.includes(path))) throw new Error("Incomplete source graph");
  if (JSON.stringify(sourceGraph.shared) !== JSON.stringify(manifest.platform.map(item => item.path).sort())) throw new Error("Platform boundary differs");
  if (JSON.stringify(sourceGraph.packages) !== JSON.stringify(Object.keys(manifest.packages).sort())) throw new Error("Runtime dependency inventory differs");
  return { manifest, digest: digest(JSON.stringify(manifest)) };
}
export function reconstructPilotSource({ root, directory, expectedDigest, output }: { root: string; directory: string; expectedDigest: string; output: string }) {
  const { manifest } = verifyPilotSource(directory, expectedDigest);
  if (JSON.stringify(versions(root, Object.keys(manifest.packages))) !== JSON.stringify(manifest.packages)) throw new Error("Runtime versions differ; compatibility review required");
  if (!file(root, bindingPath).equals(file(directory, `bindings/${bindingPath}`))) throw new Error("Binding meaning changed; migration review required");
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const target = newOutput(root, output);
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(target, path)), { recursive: true });
      writeFileSync(join(target, path), file(root, path));
    }
    for (const item of manifest.files.filter(item => item.path.startsWith("source/"))) {
      const path = item.path.slice(7);
      mkdirSync(dirname(join(target, path)), { recursive: true });
      copyFileSync(join(directory, item.path), join(target, path));
    }
    for (const item of manifest.platform) {
      if (!file(root, item.path).equals(file(target, item.path))) throw new Error(`Current platform changed: ${item.path}`);
    }
    return { directory: target, sourceCommit: manifest.sourceCommit, digest: expectedDigest };
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error; }
}
