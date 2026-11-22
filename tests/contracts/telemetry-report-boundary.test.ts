import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// TELEMETRY-05: the monthly sponsor report runs as the signed-in person. It reads only the daily rollup
// tables (plus the sponsor list, the schedule and the logo) through that person's own client, so it can
// never reach the service role or the raw page events, directly or through any module it imports.

const ROOT = resolve(process.cwd());
const REPORT_DATA = "lib/telemetry/report-data.ts";
const ENTRY_POINTS = ["app/admin/(protected)/insights/report/page.tsx", REPORT_DATA];
const FORBIDDEN = /supabase-service-role|SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient|service_role/;
const RAW_EVENTS = /page_events/;
const ALLOWED_TABLES = ["matches", "page_daily_totals", "site_branding", "site_sponsor_logos", "sponsor_daily_rollups"];
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
// Styles, images and fonts are imported for their side effects or URLs; they carry no module graph.
const ASSET = /\.(?:css|scss|sass|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null; // a package; packages are checked by the architecture scan's scope
  if (ASSET.test(specifier)) return null;
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

function names(files: Iterable<string>): string[] {
  return [...files].map((file) => relative(ROOT, file).replaceAll("\\", "/"));
}

describe("monthly sponsor report service-role and raw-events boundary", () => {
  it.each(ENTRY_POINTS)("%s never imports the service-role client or key, even transitively", async (entry) => {
    const graph = await importGraph(entry);
    const violations = [...graph].filter(([, source]) => FORBIDDEN.test(source)).map(([file]) => names([file])[0]);
    expect(violations).toEqual([]);
  });

  it.each(ENTRY_POINTS)("%s never touches the raw page events table, even transitively", async (entry) => {
    const graph = await importGraph(entry);
    const violations = [...graph].filter(([, source]) => RAW_EVENTS.test(source)).map(([file]) => names([file])[0]);
    expect(violations).toEqual([]);
  });

  it("walks the real report graph through the report data module", async () => {
    const graph = await importGraph(ENTRY_POINTS[0]);
    expect(names(graph.keys())).toEqual(
      expect.arrayContaining([ENTRY_POINTS[0], REPORT_DATA, "lib/club-time.ts", "lib/club-branding.ts"]),
    );
  });

  it("keeps the retention job and its service-role client out of the report's graph", async () => {
    for (const entry of ENTRY_POINTS) {
      const files = names((await importGraph(entry)).keys());
      expect(files, entry).not.toContain("lib/telemetry/retention.ts");
      expect(files, entry).not.toContain("lib/supabase-service-role.ts");
      expect(files, entry).not.toContain("app/api/cron/telemetry-retention/route.ts");
      expect(files, entry).not.toContain("app/api/t/route.ts");
    }
  });

  it("reads only the five allowed tables, and calls no database function", async () => {
    const source = await readFile(resolve(ROOT, REPORT_DATA), "utf8");
    const tables = [...source.matchAll(/\.from\(\s*"([^"]+)"/g)].map((match) => match[1]);
    expect([...new Set(tables)].sort()).toEqual(ALLOWED_TABLES);
    // Every read is a literal table name: no variable can smuggle in another one.
    expect(source.match(/\.from\(/g)?.length).toBe(tables.length);
    expect(source).not.toMatch(/\.rpc\(/);
  });

  it("scopes every read to the club and never writes", async () => {
    const source = await readFile(resolve(ROOT, REPORT_DATA), "utf8");
    // Each read runs from its .from( to the next one; the last is cut short so trailing code is not counted.
    const reads = source.split(/(?=\.from\()/).slice(1).map((read) => read.slice(0, 300));
    expect(reads).toHaveLength(7);
    for (const read of reads) expect(read, read.slice(0, 60)).toContain('.eq("club_id", clubId)');
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(source).not.toMatch(/createClient\(|createPublicClient\(|createServiceRoleClient\(/);
  });

  it("is safe for a client component to import: only type imports from supabase, no server-only modules", async () => {
    const source = await readFile(resolve(ROOT, REPORT_DATA), "utf8");
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["'];?$/gm)].map((match) => ({
      typeOnly: Boolean(match[1]),
      from: match[2],
    }));
    expect(imports.filter((entry) => entry.from.startsWith("@supabase/"))).toEqual([
      { typeOnly: true, from: "@supabase/supabase-js" },
    ]);
    expect(imports.map((entry) => entry.from).sort()).toEqual(["@/lib/club-branding", "@/lib/club-time", "@supabase/supabase-js"]);
    expect(source).not.toMatch(/next\/headers|server-only|process\.env\.SUPABASE/);
  });
});
