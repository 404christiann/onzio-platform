import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// TELEMETRY-04: the Insights page never reaches the service-role client.

const ROOT = resolve(process.cwd());
const FORBIDDEN = /supabase-service-role|SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient|service_role/;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null; // CSS modules and other assets
}

async function importGraph(entry: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = await readFile(file, "utf8");
    seen.set(file, source);
    const specifiers = [
      ...source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g),
      ...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      const next = resolveLocal(specifier, file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

describe("insights import graph", () => {
  it.each([
    "app/admin/(protected)/insights/page.tsx",
    "app/admin/(protected)/insights/report/page.tsx",
    "lib/telemetry/insights-data.ts",
  ])("%s never reaches the service-role client or key", async (entry) => {
    const graph = await importGraph(entry);
    expect([...graph].filter(([, source]) => FORBIDDEN.test(source)).map(([file]) => rel(file))).toEqual([]);
  });
});
