import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// TELEMETRY-04: the Sponsor Insights reader runs as the signed-in person under
// RLS. It must never reach the service-role client or key, never call an RPC,
// and read only the five rollup-related tables.

const ROOT = resolve(process.cwd());
const ENTRY = "lib/telemetry/insights-data.ts";
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
  throw new Error(`Unresolved local import ${specifier} from ${relative(ROOT, fromFile)}`);
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

describe("sponsor insights reader boundary", () => {
  it("never reaches the service-role client or key, even transitively", async () => {
    const graph = await importGraph(ENTRY);
    expect(graph.size).toBeGreaterThan(1);
    const violations = [...graph].filter(([, source]) => FORBIDDEN.test(source)).map(([file]) => relative(ROOT, file));
    expect(violations).toEqual([]);
  });

  it("walks the real graph: the reader and its math helpers", async () => {
    const files = [...(await importGraph(ENTRY)).keys()].map((file) => relative(ROOT, file).replaceAll("\\", "/"));
    expect(files).toEqual(expect.arrayContaining([ENTRY, "lib/telemetry/insights-math.ts", "lib/club-time.ts"]));
  });

  it("makes no RPC calls and reads exactly the five tables", async () => {
    const graph = await importGraph(ENTRY);
    const tables = new Set<string>();
    for (const source of graph.values()) {
      expect(source).not.toMatch(/\.rpc\(/);
      for (const match of source.matchAll(/\.from\(\s*"([^"]+)"/g)) tables.add(match[1]);
    }
    expect([...tables].sort()).toEqual([
      "matches",
      "page_daily_breakdowns",
      "page_daily_totals",
      "site_sponsor_logos",
      "sponsor_daily_rollups",
    ]);
  });

  it("only reads: no writes through the client", async () => {
    const source = await readFile(resolve(ROOT, ENTRY), "utf8");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});
