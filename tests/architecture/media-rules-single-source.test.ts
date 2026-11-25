import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// UPLOAD-AUDIT: admin image upload limits live in lib/media-rules.ts and nowhere else. Client hints and
// pickers, the authorize schema and route, finalize validation and sharp processing all import them, so a
// field can no longer promise a file the server refuses (the "Images must be under 15 MB" graphic message,
// the 3000-pixel hints and the JPG-accepting graphic pickers were all copies that drifted).

const root = resolve(process.cwd());
const SCANNED = ["app", "components", "lib"];
const SOURCE = /\.(ts|tsx)$/;
const RULES_MODULE = "lib/media-rules.ts";
// Generated database types echo column comments, not limits.
const SKIPPED = new Set([RULES_MODULE, "lib/database.generated.ts", "lib/db-types.ts"]);
// Each entry exempts one file for a stated reason; anything not listed must import the rules.
const ALLOWED: { file: string; why: string }[] = [
  { file: "lib/bunny-thumbnail.ts", why: "Bunny Stream's own 5 MB video-thumbnail limit, not an admin image upload" },
];

function files(directory: string): string[] {
  let entries: string[];
  try { entries = readdirSync(directory); } catch { return []; }
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" || entry === "__tests__" ? [] : files(path);
    return SOURCE.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

const relative = (path: string) => path.slice(root.length + 1).replaceAll("\\", "/");
const sources = () =>
  SCANNED.flatMap((directory) => files(join(root, directory)))
    .map((path) => ({ file: relative(path), text: readFileSync(path, "utf8") }))
    .filter(({ file }) =>
      !SKIPPED.has(file) &&
      !ALLOWED.some((entry) => entry.file === file));

/** Each match is reported as file:line: snippet so a failure says exactly what to move into the rules module. */
function offenders(pattern: RegExp, within: (file: string) => boolean = () => true): string[] {
  const found: string[] = [];
  for (const { file, text } of sources()) {
    if (!within(file)) continue;
    text.split("\n").forEach((line, index) => {
      if (pattern.test(line)) found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  return found;
}

/** Files on the upload pipeline itself: authorize, finalize, validation and processing. */
const PIPELINE = (file: string) =>
  file.startsWith("app/api/admin/media/") ||
  /^lib\/media-(api-contract|validation|processing|diagnostics|finalize-errors|upload-types)\.ts$/.test(file);

describe("admin image upload limits have one source", () => {
  it("no byte limit for an image upload is written outside lib/media-rules.ts", () => {
    expect(offenders(/\b(5|15)\s*\*\s*1024\s*\*\s*1024\b|\b(5_?242_?880|15_?728_?640)\b/)).toEqual([]);
  });

  it("no image size limit is written into copy outside lib/media-rules.ts", () => {
    expect(offenders(/\b(5|15)\s?MB\b/)).toEqual([]);
  });

  it("no image pixel limit is written into copy or code outside lib/media-rules.ts", () => {
    expect(offenders(/\b(3000|6000)\s*(pixels|px)\b|\b36_?000_?000\b/)).toEqual([]);
  });

  it("no image type list is written into copy outside lib/media-rules.ts", () => {
    // Case-sensitive on purpose: copy says "PNG or WebP"; MIME strings ("image/png") are lower case.
    expect(offenders(/\b(PNG|JPE?G)\b.*\bWebP\b|\bWebP\b.*\b(PNG|JPE?G)\b/)).toEqual([]);
  });

  it("no upload field writes its own accepted types", () => {
    expect(offenders(/accept=\{?["'`]image\/|allowedTypes(=\{|:)\s*\[/)).toEqual([]);
  });

  it("the upload pipeline reads dimensions, output size and decode strictness from the rules", () => {
    expect(offenders(/\b(6000|2400)\b|failOn:\s*["']/, PIPELINE)).toEqual([]);
  });

  it("the upload pipeline imports the rules module", () => {
    for (const file of ["lib/media-api-contract.ts", "lib/media-validation.ts", "lib/media-processing.ts", "lib/media-diagnostics.ts", "lib/media-finalize-errors.ts", "lib/media-upload-types.ts"]) {
      expect(readFileSync(join(root, file), "utf8"), file).toContain('from "@/lib/media-rules"');
    }
  });

  it("catches a limit written outside the rules module (self-check)", () => {
    const pattern = /\b(5|15)\s*\*\s*1024\s*\*\s*1024\b/;
    expect(pattern.test("maxBytes={5 * 1024 * 1024}")).toBe(true);
    expect(/\b(5|15)\s?MB\b/.test("PNG or WebP up to 5 MB")).toBe(true);
    expect(/\b(3000|6000)\s*(pixels|px)\b/.test("up to 3000 pixels per side")).toBe(true);
    expect(/\b(PNG|JPE?G)\b.*\bWebP\b/.test("Choose a PNG or WebP logo.")).toBe(true);
    expect(/\b(PNG|JPE?G)\b.*\bWebP\b/.test('allowedTypes={["image/png", "image/webp"]}')).toBe(false);
    expect(/accept=\{?["'`]image\//.test('accept="image/*"')).toBe(true);
  });
});
