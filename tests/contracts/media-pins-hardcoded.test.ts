import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// RC-ADMIN-10d: the orphan-media sweep must never retire a file that app code names directly.
// Such files have no content row pointing at them, so they are protected by a row in
// onzio_private.media_pins. This test finds every hard-coded onzio-media file in app code and
// fails when one is not seeded in the migration's media_pins insert.
//
// How a path is matched. A published media path is <club-uuid>/<surface>/<file-uuid>.<ext>.
// App code writes it in two ways, and both are resolved:
//   1. Complete:  ".../onzio-media/<club-uuid>/<surface>/<file-uuid>.<ext>"
//   2. Split:     a base constant  ".../onzio-media/<club-uuid>/<surface>"  (for example
//                 MIGRATED_LOGO_BASE or ROSE_CITY_FLAG_BASE) plus bare "<file-uuid>.<ext>"
//                 literals elsewhere in the same file.
// For a split file, each bare file literal is paired with the file's base. A file with bare file
// literals and more than one base, or none, fails the test, because the pairing would be a guess;
// the fix is to make the base explicit or to extend this test. Test, script and generated files
// are not scanned; neither are literals that are not UUID file names.

const ROOT = process.cwd();
const SCAN_ROOTS = ["app", "components", "lib", "packages"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXT = "(?:webp|png|jpe?g)";
const SURFACE = "[a-z][a-z0-9-]{0,63}";
const COMPLETE = new RegExp(`onzio-media/(${UUID})/(${SURFACE})/(${UUID}\\.${EXT})`, "g");
const BASE = new RegExp(`onzio-media/(${UUID})/(${SURFACE})(?![/\\w-])`, "g");
const FILE = new RegExp(`(?<![\\w-])(${UUID}\\.${EXT})(?![\\w])`, "g");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(resolve(ROOT, dir));
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
    if (statSync(resolve(ROOT, path)).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry) && !/\.(test|spec)\.|database\.generated/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

function hardCodedMediaPaths(): { paths: string[]; problems: string[] } {
  const paths = new Set<string>();
  const problems: string[] = [];
  for (const file of SCAN_ROOTS.flatMap(sourceFiles)) {
    const text = readFileSync(resolve(ROOT, file), "utf8");
    const bases = new Set<string>();
    for (const m of text.matchAll(BASE)) bases.add(`${m[1]}/${m[2]}`);
    const complete = new Set<string>();
    for (const m of text.matchAll(COMPLETE)) {
      complete.add(m[3]);
      paths.add(`${m[1]}/${m[2]}/${m[3]}`);
    }
    const bare = [...text.matchAll(FILE)].map((m) => m[1]).filter((name) => !complete.has(name));
    if (!bare.length) continue;
    if (bases.size !== 1) {
      problems.push(`${relative(ROOT, resolve(ROOT, file))}: ${bare.length} media file name(s) and ${bases.size} onzio-media base(s); cannot pair them`);
      continue;
    }
    const [base] = [...bases];
    for (const name of bare) paths.add(`${base}/${name}`);
  }
  return { paths: [...paths].sort(), problems };
}

function seededPins(): string[] {
  const migration = readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => /_media_orphan_sweep\.sql$/.test(f));
  expect(migration).toHaveLength(1);
  const sql = readFileSync(resolve(ROOT, "supabase/migrations", migration[0]), "utf8");
  const block = sql.slice(sql.indexOf("insert into onzio_private.media_pins"), sql.indexOf("on conflict do nothing"));
  const club = block.match(new RegExp(`'(${UUID})/' \\|\\| p\\.path`))?.[1];
  expect(club, "the seed prefixes every path with one club id").toBeTruthy();
  return [...block.matchAll(new RegExp(`\\('((?:[a-z][a-z0-9-]*)/${UUID}\\.${EXT})'`, "g"))].map((m) => `${club}/${m[1]}`).sort();
}

describe("hard-coded onzio-media files are pinned", () => {
  it("pairs every hard-coded file name with a base unambiguously", () => {
    expect(hardCodedMediaPaths().problems).toEqual([]);
  });

  it("finds exactly the 14 Rose City files (6 flags in lib/flags.ts, 8 logos in components/Nav.tsx)", () => {
    const { paths } = hardCodedMediaPaths();
    expect(paths).toHaveLength(14);
    expect(paths.filter((p) => p.includes("/flags/"))).toHaveLength(6);
    expect(paths.filter((p) => p.includes("/branding/"))).toHaveLength(8);
    expect(new Set(paths.map((p) => p.split("/")[0]))).toEqual(new Set(["32ceba0b-4e25-52c2-bb6b-d82fb87637a7"]));
  });

  it("seeds every one of them in media_pins", () => {
    const { paths } = hardCodedMediaPaths();
    const pins = seededPins();
    expect(paths.filter((p) => !pins.includes(p)), "hard-coded but not pinned: add to the media_pins insert (a new migration for a new file)").toEqual([]);
    expect(pins.filter((p) => !paths.includes(p)), "pinned but no longer hard-coded").toEqual([]);
  });
});
