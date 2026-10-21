import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packPilotSource } from "../../scripts/pilot-source-package";

const project = resolve(import.meta.dirname, "../..");
const directory = mkdtempSync(join(tmpdir(), "onzio-pilot-environment-test-"));
const source = join(directory, "source");
const artifact = join(directory, "retained");
const loader = createRequire(import.meta.url).resolve("tsx");
const localUrl = "http://127.0.0.1:54321";
let packageDigest: string;
let sequence = 0;
function put(root: string, path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function prepare(options: { file?: Record<string, string>; shell?: Record<string, string>; production?: Record<string, string> } = {}) {
  const root = join(directory, `case-${sequence++}`);
  cpSync(source, root, { recursive: true });
  const serialize = (values: Record<string, string>) => Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n");
  put(root, ".env.local", serialize({ NEXT_PUBLIC_SUPABASE_URL: localUrl, ...options.file }));
  if (options.production) put(root, ".env.production.local", serialize(options.production));
  const output = join(root, "output");
  mkdirSync(output);
  const result = spawnSync(process.execPath, ["--import", loader, join(project, "scripts/prepare-pilot-reconstruction.ts"), "--package", artifact, "--digest", packageDigest], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: output, NODE_ENV: "production", ...options.shell },
  });
  return { ...result, output };
}
function expectRejected(options: Parameters<typeof prepare>[0], reason: string, marker: string) {
  const result = prepare(options);
  expect(result.error).toBeUndefined();
  expect(`${result.stdout}${result.stderr}`).not.toContain(marker);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(reason);
  expect(readdirSync(result.output).filter(name => name.startsWith("onzio-pilot-reconstruction-"))).toEqual([]);
}

beforeAll(() => {
  const roots = ["components/sites/diverse-city/HomePage.tsx", "components/Nav.tsx", "components/Footer.tsx", "components/TemplateFontScope.tsx", "components/AcademyRouteLoadingSkeleton.tsx", "components/ChampionsBadge.tsx", "app/layout.tsx", "styles/globals.css", "tailwind.config.ts", "postcss.config.mjs"];
  for (const path of roots) put(source, path, path.endsWith(".css") ? "body { color: navy; }" : "export {};");
  put(source, roots[0], 'import Hero from "@/components/Hero"; export default function Page() { return <Hero initialContent={{}} />; }');
  put(source, "components/Hero.tsx", 'export default function Hero() { return null; }');
  put(source, "app/layout.tsx", "const academyHeading = Montserrat({});");
  put(source, "app/api/admin/homepage/route.ts", 'export const reply = { headers: { "Cache-Control": "no-store" }, };');
  put(source, "lib/homepage-editor/capabilities.ts", 'export const binding = "legacy@1";');
  put(source, "public/images/shop/rosecityshirt1.webp", "retained kit image");
  put(source, "public/images/shop/rosecityshirt2.jpeg", "changed kit image");
  put(source, ".gitignore", ".env*\nnode_modules\noutput\n");
  put(source, "package-lock.json", JSON.stringify({ packages: Object.fromEntries(["next", "react", "react-dom", "typescript", "tailwindcss", "tailwindcss-animate", "postcss", "autoprefixer"].map(name => [`node_modules/${name}`, { version: "1.0.0" }])) }));
  execFileSync("git", ["init", "--quiet"], { cwd: source });
  execFileSync("git", ["add", "."], { cwd: source });
  execFileSync("git", ["-c", "user.name=Local test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Synthetic reconstruction input"], { cwd: source });
  symlinkSync(join(project, "node_modules"), join(source, "node_modules"));
  const build = join(directory, "build");
  cpSync(source, build, { recursive: true });
  put(build, ".next/BUILD_ID", "synthetic-build-format");
  put(build, ".next/static/css/layout.css", 'body { src: url(/_next/static/media/font.woff2); }');
  put(build, ".next/static/media/font.woff2", "synthetic font bytes");
  packageDigest = packPilotSource({ root: source, buildRoot: build, output: artifact }).digest;
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("pilot preparation environment boundary", () => {
  it("prepares local synthetic controls with safe environment values", () => {
    const result = prepare({ file: { STRIPE_SECRET_KEY: "sk_test_inert_reconstruction_fixture" } });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(readdirSync(result.output).filter(name => name.startsWith("onzio-pilot-reconstruction-"))).toHaveLength(1);
    expect(result.stdout).toContain('"restored":');
  });
  it.each(["sk_live_", "rk_live_"])("rejects inert %s credentials from the local file", prefix => {
    const marker = "inert_file_credential_marker";
    expectRejected({ file: { STRIPE_SECRET_KEY: `${prefix}${marker}` } }, "Live provider credentials are forbidden", marker);
  });
  it.each(["sk_live_", "rk_live_"])("rejects inert %s credentials exported by the shell", prefix => {
    const marker = "inert_shell_credential_marker";
    expectRejected({ shell: { STRIPE_SECRET_KEY: `${prefix}${marker}` } }, "Live provider credentials are forbidden", marker);
  });
  it("rejects an unsafe file credential even when a safe shell value masks it", () => {
    const marker = "inert_masked_file_credential_marker";
    expectRejected({ file: { STRIPE_SECRET_KEY: `rk_live_${marker}` }, shell: { STRIPE_SECRET_KEY: "sk_test_inert_safe_override" } }, "Live provider credentials are forbidden", marker);
  });
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_TEST_URL", "SUPABASE_DB_URL", "SUPABASE_TEST_DATABASE_URL", "DATABASE_URL"])("rejects nonlocal shell target %s without exposing its value", name => {
    const marker = "inert_hosted_target_marker";
    const value = name.includes("DATABASE") || name.includes("_DB_") ? `postgresql://test:${marker}@database.example.invalid:5432/postgres` : `https://${marker}.example.invalid`;
    expectRejected({ shell: { [name]: value } }, "Only local synthetic Supabase is supported", marker);
  });
  it("rejects a production dotenv target overriding the local file", () => {
    const marker = "inert_production_dotenv_marker";
    expectRejected({ production: { NEXT_PUBLIC_SUPABASE_URL: `https://${marker}.example.invalid` } }, "Only local synthetic Supabase is supported", marker);
  });
  it("rejects a nonlocal target after dotenv variable expansion", () => {
    const marker = "inert_expansion_target_marker";
    expectRejected({ file: { NEXT_PUBLIC_SUPABASE_URL: "$PILOT_TARGET" }, shell: { PILOT_TARGET: `https://${marker}.example.invalid` } }, "Only local synthetic Supabase is supported", marker);
  });
  it("rejects a malformed target without printing its credential marker", () => {
    const marker = "inert_malformed_target_marker";
    expectRejected({ file: { NEXT_PUBLIC_SUPABASE_URL: `malformed-${marker}` } }, "Only local synthetic Supabase is supported", marker);
  });
});
