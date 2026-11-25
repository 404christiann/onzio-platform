import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Indexing is decided in exactly one place: lib/robots.ts. No other runtime file
// may set X-Robots-Tag, a `robots` metadata field or a <meta name="robots">.

const REPO_ROOT = process.cwd();
const DECIDER = "lib/robots.ts";
const SCANNED_ROOTS = ["middleware.ts", "app", "lib"];
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

const SIGNATURES: ReadonlyArray<readonly [string, RegExp]> = [
  ["X-Robots-Tag header", /x-robots-tag/i],
  ["robots metadata field", /\brobots\s*:/],
  ["robots metadata name", /\bname\s*:\s*["']robots["']/i],
  ["<meta name=\"robots\">", /<meta[^>]*\bname\s*=\s*["']robots["']/i],
];

function walk(root: string, path: string): string[] {
  const absolute = resolve(root, path);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return SOURCE.test(path) ? [path] : [];
  }
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : walk(root, child);
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

// The scan is rooted so a test can point it at a temporary tree. Never plant files inside the repo:
// the other architecture tests walk app/, components/ and lib/ in parallel worker threads.
function readTree(root: string = REPO_ROOT): Record<string, string> {
  return Object.fromEntries(
    SCANNED_ROOTS.flatMap((scanned) => walk(root, scanned)).map((path) => [
      path,
      readFileSync(resolve(root, path), "utf8"),
    ]),
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
      const temporary = mkdtempSync(join(tmpdir(), "robots-planted-"));
      const write = (path: string, text: string) => {
        mkdirSync(dirname(join(temporary, path)), { recursive: true });
        writeFileSync(join(temporary, path), text);
      };
      try {
        write("middleware.ts", "export const middleware = () => undefined;\n");
        write("lib/robots.ts", 'export const decide = (r: Response) => r.headers.set("X-Robots-Tag", "noindex");\n');
        const file = join(temporary, "lib/second-decider.ts");
        write("lib/second-decider.ts", 'export const bad = (r: Response) => r.headers.set("X-Robots-Tag", "noindex");\n');
        expect(findRobotsDeciders(readTree(temporary))).toEqual([
          `${relative(temporary, file)}: X-Robots-Tag header`,
        ]);
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
      expect(existsSync(temporary)).toBe(false);
      expect(findRobotsDeciders(readTree())).toEqual([]);
    });
  });
});
