import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Indexing is decided in exactly one place: lib/robots.ts. No other runtime file
// may set X-Robots-Tag, a `robots` metadata field or a <meta name="robots">.

const root = process.cwd();
const DECIDER = "lib/robots.ts";
const SCANNED_ROOTS = ["middleware.ts", "app", "lib"];
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

const SIGNATURES: ReadonlyArray<readonly [string, RegExp]> = [
  ["X-Robots-Tag header", /x-robots-tag/i],
  ["robots metadata field", /\brobots\s*:/],
  ["robots metadata name", /\bname\s*:\s*["']robots["']/i],
  ["<meta name=\"robots\">", /<meta[^>]*\bname\s*=\s*["']robots["']/i],
];

function walk(path: string): string[] {
  const absolute = resolve(root, path);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return SOURCE.test(path) ? [path] : [];
  }
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : walk(child);
    return SOURCE.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [child] : [];
  });
}

export function findRobotsDeciders(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([path]) => path !== DECIDER)
    .flatMap(([path, text]) =>
      SIGNATURES.filter(([, pattern]) => pattern.test(text)).map(([label]) => `${path}: ${label}`),
    );
}

function readTree(): Record<string, string> {
  return Object.fromEntries(
    SCANNED_ROOTS.flatMap(walk).map((path) => [path, readFileSync(resolve(root, path), "utf8")]),
  );
}

describe("a single robots decider", () => {
  it("scans the files that can set a robots policy", () => {
    const tree = readTree();
    expect(Object.keys(tree)).toEqual(expect.arrayContaining(["middleware.ts", DECIDER, "app/robots.ts"]));
  });

  it("only lib/robots.ts sets X-Robots-Tag, robots metadata or a robots meta tag", () => {
    expect(findRobotsDeciders(readTree())).toEqual([]);
  });

  it("the decider itself is the one place that sets the header", () => {
    expect(readTree()[DECIDER]).toMatch(/X-Robots-Tag/);
  });

  describe("goes red when a second decider is planted", () => {
    const planted: ReadonlyArray<readonly [string, string, string]> = [
      ["middleware header", "middleware.ts", 'response.headers.set("X-Robots-Tag", "noindex");'],
      ["lowercase header", "lib/other.ts", 'headers.set("x-robots-tag", "all");'],
      ["metadata field", "app/layout.tsx", 'export const metadata = { robots: { index: false } };'],
      ["metadata name", "app/page.tsx", 'other: { name: "robots", content: "noindex" }'],
      ["meta tag", "app/head.tsx", '<meta name="robots" content="noindex" />'],
    ];

    it.each(planted)("%s", (_label, path, text) => {
      const tree = { ...readTree(), [path]: `${readTree()[path] ?? ""}\n${text}\n` };
      expect(findRobotsDeciders(tree)).not.toEqual([]);
    });

    it("a real file planted on disk is found by the scan, then removed", () => {
      const directory = resolve(root, "lib/__planted_robots__");
      const file = join(directory, "second-decider.ts");
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(file, 'export const bad = (r: Response) => r.headers.set("X-Robots-Tag", "noindex");\n');
        expect(findRobotsDeciders(readTree())).toEqual([
          `${relative(root, file)}: X-Robots-Tag header`,
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
      expect(findRobotsDeciders(readTree())).toEqual([]);
    });
  });
});
