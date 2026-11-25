import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMIN-POSTHOG: PostHog runs in the classic /admin portal only. Public club
// sites (and the root layout every site shares) must never load posthog-js or
// the admin analytics wrapper, not even through a shared component.

const ROOT = process.cwd();
const WRAPPER = "lib/admin-analytics.ts";
const PROVIDER = "components/admin/AdminAnalyticsProvider.tsx";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir: string): string[] {
  return readdirSync(resolve(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(resolve(ROOT, path)).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return SOURCE_EXTENSIONS.includes(extname(path)) ? [path] : [];
  });
}

function specifiers(file: string): string[] {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? match[2] ?? match[3]);
}

function resolveLocal(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = relative(ROOT, resolve(ROOT, dirname(from), specifier));
  else return null;
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  return candidates.find((path) => existsSync(resolve(ROOT, path)) && statSync(resolve(ROOT, path)).isFile()) ?? null;
}

function isPostHog(specifier: string) {
  return specifier === "posthog-js" || specifier.startsWith("posthog-js/");
}

/** Returns the import chain from `entry` to posthog-js or the wrapper, or null. */
function forbiddenChain(entry: string, seen = new Set<string>()): string[] | null {
  const stack: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [entry] }];
  while (stack.length) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file === WRAPPER || file === PROVIDER) return chain;
    if (!SOURCE_EXTENSIONS.includes(extname(file))) continue;
    for (const specifier of specifiers(file)) {
      if (isPostHog(specifier)) return [...chain, specifier];
      const next = resolveLocal(file, specifier);
      if (next && !seen.has(next)) stack.push({ file: next, chain: [...chain, next] });
    }
  }
  return null;
}

const nonAdminAppFiles = walk("app").filter((file) => !file.startsWith(join("app", "admin") + "/"));
const publicEntries = ["app/layout.tsx", "middleware.ts", ...nonAdminAppFiles.filter((file) => file !== "app/layout.tsx")];

describe("ADMIN-POSTHOG analytics boundary", () => {
  it("covers the root layout and the public route tree", () => {
    expect(publicEntries).toContain("app/layout.tsx");
    expect(publicEntries.some((file) => file.startsWith("app/(public)/"))).toBe(true);
  });

  it("never reaches posthog-js or the admin analytics wrapper from the root layout or a public route", () => {
    // Shared across entries: a file already walked without a hit stays clean.
    const seen = new Set<string>();
    const violations = publicEntries
      .map((entry) => forbiddenChain(entry, seen))
      .filter((chain): chain is string[] => chain !== null)
      .map((chain) => chain.join(" -> "));
    expect(violations).toEqual([]);
  });

  it("imports posthog-js only from the wrapper", () => {
    const importers = [...walk("app"), ...walk("components"), ...walk("lib"), "middleware.ts"].filter((file) =>
      specifiers(file).some(isPostHog),
    );
    expect(importers).toEqual([WRAPPER]);
  });

  it("mounts the analytics provider only in the protected admin layout", () => {
    const mounts = [...walk("app"), ...walk("components")].filter(
      (file) => file !== PROVIDER && /<AdminAnalyticsProvider\b/.test(readFileSync(resolve(ROOT, file), "utf8")),
    );
    expect(mounts).toEqual(["app/admin/(protected)/layout.tsx"]);
  });
});
