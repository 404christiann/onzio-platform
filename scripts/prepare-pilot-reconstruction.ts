import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "dotenv";
import { reconstructPilotSource, verifyPilotSource } from "./pilot-source-package";

const { values } = parseArgs({ options: { package: { type: "string" }, digest: { type: "string" } } });
assert(values.package && values.digest, "Use --package and --digest");
const artifact = resolve(values.package);
const { manifest } = verifyPilotSource(artifact, values.digest);
const root = process.cwd();
assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit tracked changes first");
const environment = parse(readFileSync(join(root, ".env.local")));
assert.equal(new URL(environment.NEXT_PUBLIC_SUPABASE_URL ?? "").origin, "http://127.0.0.1:54321", "Only local synthetic Supabase is supported");
assert(!Object.values(environment).some(value => value.startsWith("sk_live_")), "Live provider credentials are forbidden");
const output = mkdtempSync(join(tmpdir(), "onzio-pilot-reconstruction-"));
const current = join(output, "platform-b");
mkdirSync(current);
const archive = execFileSync("git", ["archive", "HEAD"], { cwd: root, maxBuffer: 100 * 1024 * 1024 });
execFileSync("tar", ["-x", "-C", current], { input: archive });
function replace(path: string, before: string, after: string) {
  const target = join(current, path);
  const source = readFileSync(target, "utf8");
  assert.equal(source.split(before).length, 2, `Mutation contract changed: ${path}`);
  writeFileSync(target, source.replace(before, after));
}
replace("components/sites/diverse-city/HomePage.tsx", "<Hero initialContent=", '<p data-pilot-mutation="visual-b">Unretained visual B</p>\n      <Hero initialContent=');
replace("app/layout.tsx", "const academyHeading = Montserrat({", "const academyHeading = Geist({");
replace("app/api/admin/homepage/route.ts", 'headers: { "Cache-Control": "no-store" },', 'headers: { "Cache-Control": "no-store", "X-Pilot-Platform-Revision": "current-platform-b" },');
const stylesheet = join(current, "styles/globals.css");
writeFileSync(stylesheet, `${readFileSync(stylesheet, "utf8")}\n[data-font-pack="academy"] main h1 { color: rgb(1, 2, 3) !important; }\n`);
copyFileSync(join(current, "public/images/shop/rosecityshirt2.jpeg"), join(current, "public/images/shop/rosecityshirt1.webp"));
execFileSync("git", ["init", "--quiet"], { cwd: current });
execFileSync("git", ["add", "."], { cwd: current });
execFileSync("git", ["-c", "user.name=Local reconstruction", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Local visual and platform controls"], { cwd: current });
const restored = reconstructPilotSource({ root: current, directory: artifact, expectedDigest: values.digest, output: join(output, "restored-a") });
for (const directory of [current, restored.directory]) {
  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"));
  copyFileSync(join(root, ".env.local"), join(directory, ".env.local"));
}
const font = manifest.files.find(item => item.path.startsWith("emitted/static/media/") && item.path.endsWith(".woff2"));
assert(font);
const failures: string[] = [];
for (const path of ["source/components/Hero.tsx", font.path, "source/public/images/shop/rosecityshirt1.webp"]) {
  const broken = join(output, "broken");
  try {
    cpSync(artifact, broken, { recursive: true });
    rmSync(join(broken, path));
    assert.throws(() => verifyPilotSource(broken, values.digest), `Missing retained file accepted: ${path}`);
    failures.push(path);
  } finally { rmSync(broken, { recursive: true, force: true }); }
}
const report = { artifact, digest: values.digest, sourceCommit: manifest.sourceCommit,
  currentPlatformCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  changed: current, restored: restored.directory, rejectedMissingFiles: failures,
  limits: ["Setup only; build both copies and run the browser rehearsal before acceptance.", "Local environment files remain private in this temporary directory."] };
writeFileSync(join(output, "setup.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ setup: join(output, "setup.json"), changed: current, restored: restored.directory }));
